import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles, methods } from "../db/schema.js";
import { pivotUpdate } from "../methods/pivot-update.js";
import { LOOKBACK } from "../methods/aggregator.js";
import type { Candle, Method } from "../methods/types.js";

const methodRegistry: Record<string, Method> = {
	pivot_update: pivotUpdate,
};

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
		const impl = methodRegistry[method.name];
		if (!impl) continue;

		console.log(`\nRunning ${method.name} for ${config.symbol}...`);
		const trades = runMethodBacktest(method.name, impl, config, candleData);
		results.push({ methodName: method.name, symbol: config.symbol, timeframe: config.timeframe, trades });
	}

	return results;
}

function runMethodBacktest(
	methodName: string,
	impl: Method,
	config: BacktestConfig,
	allCandles: Candle[],
): BacktestTrade[] {
	const windowSize = LOOKBACK[config.timeframe] ?? 144;
	const completedTrades: BacktestTrade[] = [];
	let openTrade: Omit<BacktestTrade, "exitPrice" | "profitLoss" | "exitAt" | "exitReason"> | null = null;

	for (let i = windowSize; i < allCandles.length; i++) {
		const window = allCandles.slice(i - windowSize, i + 1);
		const currentCandle = allCandles[i];

		// オープンポジションのTP/SL判定
		if (openTrade) {
			const closed = checkExit(openTrade, currentCandle);
			if (closed) {
				completedTrades.push(closed);
				openTrade = null;
			}
		}

		// オープンポジションがなければ新規シグナル判定
		if (!openTrade) {
			const signal = impl.execute(config.symbol, config.timeframe, window);
			if (signal && !signal.rrRejected) {
				openTrade = {
					methodName,
					symbol: config.symbol,
					position: signal.position,
					entryPrice: signal.entryPrice,
					signalPrice: signal.entryPrice,
					takeProfitPrice: signal.takeProfitPrice,
					stopLossPrice: signal.stopLossPrice,
					reason: signal.reason,
					entryAt: currentCandle.timestamp,
				};
			}
		}
	}

	// 未決済ポジションを最終価格で強制決済
	if (openTrade) {
		const lastCandle = allCandles[allCandles.length - 1];
		const pl = calcProfitLoss(openTrade.position, openTrade.entryPrice, lastCandle.close);
		completedTrades.push({
			...openTrade,
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

function checkExit(
	trade: { position: string; entryPrice: number; takeProfitPrice: number; stopLossPrice: number; methodName: string; symbol: string; signalPrice: number; reason: string; entryAt: string },
	candle: Candle,
): BacktestTrade | null {
	if (trade.position === "long") {
		if (candle.low <= trade.stopLossPrice) {
			return { ...trade, exitPrice: trade.stopLossPrice, exitAt: candle.timestamp, exitReason: "stop_loss", profitLoss: calcProfitLoss("long", trade.entryPrice, trade.stopLossPrice) };
		}
		if (candle.high >= trade.takeProfitPrice) {
			return { ...trade, exitPrice: trade.takeProfitPrice, exitAt: candle.timestamp, exitReason: "take_profit", profitLoss: calcProfitLoss("long", trade.entryPrice, trade.takeProfitPrice) };
		}
	} else {
		if (candle.high >= trade.stopLossPrice) {
			return { ...trade, exitPrice: trade.stopLossPrice, exitAt: candle.timestamp, exitReason: "stop_loss", profitLoss: calcProfitLoss("short", trade.entryPrice, trade.stopLossPrice) };
		}
		if (candle.low <= trade.takeProfitPrice) {
			return { ...trade, exitPrice: trade.takeProfitPrice, exitAt: candle.timestamp, exitReason: "take_profit", profitLoss: calcProfitLoss("short", trade.entryPrice, trade.takeProfitPrice) };
		}
	}
	return null;
}

function calcProfitLoss(position: string, entryPrice: number, exitPrice: number): number {
	return position === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
}
