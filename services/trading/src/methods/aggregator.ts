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

export const LOOKBACK: Record<string, number> = {
	"5m": 144,
	"1h": 120,
	"4h": 180,
	"1d": 130,
	"1w": 160,
};

const pendingBars = new Map<string, AggBar>();

/**
 * 5分足確定時に呼ばれ、上位足の集約と確定判定を行う。
 * 上位足はメモリ上で集約するのみ（DB保存しない）。
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

/**
 * DBの5分足から指定timeframeのローソク足を集約して返す。
 * 5分足以外はDB保存せず、都度計算する。
 */
export async function fetchCandles(symbol: string, timeframe: string): Promise<Candle[]> {
	if (timeframe === "5m") {
		const limit = LOOKBACK["5m"];
		const rows = await db
			.select()
			.from(candles)
			.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, "5m")))
			.orderBy(desc(candles.timestamp))
			.limit(limit);

		return rows.reverse().map((r) => ({
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			timestamp: r.timestamp.toISOString(),
		}));
	}

	// 上位足: 5分足から集約
	const intervalMs = TIMEFRAME_MS[timeframe];
	if (!intervalMs) return [];

	const lookback = LOOKBACK[timeframe] ?? 100;
	// 必要な5分足の本数 = 上位足本数 × (上位足の分数 / 5分)
	const fiveMinBars = lookback * (intervalMs / TIMEFRAME_MS["5m"]) + 48; // マージン
	const rows = await db
		.select()
		.from(candles)
		.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, "5m")))
		.orderBy(desc(candles.timestamp))
		.limit(fiveMinBars);

	const sorted = rows.reverse();
	if (sorted.length === 0) return [];

	// 5分足を上位足に集約
	const aggMap = new Map<number, { open: number; high: number; low: number; close: number; timestamp: Date }>();

	for (const row of sorted) {
		const t = row.timestamp.getTime();
		const intervalStart = t - (t % intervalMs);

		const existing = aggMap.get(intervalStart);
		if (!existing) {
			aggMap.set(intervalStart, {
				open: Number(row.open),
				high: Number(row.high),
				low: Number(row.low),
				close: Number(row.close),
				timestamp: new Date(intervalStart),
			});
		} else {
			existing.high = Math.max(existing.high, Number(row.high));
			existing.low = Math.min(existing.low, Number(row.low));
			existing.close = Number(row.close);
		}
	}

	return Array.from(aggMap.values())
		.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
		.slice(-lookback)
		.map((c) => ({
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
			timestamp: c.timestamp.toISOString(),
		}));
}
