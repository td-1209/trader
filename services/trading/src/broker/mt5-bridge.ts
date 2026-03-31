import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { sendDiscordNotification } from "@trader/notify";
import { db } from "../db/client.js";
import { trades } from "../db/schema.js";

interface BridgeCommand {
	id: string;
	action: "order" | "close";
	symbol?: string;
	position?: string;
	volume?: number;
	ticket?: string;
	tp?: number;
	sl?: number;
}

interface BridgeResult {
	commandId: string;
	success: boolean;
	error?: string;
	ticket?: string;
	price?: string;
	profit?: string;
}

const pendingCommands: BridgeCommand[] = [];
const resultCallbacks = new Map<string, (result: BridgeResult) => void>();

const app = new Hono();

// MT5 EAがポーリングするエンドポイント
app.get("/bridge/commands", (c) => {
	const commands = [...pendingCommands];
	pendingCommands.length = 0;
	return c.json({ commands });
});

// MT5 EAが結果を返すエンドポイント
app.post("/bridge/results", async (c) => {
	const result = (await c.req.json()) as BridgeResult;

	if (!result.success) {
		console.error(`MT5 bridge error: ${result.error} (command: ${result.commandId})`);
		sendDiscordNotification({
			content: `⚠️ MT5注文エラー: ${result.error}`,
			channel: "alert",
		});
	}

	const callback = resultCallbacks.get(result.commandId);
	if (callback) {
		callback(result);
		resultCallbacks.delete(result.commandId);
	}
	return c.json({ ok: true });
});

// 前回のMT5ポジション一覧（差分検出用）
let lastMt5Tickets: Set<string> | null = null;

// MT5 EAが毎回ポジションを同期するエンドポイント
app.post("/bridge/sync", async (c) => {
	const body = (await c.req.json()) as {
		positions: Array<{ ticket: string; symbol: string; position: string; volume: number; openPrice: string; profit: string }>;
	};

	const currentTickets = new Set(body.positions.map((p) => p.ticket));

	// 初回または変化があった場合のみ突合
	if (lastMt5Tickets === null || !setsEqual(currentTickets, lastMt5Tickets)) {
		console.log(`MT5 sync: ${body.positions.length} positions (changed)`);
		await reconcilePositions(body.positions);
	}
	lastMt5Tickets = currentTickets;

	return c.json({ ok: true });
});

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

// trading serviceから呼ぶ関数
function sendCommand(command: Omit<BridgeCommand, "id">): Promise<BridgeResult> {
	const id = crypto.randomUUID();
	const cmd: BridgeCommand = { id, ...command };

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			resultCallbacks.delete(id);
			reject(new Error("MT5 bridge timeout"));
		}, 30_000);

		resultCallbacks.set(id, (result) => {
			clearTimeout(timeout);
			resolve(result);
		});

		pendingCommands.push(cmd);
	});
}

async function placeOrder(symbol: string, position: string, volume: number, tp?: number, sl?: number): Promise<BridgeResult> {
	return sendCommand({ action: "order", symbol, position, volume, tp, sl });
}

async function closePosition(ticket: string): Promise<BridgeResult> {
	return sendCommand({ action: "close", ticket });
}

function isConnected(): boolean {
	// EAがポーリングしているかどうかで判断（将来的にheartbeatで判定）
	return true;
}

/**
 * MT5のポジションとDBのopenトレードを突合し、不整合を検出・修正する。
 * - DBにあるがMT5にない → MT5側で決済済み。DBをexitedに更新。
 * - MT5にあるがDBにない → 手動注文等。ログ出力のみ。
 */
async function reconcilePositions(mt5Positions: Array<{ ticket: string; symbol: string; position: string; profit: string }>) {
	const dbOpenTrades = await db
		.select()
		.from(trades)
		.where(eq(trades.status, "open"));

	const mt5Tickets = new Set(mt5Positions.map((p) => p.ticket));
	const dbTickets = new Set(dbOpenTrades.filter((t) => t.brokerOrder).map((t) => t.brokerOrder));

	// DBにあるがMT5にない → 決済済み
	for (const trade of dbOpenTrades) {
		if (trade.brokerOrder && !mt5Tickets.has(trade.brokerOrder)) {
			console.log(`Reconcile: trade ${trade.id} (${trade.brokerOrder}) closed on MT5, updating DB`);
			await db.update(trades).set({
				status: "exited",
				exitAt: new Date(),
				resultDescription: "MT5側で決済済み（突合で検出）",
			}).where(eq(trades.id, trade.id));

			sendDiscordNotification({
				content: `🔄 突合: ${trade.symbol} ${trade.position} がMT5側で決済済み（DB更新）`,
				channel: "trade",
			});
		}
	}

	// MT5にあるがDBにない
	for (const pos of mt5Positions) {
		if (!dbTickets.has(pos.ticket)) {
			console.log(`Reconcile: MT5 position ${pos.ticket} (${pos.symbol}) not in DB`);
		}
	}
}

export const mt5Bridge = { placeOrder, closePosition, isConnected };
export { app as bridgeRoutes };
