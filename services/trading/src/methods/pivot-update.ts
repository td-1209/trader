import type { Candle, Method, Signal } from "./types.js";
import { detectAllPoints } from "./line.js";

/**
 * pivot_update: 最高安値を更新した場合に、山谷からTP/SLを決定しエントリーする。
 */
function execute(symbol: string, timeframe: string, candles: Candle[]): Signal | null {
	if (candles.length < 5) return null;

	// 最新足と過去足を分離
	const currentCandle = candles[candles.length - 1];
	const previousCandles = candles.slice(0, -1);

	// 1. 山・谷の検出
	const { peaks, troughs } = detectAllPoints(previousCandles);
	if (peaks.length === 0 || troughs.length === 0) return null;

	const maxPeak = Math.max(...peaks);
	const minTrough = Math.min(...troughs);
	const closePrice = currentCandle.close;

	// 2. 最高安値の更新判定
	let direction: "long" | "short" | null = null;
	if (closePrice > maxPeak) {
		direction = "long";
	} else if (closePrice < minTrough) {
		direction = "short";
	}

	if (!direction) return null;

	// 3. 利確/損切ラインの算出
	const allPoints = [...peaks, ...troughs];
	const abovePoints = allPoints.filter((p) => p > closePrice).sort((a, b) => a - b);
	const belowPoints = allPoints.filter((p) => p < closePrice).sort((a, b) => b - a);

	let takeProfitPrice: number;
	let stopLossPrice: number;

	if (direction === "long") {
		// 利確: entry_priceより上で最も近い山
		// 上方更新なのでmaxPeakを超えている → abovePointsが空の場合がある
		takeProfitPrice = abovePoints.length > 0
			? abovePoints[0]
			: closePrice + (closePrice - (belowPoints[0] ?? closePrice));
		stopLossPrice = belowPoints.length > 0
			? belowPoints[0]
			: closePrice;
	} else {
		// 利確: entry_priceより下で最も近い谷
		// 下方更新なのでminTroughを下回っている → belowPointsが空の場合がある
		takeProfitPrice = belowPoints.length > 0
			? belowPoints[0]
			: closePrice - ((abovePoints[0] ?? closePrice) - closePrice);
		stopLossPrice = abovePoints.length > 0
			? abovePoints[0]
			: closePrice;
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
		reason: `${timeframe}足 最${direction === "long" ? "高" : "安"}値更新（RR: ${(reward / risk).toFixed(2)}）`,
	};
}

export const pivotUpdate: Method = { name: "pivot_update", execute };
