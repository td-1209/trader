/**
 * 手法評価の純粋ロジック。本番オーケストレーターとバックテストの両方から呼ばれる。
 * DB・MT5・Discord等の副作用を持たない。
 */
import { pivotUpdate } from "./pivot-update.js";
import type { Candle, Method, Signal } from "./types.js";

const methodRegistry: Record<string, Method> = {
	pivot_update: pivotUpdate,
};

/** ロット計算 */
export const FIXED_LOT = 0.01; // 0.01 lot = 1000通貨

export interface EvalResult {
	signal: Signal;
	volume: number;
	tp: number | undefined;
	sl: number | undefined;
}

/**
 * 手法を評価してシグナルとロットを返す。
 * シグナルなし or RR不足の場合はnullを返す。
 */
export function evaluateMethod(
	methodName: string,
	symbol: string,
	timeframe: string,
	candles: Candle[],
): EvalResult | null {
	const impl = methodRegistry[methodName];
	if (!impl) return null;
	if (candles.length < 5) return null;

	const signal = impl.execute(symbol, timeframe, candles);
	if (!signal || signal.rrRejected) return null;

	return {
		signal,
		volume: FIXED_LOT,
		tp: signal.useLimit ? signal.takeProfitPrice : undefined,
		sl: signal.useLimit ? signal.stopLossPrice : undefined,
	};
}

/**
 * TP/SL判定。ポジションと現在のローソク足から決済判定する。
 * 悲観処理: 同一足でTP/SLの両方に触れた場合、SLを優先する（過剰評価を抑制）
 */
export function checkExit(
	position: string,
	entryPrice: number,
	takeProfitPrice: number,
	stopLossPrice: number,
	candle: Candle,
): { exitPrice: number; exitReason: string; profitLoss: number } | null {
	if (position === "long") {
		if (candle.low <= stopLossPrice) {
			return { exitPrice: stopLossPrice, exitReason: "stop_loss", profitLoss: stopLossPrice - entryPrice };
		}
		if (candle.high >= takeProfitPrice) {
			return { exitPrice: takeProfitPrice, exitReason: "take_profit", profitLoss: takeProfitPrice - entryPrice };
		}
	} else {
		if (candle.high >= stopLossPrice) {
			return { exitPrice: stopLossPrice, exitReason: "stop_loss", profitLoss: entryPrice - stopLossPrice };
		}
		if (candle.low <= takeProfitPrice) {
			return { exitPrice: takeProfitPrice, exitReason: "take_profit", profitLoss: entryPrice - takeProfitPrice };
		}
	}
	return null;
}
