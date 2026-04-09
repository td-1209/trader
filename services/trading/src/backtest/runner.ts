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

	// 常に5分足をDBから取得し、必要なら上位足に集約する
	const allFiveMin = await db
		.select()
		.from(candles)
		.where(
			and(
				eq(candles.symbol, config.symbol),
				eq(candles.timeframe, "5m"),
			),
		)
		.orderBy(asc(candles.timestamp));

	console.log(`Loaded ${allFiveMin.length} 5m candles`);

	let candleData: Candle[];

	if (config.timeframe === "5m") {
		candleData = allFiveMin.map((c) => ({
			open: Number(c.open),
			high: Number(c.high),
			low: Number(c.low),
			close: Number(c.close),
			timestamp: c.timestamp.toISOString(),
		}));
	} else {
		// 5分足から上位足に集約
		const TIMEFRAME_MS: Record<string, number> = {
			"1h": 60 * 60 * 1000,
			"4h": 4 * 60 * 60 * 1000,
			"1d": 24 * 60 * 60 * 1000,
			"1w": 7 * 24 * 60 * 60 * 1000,
		};
		const intervalMs = TIMEFRAME_MS[config.timeframe];
		if (!intervalMs) throw new Error(`Unknown timeframe: ${config.timeframe}`);

		const aggMap = new Map<number, { open: number; high: number; low: number; close: number; timestamp: Date }>();
		for (const row of allFiveMin) {
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

		candleData = Array.from(aggMap.values())
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
			.map((c) => ({
				open: c.open,
				high: c.high,
				low: c.low,
				close: c.close,
				timestamp: c.timestamp.toISOString(),
			}));

		console.log(`Aggregated to ${candleData.length} ${config.timeframe} candles`);
	}

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
