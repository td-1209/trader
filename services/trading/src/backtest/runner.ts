import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles, methods } from "../db/schema.js";
import { LOOKBACK } from "../methods/aggregator.js";
import { evaluateMethod, checkExit } from "../methods/evaluate.js";
import type { Candle, Signal } from "../methods/types.js";

interface BacktestConfig {
	symbol: string;
	timeframe: string;
	startDate: string;
	endDate: string;
}

export interface BacktestTrade {
	methodName: string;
	symbol: string;
	position: string;
	entryPrice: number;
	signalPrice: number;
	takeProfitPrice: number;
	stopLossPrice: number;
	exitPrice: number;
	profitLoss: number;
	volume: number;
	reason: string;
	entryAt: string;
	exitAt: string;
	exitReason: string;
}

export interface BacktestResult {
	methodName: string;
	symbol: string;
	timeframe: string;
	trades: BacktestTrade[];
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult[]> {
	console.log(`Backtest: ${config.symbol} ${config.timeframe} from ${config.startDate} to ${config.endDate}`);

	const activeMethods = await db
		.select()
		.from(methods)
		.where(
			and(
				eq(methods.isActive, true),
				eq(methods.timeframe, config.timeframe),
			),
		);

	const matching = activeMethods.filter(
		(m) => !m.symbol || m.symbol === config.symbol,
	);

	if (matching.length === 0) {
		console.log("No matching methods found");
		return [];
	}

	const allCandles = await db
		.select()
		.from(candles)
		.where(
			and(
				eq(candles.symbol, config.symbol),
				eq(candles.timeframe, config.timeframe),
			),
		)
		.orderBy(asc(candles.timestamp));

	console.log(`Loaded ${allCandles.length} candles`);

	const candleData: Candle[] = allCandles.map((c) => ({
		open: Number(c.open),
		high: Number(c.high),
		low: Number(c.low),
		close: Number(c.close),
		timestamp: c.timestamp.toISOString(),
	}));

	const results: BacktestResult[] = [];

	for (const method of matching) {
		console.log(`\nRunning ${method.name} for ${config.symbol} ${config.timeframe}...`);
		const trades = runMethodBacktest(method.name, config, candleData);
		results.push({ methodName: method.name, symbol: config.symbol, timeframe: config.timeframe, trades });
	}

	return results;
}

function runMethodBacktest(
	methodName: string,
	config: BacktestConfig,
	allCandles: Candle[],
): BacktestTrade[] {
	const windowSize = LOOKBACK[config.timeframe] ?? 144;
	const completedTrades: BacktestTrade[] = [];
	let openTrade: {
		position: string;
		entryPrice: number;
		signalPrice: number;
		takeProfitPrice: number;
		stopLossPrice: number;
		volume: number;
		reason: string;
		entryAt: string;
	} | null = null;
	let pendingSignal: { signal: Signal; volume: number } | null = null;

	for (let i = windowSize; i < allCandles.length; i++) {
		const window = allCandles.slice(i - windowSize, i + 1);
		const currentCandle = allCandles[i];

		// オープンポジションのTP/SL判定（共通ロジック: evaluate.ts）
		if (openTrade) {
			const exit = checkExit(
				openTrade.position,
				openTrade.entryPrice,
				openTrade.takeProfitPrice,
				openTrade.stopLossPrice,
				currentCandle,
			);
			if (exit) {
				completedTrades.push({
					methodName,
					symbol: config.symbol,
					position: openTrade.position,
					entryPrice: openTrade.entryPrice,
					signalPrice: openTrade.signalPrice,
					takeProfitPrice: openTrade.takeProfitPrice,
					stopLossPrice: openTrade.stopLossPrice,
					volume: openTrade.volume,
					reason: openTrade.reason,
					entryAt: openTrade.entryAt,
					exitPrice: exit.exitPrice,
					profitLoss: exit.profitLoss,
					exitAt: currentCandle.timestamp,
					exitReason: exit.exitReason,
				});
				openTrade = null;
			}
		}

		// シグナル判定（共通ロジック: evaluate.ts）
		if (!openTrade && !pendingSignal) {
			// 過剰評価抑制: 約定遅延 — シグナル足の終値ではなく次の足の始値でエントリー
			const result = evaluateMethod(methodName, config.symbol, config.timeframe, window);
			if (result) {
				pendingSignal = { signal: result.signal, volume: result.volume };
			}
		}

		// 約定遅延: 前の足でシグナルが出ていたら、この足の始値でエントリー
		if (pendingSignal && !openTrade) {
			openTrade = {
				position: pendingSignal.signal.position,
				entryPrice: currentCandle.open,
				signalPrice: pendingSignal.signal.entryPrice,
				takeProfitPrice: pendingSignal.signal.takeProfitPrice,
				stopLossPrice: pendingSignal.signal.stopLossPrice,
				volume: pendingSignal.volume,
				reason: pendingSignal.signal.reason,
				entryAt: currentCandle.timestamp,
			};
			pendingSignal = null;
		}
	}

	// 未決済ポジションを最終価格で強制決済
	if (openTrade) {
		const lastCandle = allCandles[allCandles.length - 1];
		const pl = openTrade.position === "long"
			? lastCandle.close - openTrade.entryPrice
			: openTrade.entryPrice - lastCandle.close;
		completedTrades.push({
			methodName,
			symbol: config.symbol,
			position: openTrade.position,
			entryPrice: openTrade.entryPrice,
			signalPrice: openTrade.signalPrice,
			takeProfitPrice: openTrade.takeProfitPrice,
			stopLossPrice: openTrade.stopLossPrice,
			volume: openTrade.volume,
			reason: openTrade.reason,
			entryAt: openTrade.entryAt,
			exitPrice: lastCandle.close,
			exitAt: lastCandle.timestamp,
			exitReason: "backtest_end",
			profitLoss: pl,
		});
	}

	const wins = completedTrades.filter((t) => t.profitLoss > 0).length;
	const winRate = completedTrades.length > 0 ? ((wins / completedTrades.length) * 100).toFixed(1) : "N/A";
	console.log(`${methodName}: ${completedTrades.length} trades, ${wins}W/${completedTrades.length - wins}L (${winRate}%)`);

	return completedTrades;
}
