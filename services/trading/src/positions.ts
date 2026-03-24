import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { trades } from "./db/schema.js";
import { mt5Bridge } from "./broker/mt5-bridge.js";
import { sendDiscordNotification } from "@trader/notify";
import { broadcast } from "./ws/server.js";

interface OpenPosition {
	id: string;
	symbol: string;
	position: string;
	exposure: string;
	entryPrice: string | null;
	takeProfitPrice: string | null;
	stopLossPrice: string | null;
	brokerOrder: string | null;
	isDemo: boolean;
}

const openPositions = new Map<string, OpenPosition>();

async function loadOpenPositions() {
	const rows = await db
		.select()
		.from(trades)
		.where(eq(trades.status, "open"));

	for (const row of rows) {
		openPositions.set(row.id, {
			id: row.id,
			symbol: row.symbol,
			position: row.position,
			exposure: row.exposure,
			entryPrice: row.entryPrice,
			takeProfitPrice: row.takeProfitPrice,
			stopLossPrice: row.stopLossPrice,
			brokerOrder: row.brokerOrder,
			isDemo: row.isDemo,
		});
	}

	console.log(`Loaded ${openPositions.size} open positions`);
}

function addPosition(pos: OpenPosition) {
	openPositions.set(pos.id, pos);
}

function removePosition(id: string) {
	openPositions.delete(id);
}

function getOpenPositions(): OpenPosition[] {
	return [...openPositions.values()];
}

async function checkStopLossTakeProfit(symbol: string, bid: number, ask: number) {
	for (const pos of openPositions.values()) {
		if (pos.symbol !== symbol) continue;
		if (!pos.brokerOrder) continue;

		const slPrice = pos.stopLossPrice ? Number(pos.stopLossPrice) : null;
		const tpPrice = pos.takeProfitPrice ? Number(pos.takeProfitPrice) : null;

		// long: bid で損益判定（売り値）, short: ask で損益判定（買い値）
		const currentPrice = pos.position === "long" ? bid : ask;

		let triggered: "sl" | "tp" | null = null;

		if (slPrice !== null) {
			if (pos.position === "long" && currentPrice <= slPrice) triggered = "sl";
			if (pos.position === "short" && currentPrice >= slPrice) triggered = "sl";
		}

		if (tpPrice !== null) {
			if (pos.position === "long" && currentPrice >= tpPrice) triggered = "tp";
			if (pos.position === "short" && currentPrice <= tpPrice) triggered = "tp";
		}

		if (!triggered) continue;

		console.log(`${triggered.toUpperCase()} triggered for ${pos.id} (${pos.symbol} ${pos.position}) at ${currentPrice}`);

		try {
			const result = await mt5Bridge.closePosition(pos.brokerOrder);
			if (!result.success) {
				console.error(`Failed to close position ${pos.id}:`, result.error);
				continue;
			}

			const exitPrice = result.price ?? String(currentPrice);
			const entryPrice = Number(pos.entryPrice ?? 0);
			const exposure = Number(pos.exposure);
			const priceDiff = pos.position === "long"
				? Number(exitPrice) - entryPrice
				: entryPrice - Number(exitPrice);
			const profitLoss = priceDiff * exposure;

			const [updated] = await db
				.update(trades)
				.set({
					status: "exited",
					exitPrice,
					profitLoss: String(profitLoss),
					exitAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(trades.id, pos.id))
				.returning();

			removePosition(pos.id);

			broadcast({
				type: "position",
				tradeId: pos.id,
				status: "exited",
				symbol: pos.symbol,
				position: pos.position,
				exitPrice,
				profitLoss: String(profitLoss),
			});

			const emoji = triggered === "tp" ? "💰" : "🛑";
			const label = triggered === "tp" ? "利確" : "損切り";
			await sendDiscordNotification({
				content: `${emoji} ${label}: ${pos.symbol} ${pos.position} @ ${exitPrice} (P/L: ${profitLoss >= 0 ? "+" : ""}${Math.round(profitLoss).toLocaleString()}円)`,
				channel: "trade",
			});
		} catch (err) {
			console.error(`Error executing ${triggered} for ${pos.id}:`, err);
		}
	}
}

export const positionCache = {
	loadOpenPositions,
	addPosition,
	removePosition,
	getOpenPositions,
	checkStopLossTakeProfit,
};
