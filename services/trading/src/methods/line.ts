import type { Candle } from "./types.js";

interface Point {
	price: number;
	type: "peak" | "trough";
	index: number;
}

export interface Line {
	price: number;
	type: "peak" | "trough";
}

/**
 * 山・谷を検出する。
 * 前後2本と比較して反発した点を検出。
 * 2本以内に同種が隣接する場合、絶対値がより大きい方のみ残す。
 */
function detectPoints(candles: Candle[]): Point[] {
	const points: Point[] = [];

	for (let i = 2; i < candles.length - 2; i++) {
		const curr = candles[i];
		const prevLows = [candles[i - 2].low, candles[i - 1].low];
		const nextLows = [candles[i + 1].low, candles[i + 2].low];
		const prevHighs = [candles[i - 2].high, candles[i - 1].high];
		const nextHighs = [candles[i + 1].high, candles[i + 2].high];

		if (curr.low < Math.min(...prevLows) && curr.low < Math.min(...nextLows)) {
			points.push({ price: curr.low, type: "trough", index: i });
		}

		if (curr.high > Math.max(...prevHighs) && curr.high > Math.max(...nextHighs)) {
			points.push({ price: curr.high, type: "peak", index: i });
		}
	}

	return deduplicateNearby(points);
}

/**
 * 2本以内に同種が隣接する場合、絶対値がより大きい方のみ残す。
 */
function deduplicateNearby(points: Point[]): Point[] {
	const result: Point[] = [];

	for (const point of points) {
		const last = result[result.length - 1];
		if (!last || last.type !== point.type || point.index - last.index > 2) {
			result.push(point);
			continue;
		}

		if (point.type === "peak" && point.price > last.price) {
			result[result.length - 1] = point;
		} else if (point.type === "trough" && point.price < last.price) {
			result[result.length - 1] = point;
		}
	}

	return result;
}

/**
 * 現在価格から上下それぞれ最も近い山・谷を3本ずつ返す。
 */
export function findLines(currentPrice: number, candles: Candle[]): { upper: Line[]; lower: Line[] } {
	const points = detectPoints(candles);

	const upper = points
		.filter((p) => p.price > currentPrice)
		.sort((a, b) => a.price - b.price)
		.slice(0, 3)
		.map(({ price, type }) => ({ price, type }));

	const lower = points
		.filter((p) => p.price < currentPrice)
		.sort((a, b) => b.price - a.price)
		.slice(0, 3)
		.map(({ price, type }) => ({ price, type }));

	return { upper, lower };
}

/**
 * 全ての山・谷を返す（pivot_updateで使用）。
 */
export function detectAllPoints(candles: Candle[]): { peaks: number[]; troughs: number[] } {
	const points = detectPoints(candles);
	return {
		peaks: points.filter((p) => p.type === "peak").map((p) => p.price),
		troughs: points.filter((p) => p.type === "trough").map((p) => p.price),
	};
}
