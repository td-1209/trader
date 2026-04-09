import type { Candle, Method, Signal } from "./types.js";
import { findLines } from "./line.js";

/**
 * pivot_update: 最近接の山/谷を終値が突破した場合にエントリーする。
 * ラインの上下分離は前足の終値を基準に行い、現在足の終値で突破判定する。
 */
function execute(symbol: string, timeframe: string, candles: Candle[]): Signal | null {
	if (candles.length < 5) return null;

	const currentCandle = candles[candles.length - 1];
	const previousCandles = candles.slice(0, -1);
	const closePrice = currentCandle.close;
	const prevClose = previousCandles[previousCandles.length - 1]?.close;
	if (prevClose == null) return null;

	// 前足の終値を基準にライン検出（上下分離もprevClose基準）
	const { upper, lower, rawUpper, rawLower } = findLines(prevClose, previousCandles);

	const nearestPeak = rawUpper[0];
	const nearestTrough = rawLower[0];

	if (!nearestPeak && !nearestTrough) return null;

	// 突破判定：prevCloseはライン以内、closePriceがラインを超えたか
	let direction: "long" | "short" | null = null;

	if (nearestPeak && prevClose <= nearestPeak.price && closePrice > nearestPeak.price) {
		direction = "long";
	} else if (nearestTrough && prevClose >= nearestTrough.price && closePrice < nearestTrough.price) {
		direction = "short";
	}

	if (!direction) return null;
	let takeProfitPrice: number;
	let stopLossPrice: number;

	if (direction === "long") {
		takeProfitPrice = upper[1]?.price
			?? closePrice + (closePrice - (lower[0]?.price ?? closePrice));
		stopLossPrice = lower[0]?.price ?? closePrice;
	} else {
		takeProfitPrice = lower[1]?.price
			?? closePrice - ((upper[0]?.price ?? closePrice) - closePrice);
		stopLossPrice = upper[0]?.price ?? closePrice;
	}

	// RRチェック
	const reward = Math.abs(closePrice - takeProfitPrice);
	const risk = Math.abs(closePrice - stopLossPrice);
	const rr = risk > 0 ? reward / risk : 0;
	const rrRejected = risk === 0 || rr <= 2.0;

	return {
		position: direction,
		entryPrice: closePrice,
		takeProfitPrice,
		stopLossPrice,
		reason: rrRejected
			? `${timeframe}足 ${direction === "long" ? "レジスタンス" : "サポート"}突破（RR: ${rr.toFixed(2)} ≦ 1.0 見送り）`
			: `${timeframe}足 ${direction === "long" ? "レジスタンス" : "サポート"}突破（RR: ${rr.toFixed(2)}）`,
		upperLines: upper,
		lowerLines: lower,
		rrRejected,
		useLimit: true,
	};
}

export const pivotUpdate: Method = { name: "pivot_update", execute };
