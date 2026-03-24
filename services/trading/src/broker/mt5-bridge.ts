import { Hono } from "hono";
import { sendDiscordNotification } from "@trader/notify";

interface BridgeCommand {
	id: string;
	action: "order" | "close";
	symbol?: string;
	position?: string;
	volume?: number;
	ticket?: string;
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

// MT5 EAが起動時にポジションを同期するエンドポイント
app.post("/bridge/sync", async (c) => {
	const body = await c.req.json();
	console.log("MT5 position sync:", JSON.stringify(body));
	return c.json({ ok: true });
});

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

async function placeOrder(symbol: string, position: string, volume: number): Promise<BridgeResult> {
	return sendCommand({ action: "order", symbol, position, volume });
}

async function closePosition(ticket: string): Promise<BridgeResult> {
	return sendCommand({ action: "close", ticket });
}

function isConnected(): boolean {
	// EAがポーリングしているかどうかで判断（将来的にheartbeatで判定）
	return true;
}

export const mt5Bridge = { placeOrder, closePosition, isConnected };
export { app as bridgeRoutes };
