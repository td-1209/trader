import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles, methods, trades } from "../db/schema.js";
import { pivotUpdate } from "../methods/pivot-update.js";
import { findLines } from "../methods/line.js";
import type { Candle, Method, Signal } from "../methods/types.js";

const methodRegistry: Record<string, Method> = {
	pivot_update: pivotUpdate,
};

interface BacktestConfig {
	symbol: string;
	timeframe: string;
	startDate: string;
	endDate: string;
}

interface BacktestTrade {
	methodId: string;
	methodName: string;
	symbol: string;
	position: string;
	entryPrice: number;
	signalPrice: number;
	takeProfitPrice: number;
	stopLossPrice: number;
	exitPrice?: number;
	profitLoss?: number;
	reason: string;
	entryAt: Date;
	exitAt?: Date;
	exitReason?: string;
}

export async function runBacktest(config: BacktestConfig): Promise<string> {
	console.log(`Backtest: ${config.symbol} ${config.timeframe} from ${config.startDate} to ${config.endDate}`);

	// 対象の手法を取得
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
		return "no_methods";
	}

	// 全期間のcandlesを取得
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

	// 手法ごとにバックテスト実行
	for (const method of matching) {
		const impl = methodRegistry[method.name];
		if (!impl) continue;

		console.log(`\nRunning ${method.name} for ${config.symbol}...`);
		await runMethodBacktest(method, impl, config, candleData);
	}

	return "completed";
}

async function runMethodBacktest(
	method: { id: string; name: string },
	impl: Method,
	config: BacktestConfig,
	allCandles: Candle[],
) {
	const windowSize = 144; // 12時間分
	let openTrade: BacktestTrade | null = null;
	let tradeCount = 0;
	let winCount = 0;
	let lossCount = 0;

	for (let i = windowSize; i < allCandles.length; i++) {
		const window = allCandles.slice(i - windowSize, i + 1);
		const currentCandle = allCandles[i];

		// オープンポジションのTP/SL判定
		if (openTrade) {
			const closed = checkExit(openTrade, currentCandle);
			if (closed) {
				openTrade = closed;
				await persistTrade(openTrade, method.id);
				tradeCount++;
				if ((openTrade.profitLoss ?? 0) > 0) winCount++;
				else lossCount++;
				openTrade = null;
			}
		}

		// オープンポジションがなければ新規シグナル判定
		if (!openTrade) {
			const signal = impl.execute(config.symbol, config.timeframe, window);
			if (signal && !signal.rrRejected) {
				openTrade = {
					methodId: method.id,
					methodName: method.name,
					symbol: config.symbol,
					position: signal.position,
					entryPrice: signal.entryPrice,
					signalPrice: signal.entryPrice,
					takeProfitPrice: signal.takeProfitPrice,
					stopLossPrice: signal.stopLossPrice,
					reason: signal.reason,
					entryAt: new Date(currentCandle.timestamp),
				};
			}
		}
	}

	// 未決済ポジションを最終価格で強制決済
	if (openTrade) {
		const lastCandle = allCandles[allCandles.length - 1];
		openTrade.exitPrice = lastCandle.close;
		openTrade.exitAt = new Date(lastCandle.timestamp);
		openTrade.exitReason = "backtest_end";
		openTrade.profitLoss = calcProfitLoss(openTrade);
		await persistTrade(openTrade, method.id);
		tradeCount++;
		if ((openTrade.profitLoss ?? 0) > 0) winCount++;
		else lossCount++;
	}

	const winRate = tradeCount > 0 ? ((winCount / tradeCount) * 100).toFixed(1) : "N/A";
	console.log(`${method.name}: ${tradeCount} trades, ${winCount}W/${lossCount}L (${winRate}%)`);
}

function checkExit(trade: BacktestTrade, candle: Candle): BacktestTrade | null {
	if (trade.position === "long") {
		// 損切り: 安値がSL以下
		if (candle.low <= trade.stopLossPrice) {
			return {
				...trade,
				exitPrice: trade.stopLossPrice,
				exitAt: new Date(candle.timestamp),
				exitReason: "stop_loss",
				profitLoss: calcProfitLoss({ ...trade, exitPrice: trade.stopLossPrice }),
			};
		}
		// 利確: 高値がTP以上
		if (candle.high >= trade.takeProfitPrice) {
			return {
				...trade,
				exitPrice: trade.takeProfitPrice,
				exitAt: new Date(candle.timestamp),
				exitReason: "take_profit",
				profitLoss: calcProfitLoss({ ...trade, exitPrice: trade.takeProfitPrice }),
			};
		}
	} else {
		// short: 損切り: 高値がSL以上
		if (candle.high >= trade.stopLossPrice) {
			return {
				...trade,
				exitPrice: trade.stopLossPrice,
				exitAt: new Date(candle.timestamp),
				exitReason: "stop_loss",
				profitLoss: calcProfitLoss({ ...trade, exitPrice: trade.stopLossPrice }),
			};
		}
		// short: 利確: 安値がTP以下
		if (candle.low <= trade.takeProfitPrice) {
			return {
				...trade,
				exitPrice: trade.takeProfitPrice,
				exitAt: new Date(candle.timestamp),
				exitReason: "take_profit",
				profitLoss: calcProfitLoss({ ...trade, exitPrice: trade.takeProfitPrice }),
			};
		}
	}
	return null;
}

function calcProfitLoss(trade: { position: string; entryPrice: number; exitPrice?: number }): number {
	if (!trade.exitPrice) return 0;
	return trade.position === "long"
		? trade.exitPrice - trade.entryPrice
		: trade.entryPrice - trade.exitPrice;
}

async function persistTrade(trade: BacktestTrade, methodId: string) {
	await db.insert(trades).values({
		method: methodId,
		symbol: trade.symbol,
		domain: "fx",
		position: trade.position,
		status: "exited",
		exposure: "1000",
		entryPrice: String(trade.entryPrice),
		signalPrice: String(trade.signalPrice),
		slippage: "0",
		exitPrice: trade.exitPrice ? String(trade.exitPrice) : null,
		takeProfitPrice: String(trade.takeProfitPrice),
		stopLossPrice: String(trade.stopLossPrice),
		profitLoss: trade.profitLoss ? String(trade.profitLoss) : null,
		isDemo: true,
		isManual: false,
		reasonDescription: trade.reason,
		resultDescription: trade.exitReason ?? null,
		entryAt: trade.entryAt,
		exitAt: trade.exitAt ?? null,
	});
}
