import { desc, eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles } from "../db/schema.js";
import type { Candle } from "./types.js";

interface AggBar {
	open: number;
	high: number;
	low: number;
	close: number;
	startTime: Date;
}

const TIMEFRAME_MS: Record<string, number> = {
	"5m": 5 * 60 * 1000,
	"1h": 60 * 60 * 1000,
	"4h": 4 * 60 * 60 * 1000,
	"1d": 24 * 60 * 60 * 1000,
	"1w": 7 * 24 * 60 * 60 * 1000,
};

const LOOKBACK: Record<string, number> = {
	"5m": 144,
	"1h": 120,
	"4h": 180,
	"1d": 130,
	"1w": 160,
};

const pendingBars = new Map<string, AggBar>();

/**
 * 5分足確定時に呼ばれ、上位足の集約と確定判定を行う。
 * 確定した足の(symbol, timeframe)を返す。
 */
export function onFiveMinuteClose(symbol: string, bar: { open: number; high: number; low: number; close: number; timestamp: Date }): { symbol: string; timeframe: string }[] {
	const confirmed: { symbol: string; timeframe: string }[] = [];
	const barTime = bar.timestamp.getTime();

	// 5分足自体も確定
	confirmed.push({ symbol, timeframe: "5m" });

	for (const tf of ["1h", "4h", "1d", "1w"]) {
		const intervalMs = TIMEFRAME_MS[tf];
		const intervalStart = barTime - (barTime % intervalMs);
		const key = `${symbol}:${tf}`;
		const existing = pendingBars.get(key);

		if (!existing || existing.startTime.getTime() !== intervalStart) {
			// 新しい区間 → 前の区間が確定
			if (existing) {
				persistAggCandle(symbol, tf, existing);
				confirmed.push({ symbol, timeframe: tf });
			}
			pendingBars.set(key, {
				open: bar.open,
				high: bar.high,
				low: bar.low,
				close: bar.close,
				startTime: new Date(intervalStart),
			});
		} else {
			existing.high = Math.max(existing.high, bar.high);
			existing.low = Math.min(existing.low, bar.low);
			existing.close = bar.close;
		}
	}

	return confirmed;
}

async function persistAggCandle(symbol: string, timeframe: string, bar: AggBar) {
	try {
		await db
			.insert(candles)
			.values({
				symbol,
				timeframe,
				open: String(bar.open),
				high: String(bar.high),
				low: String(bar.low),
				close: String(bar.close),
				timestamp: bar.startTime,
			})
			.onConflictDoNothing();
	} catch (err) {
		console.error(`Failed to persist ${timeframe} candle:`, err);
	}
}

/**
 * DBから指定symbol/timeframeのローソク足を取得する。
 */
export async function fetchCandles(symbol: string, timeframe: string): Promise<Candle[]> {
	const limit = LOOKBACK[timeframe] ?? 100;
	const rows = await db
		.select()
		.from(candles)
		.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, timeframe)))
		.orderBy(desc(candles.timestamp))
		.limit(limit);

	return rows
		.reverse()
		.map((r) => ({
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			timestamp: r.timestamp.toISOString(),
		}));
}
