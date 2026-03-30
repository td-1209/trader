import { db } from "../db/client.js";
import { candles } from "../db/schema.js";
import { broadcast } from "./server.js";
import { onCandleClose } from "../methods/orchestrator.js";

interface Bar {
	open: number;
	high: number;
	low: number;
	close: number;
	startTime: number;
}

const INTERVAL_MS = 5 * 60 * 1000;
const bars = new Map<string, Bar>();

function getIntervalStart(timestamp: string): number {
	const t = new Date(timestamp).getTime();
	return t - (t % INTERVAL_MS);
}

function onTick(symbol: string, price: number, timestamp: string) {
	const intervalStart = getIntervalStart(timestamp);
	const key = `${symbol}:${intervalStart}`;
	const existing = bars.get(key);

	if (!existing) {
		flushPreviousBar(symbol, intervalStart);
		bars.set(key, { open: price, high: price, low: price, close: price, startTime: intervalStart });
	} else {
		existing.high = Math.max(existing.high, price);
		existing.low = Math.min(existing.low, price);
		existing.close = price;
	}
}

function flushPreviousBar(symbol: string, currentIntervalStart: number) {
	const prevStart = currentIntervalStart - INTERVAL_MS;
	const prevKey = `${symbol}:${prevStart}`;
	const bar = bars.get(prevKey);
	if (!bar) return;

	bars.delete(prevKey);
	persistCandle(symbol, bar);
}

async function persistCandle(symbol: string, bar: Bar) {
	const timestamp = new Date(bar.startTime);

	try {
		await db
			.insert(candles)
			.values({
				symbol,
				timeframe: "5m",
				open: String(bar.open),
				high: String(bar.high),
				low: String(bar.low),
				close: String(bar.close),
				timestamp,
			})
			.onConflictDoNothing();

		broadcast({
			type: "candle",
			symbol,
			timeframe: "5m",
			open: String(bar.open),
			high: String(bar.high),
			low: String(bar.low),
			close: String(bar.close),
			timestamp: timestamp.toISOString(),
		});

		console.log(`Candle persisted: ${symbol} ${timestamp.toISOString()}`);

		// オーケストレーター: 上位足集約 + 手法実行
		onCandleClose(symbol, { open: bar.open, high: bar.high, low: bar.low, close: bar.close, timestamp }).catch(
			(err) => console.error("Method orchestrator error:", err),
		);
	} catch (err) {
		console.error("Failed to persist candle:", err);
	}
}

export const ohlcAggregator = { onTick };
