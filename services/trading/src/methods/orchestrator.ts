import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { methods, trades } from "../db/schema.js";
import { mt5Bridge } from "../broker/mt5-bridge.js";
import { sendDiscordNotification } from "@trader/notify";
import { onFiveMinuteClose, fetchCandles } from "./aggregator.js";
import { pivotUpdate } from "./pivot-update.js";
import type { Method, Signal } from "./types.js";

const methodRegistry: Record<string, Method> = {
	pivot_update: pivotUpdate,
};

/**
 * 5分足確定時にohlcから呼ばれるエントリーポイント。
 */
export async function onCandleClose(symbol: string, bar: { open: number; high: number; low: number; close: number; timestamp: Date }) {
	const confirmed = onFiveMinuteClose(symbol, bar);

	for (const { symbol: sym, timeframe } of confirmed) {
		await evaluateMethods(sym, timeframe);
	}
}

/**
 * 指定symbol/timeframeに該当する有効な手法を実行する。
 */
async function evaluateMethods(symbol: string, timeframe: string) {
	const activeMethods = await db
		.select()
		.from(methods)
		.where(
			and(
				eq(methods.isActive, true),
				eq(methods.timeframe, timeframe),
			),
		);

	// symbol一致またはsymbol未指定の手法をフィルタ
	const matching = activeMethods.filter(
		(m) => !m.symbol || m.symbol === symbol,
	);

	for (const method of matching) {
		try {
			await executeMethod(method, symbol, timeframe);
		} catch (err) {
			console.error(`Method ${method.name} failed for ${symbol} ${timeframe}:`, err);
			sendDiscordNotification({
				content: `⚠️ 手法エラー（${method.name} ${symbol} ${timeframe}）: ${err}`,
				channel: "alert",
			});
		}
	}
}

async function executeMethod(
	method: { id: string; name: string; symbol: string | null },
	symbol: string,
	timeframe: string,
) {
	const impl = methodRegistry[method.name];
	if (!impl) {
		console.warn(`Unknown method: ${method.name}`);
		return;
	}

	// 重複チェック: 同method + 同symbol + 同timeframeでopenポジションがあればスキップ
	const openTrades = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.method, method.id),
				eq(trades.symbol, symbol),
				eq(trades.status, "open"),
			),
		);

	if (openTrades.length > 0) return;

	// ローソク足データ取得
	const candles = await fetchCandles(symbol, timeframe);
	if (candles.length < 5) return;

	// 手法実行
	const signal = impl.execute(symbol, timeframe, candles);
	if (!signal) return;

	console.log(`Signal: ${method.name} ${symbol} ${timeframe} → ${signal.position} @ ${signal.entryPrice}`);

	// MT5ブリッジ経由で注文
	await placeSignalOrder(method, symbol, signal);
}

async function placeSignalOrder(
	method: { id: string; name: string },
	symbol: string,
	signal: Signal,
) {
	// 最小ロット（0.01）で発注
	const volume = 0.01;

	try {
		const result = await mt5Bridge.placeOrder(symbol, signal.position, volume);

		if (!result.success) {
			console.error(`Order failed: ${result.error}`);
			return;
		}

		// DB記録
		await db.insert(trades).values({
			method: method.id,
			symbol,
			domain: "fx",
			position: signal.position,
			status: "open",
			exposure: String(volume * 100000), // 0.01 lot = 1000通貨
			entryPrice: result.price ?? String(signal.entryPrice),
			takeProfitPrice: String(signal.takeProfitPrice),
			stopLossPrice: String(signal.stopLossPrice),
			isDemo: false,
			isManual: false,
			brokerOrder: result.ticket,
			reasonDescription: signal.reason,
			entryAt: new Date(),
		});

		sendDiscordNotification({
			content: `🤖 自動注文: ${method.name}\n${symbol} ${signal.position} @ ${result.price ?? signal.entryPrice}\nTP: ${signal.takeProfitPrice} / SL: ${signal.stopLossPrice}\n${signal.reason}`,
			channel: "trade",
		});
	} catch (err) {
		console.error(`Signal order failed: ${method.name} ${symbol}`, err);
		sendDiscordNotification({
			content: `⚠️ 自動注文エラー（${method.name} ${symbol}）: ${err}`,
			channel: "alert",
		});
	}
}
