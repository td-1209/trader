import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
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
		// Invalid stops (10016) はTP/SLが近すぎるだけなので黙ってスキップ
		if (result.error?.includes("10016")) {
			console.log(`MT5 bridge skipped (invalid stops): ${result.error} (command: ${result.commandId})`);
		} else {
			console.error(`MT5 bridge error: ${result.error} (command: ${result.commandId})`);
			sendDiscordNotification({
				content: `⚠️ MT5注文エラー: ${result.error}`,
				channel: "alert",
			});
		}
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

interface ClosedDeal {
	ticket: string;
	positionId: string;
	symbol: string;
	price: string;
	profit: string;
	volume: number;
	time: number;
}

// MT5 EAが毎回ポジションを同期するエンドポイント
app.post("/bridge/sync", async (c) => {
	const body = (await c.req.json()) as {
		positions: Array<{ ticket: string; symbol: string; position: string; volume: number; openPrice: string; profit: string }>;
		closedDeals?: ClosedDeal[];
	};

	const currentTickets = new Set(body.positions.map((p) => p.ticket));

	// 決済履歴があれば処理（新規決済の記録 + 未記録データの補完）
	if (body.closedDeals && body.closedDeals.length > 0) {
		await processClosedDeals(body.closedDeals);
		await backfillMissingExitData(body.closedDeals);
	}

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

// 決済済みdealのチケットを記録（重複処理防止）
const processedDeals = new Set<string>();

/**
 * 起動時に、exitedだがexitPrice/profitLossが未記録のトレードを検出し、
 * MT5の取引履歴から補完する。
 */
async function backfillMissingExitData(deals: ClosedDeal[]) {
	const incompleteTrades = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.status, "exited"),
			),
		);

	for (const trade of incompleteTrades) {
		if (trade.exitPrice && trade.profitLoss) continue; // 既に記録済み

		// brokerOrderでマッチする決済履歴を探す
		const matchingDeal = deals.find((d) => d.positionId === trade.brokerOrder);
		if (!matchingDeal) continue;

		console.log(`Backfill: trade ${trade.id} (${trade.brokerOrder}) → exit@${matchingDeal.price} P/L:${matchingDeal.profit}`);

		await db.update(trades).set({
			exitPrice: matchingDeal.price,
			profitLoss: matchingDeal.profit,
			exitAt: new Date(matchingDeal.time * 1000),
			resultDescription: Number(matchingDeal.profit) >= 0 ? "take_profit" : "stop_loss",
		}).where(eq(trades.id, trade.id));
	}
}

/**
 * MT5の決済履歴からDBのトレードを更新する。
 * exitPrice, profitLoss, exitAtを正確に記録する。
 */
async function processClosedDeals(deals: ClosedDeal[]) {
	for (const deal of deals) {
		if (processedDeals.has(deal.ticket)) continue;
		processedDeals.add(deal.ticket);

		// positionIdでDBのトレードを検索（brokerOrderにはエントリー時のdealチケットが入っている）
		// MT5のpositionIdはエントリー時のdealチケットと一致する
		const dbTrade = await db
			.select()
			.from(trades)
			.where(
				and(
					eq(trades.status, "open"),
					eq(trades.brokerOrder, deal.positionId),
				),
			);

		if (dbTrade.length === 0) continue;

		const trade = dbTrade[0];
		const exitPrice = Number(deal.price);
		const profitLoss = Number(deal.profit);
		const exitAt = new Date(deal.time * 1000);

		console.log(`Closed deal: ${trade.symbol} ${trade.position} exit@${exitPrice} P/L:${profitLoss} at ${exitAt.toISOString()}`);

		await db.update(trades).set({
			status: "exited",
			exitPrice: deal.price,
			profitLoss: String(profitLoss),
			exitAt,
			resultDescription: profitLoss >= 0 ? "take_profit" : "stop_loss",
		}).where(eq(trades.id, trade.id));

		sendDiscordNotification({
			content: `💰 決済: ${trade.symbol} ${trade.position} @ ${exitPrice}\nP/L: ${profitLoss >= 0 ? "+" : ""}${profitLoss}円`,
			channel: "trade",
		});
	}
}

/**
 * MT5のポジションとDBのopenトレードを突合し、不整合を検出・修正する。
 * processClosedDealsで処理済みのものはスキップ。
 */
async function reconcilePositions(mt5Positions: Array<{ ticket: string; symbol: string; position: string; profit: string }>) {
	const dbOpenTrades = await db
		.select()
		.from(trades)
		.where(eq(trades.status, "open"));

	const mt5Tickets = new Set(mt5Positions.map((p) => p.ticket));
	const dbTickets = new Set(dbOpenTrades.filter((t) => t.brokerOrder).map((t) => t.brokerOrder));

	// DBにあるがMT5にない → 決済済み（closedDealsで処理されなかった分のフォールバック）
	for (const trade of dbOpenTrades) {
		if (trade.brokerOrder && !mt5Tickets.has(trade.brokerOrder)) {
			console.log(`Reconcile fallback: trade ${trade.id} (${trade.brokerOrder}) closed on MT5`);
			await db.update(trades).set({
				status: "exited",
				exitAt: new Date(),
				resultDescription: "MT5側で決済済み（突合で検出、決済詳細不明）",
			}).where(eq(trades.id, trade.id));

			sendDiscordNotification({
				content: `🔄 突合: ${trade.symbol} ${trade.position} がMT5側で決済済み（決済詳細不明）`,
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
