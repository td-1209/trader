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

	const period = 3;
	const half = Math.floor(period / 2);

	// 山検出用: highのSMA
	const smaHigh: number[] = [];
	// 谷検出用: lowのSMA
	const smaLow: number[] = [];
	for (let i = 0; i < candles.length; i++) {
		if (i < half || i >= candles.length - half) {
			smaHigh.push(candles[i].high);
			smaLow.push(candles[i].low);
		} else {
			let sumH = 0;
			let sumL = 0;
			for (let j = i - half; j <= i + half; j++) {
				sumH += candles[j].high;
				sumL += candles[j].low;
			}
			smaHigh.push(sumH / period);
			smaLow.push(sumL / period);
		}
	}

	// SMAの極値を検出、ラインは前後1本を含む最大high/最小low
	for (let i = 1; i < candles.length - 1; i++) {
		if (smaHigh[i - 1] < smaHigh[i] && smaHigh[i] > smaHigh[i + 1]) {
			const maxHigh = Math.max(candles[i - 1].high, candles[i].high, candles[i + 1].high);
			points.push({ price: maxHigh, type: "peak", index: i });
		}
		if (smaLow[i - 1] > smaLow[i] && smaLow[i] < smaLow[i + 1]) {
			const minLow = Math.min(candles[i - 1].low, candles[i].low, candles[i + 1].low);
			points.push({ price: minLow, type: "trough", index: i });
		}
	}

	const peaks = deduplicateNearby(points.filter((p) => p.type === "peak"));
	const troughs = deduplicateNearby(points.filter((p) => p.type === "trough"));
	return [...peaks, ...troughs];
}

/**
 * 10本以内に同種が隣接する場合、絶対値がより大きい方のみ残す。
 */
function deduplicateNearby(points: Point[]): Point[] {
	const result: Point[] = [];

	for (const point of points) {
		const last = result[result.length - 1];
		if (!last || last.type !== point.type || point.index - last.index > 10) {
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

	const priceRange = Math.max(...candles.map((c) => c.high)) - Math.min(...candles.map((c) => c.low));
	const clusterThreshold = priceRange * 0.04;

	// 上: 現在価格より上の山（レジスタンス）→ クラスタリング
	const upperRaw = points
		.filter((p) => p.type === "peak" && p.price > currentPrice)
		.sort((a, b) => a.price - b.price);
	const upper = clusterLines(upperRaw, clusterThreshold, "peak")
		.map(({ price, type }) => ({ price, type }));

	// 下: 現在価格より下の谷（サポート）→ クラスタリング
	const lowerRaw = points
		.filter((p) => p.type === "trough" && p.price < currentPrice)
		.sort((a, b) => b.price - a.price);
	const lower = clusterLines(lowerRaw, clusterThreshold, "trough")
		.map(({ price, type }) => ({ price, type }));

	return { upper, lower };
}

/**
 * 一定距離以内のラインをクラスタリングし、代表値を返す。
 * 山: グループ内の最高値、谷: グループ内の最安値
 */
function clusterLines(points: Point[], threshold: number, type: "peak" | "trough"): Point[] {
	const result: Point[] = [];

	for (const point of points) {
		const last = result[result.length - 1];
		if (last && Math.abs(point.price - last.price) <= threshold) {
			// 同クラスタ: 山なら高い方、谷なら低い方を採用
			if (type === "peak" && point.price > last.price) {
				result[result.length - 1] = point;
			} else if (type === "trough" && point.price < last.price) {
				result[result.length - 1] = point;
			}
		} else {
			result.push(point);
		}
	}

	return result;
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
