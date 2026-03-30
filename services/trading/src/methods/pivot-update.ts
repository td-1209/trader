import type { Candle, Method, Signal } from "./types.js";
import { findLines } from "./line.js";

/**
 * pivot_update: 最近接の山/谷を終値が更新した場合にエントリーする。
 * - 終値 > 最近接の山（レジスタンス） → long
 * - 終値 < 最近接の谷（サポート）     → short
 */
function execute(symbol: string, timeframe: string, candles: Candle[]): Signal | null {
	if (candles.length < 5) return null;

	const currentCandle = candles[candles.length - 1];
	const previousCandles = candles.slice(0, -1);
	const closePrice = currentCandle.close;

	// 1. 山・谷の検出（クラスタリング済み）
	const { upper, lower } = findLines(closePrice, previousCandles);

	// 最近接の山・谷を取得
	const nearestPeak = upper[0]; // 現在価格より上で最も近い山
	const nearestTrough = lower[0]; // 現在価格より下で最も近い谷

	if (!nearestPeak && !nearestTrough) return null;

	// 2. 更新判定：前足の終値と比較して、今足で突破したか
	const prevClose = previousCandles[previousCandles.length - 1]?.close;
	if (prevClose == null) return null;

	let direction: "long" | "short" | null = null;

	if (nearestPeak && prevClose <= nearestPeak.price && closePrice > nearestPeak.price) {
		direction = "long";
	} else if (nearestTrough && prevClose >= nearestTrough.price && closePrice < nearestTrough.price) {
		direction = "short";
	}

	if (!direction) return null;

	// 3. TP/SLの算出
	let takeProfitPrice: number;
	let stopLossPrice: number;

	if (direction === "long") {
		// TP: 次の山（2番目に近い山）、なければ突破した山からの等距離
		takeProfitPrice = upper[1]?.price
			?? closePrice + (closePrice - (lower[0]?.price ?? closePrice));
		// SL: 最近接の谷
		stopLossPrice = lower[0]?.price ?? closePrice;
	} else {
		// TP: 次の谷（2番目に近い谷）、なければ突破した谷からの等距離
		takeProfitPrice = lower[1]?.price
			?? closePrice - ((upper[0]?.price ?? closePrice) - closePrice);
		// SL: 最近接の山
		stopLossPrice = upper[0]?.price ?? closePrice;
	}

	// 4. RRチェック
	const reward = Math.abs(closePrice - takeProfitPrice);
	const risk = Math.abs(closePrice - stopLossPrice);
	if (risk === 0 || reward / risk <= 1.0) return null;

	return {
		position: direction,
		entryPrice: closePrice,
		takeProfitPrice,
		stopLossPrice,
		reason: `${timeframe}足 ${direction === "long" ? "レジスタンス" : "サポート"}突破（RR: ${(reward / risk).toFixed(2)}）`,
		upperLines: upper,
		lowerLines: lower,
	};
}

export const pivotUpdate: Method = { name: "pivot_update", execute };
