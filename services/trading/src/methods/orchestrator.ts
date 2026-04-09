import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { methods, trades } from "../db/schema.js";
import { mt5Bridge } from "../broker/mt5-bridge.js";
import { sendDiscordNotification } from "@trader/notify";
import { onFiveMinuteClose, fetchCandles } from "./aggregator.js";
import { renderChart } from "./chart.js";
import { evaluateMethod } from "./evaluate.js";
import type { Signal } from "./types.js";

/**
 * 5分足確定時にohlcから呼ばれるエントリーポイント。
 */
export async function onCandleClose(symbol: string, bar: { open: number; high: number; low: number; close: number; timestamp: Date }) {
	const confirmed = onFiveMinuteClose(symbol, bar);

	for (const { symbol: sym, timeframe } of confirmed) {
		await evaluateMethods(sym, timeframe);
	}
}

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
	method: { id: string; name: string; symbol: string | null; mode: string },
	symbol: string,
	timeframe: string,
) {
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

	const candles = await fetchCandles(symbol, timeframe);

	// 共通ロジックで手法評価（evaluate.ts）
	const result = evaluateMethod(method.name, symbol, timeframe, candles);
	if (!result) return;

	const { signal, volume, tp, sl } = result;

	if (method.mode === "notify") {
		await notifySignal(method, symbol, timeframe, signal, candles);
		return;
	}

	console.log(`Signal: ${method.name} ${symbol} ${timeframe} → ${signal.position} @ ${signal.entryPrice} (mode: ${method.mode})`);
	await placeSignalOrder(method, symbol, signal, volume, tp, sl);
}

async function notifySignal(
	method: { id: string; name: string },
	symbol: string,
	timeframe: string,
	signal: Signal,
	candles: Awaited<ReturnType<typeof fetchCandles>>,
) {
	const reward = Math.abs(signal.entryPrice - signal.takeProfitPrice);
	const risk = Math.abs(signal.entryPrice - signal.stopLossPrice);
	const rr = risk > 0 ? (reward / risk).toFixed(2) : "N/A";
	const content = [
		`🤖 シグナル検出: ${method.name}`,
		`${symbol} ${timeframe}足 → ${signal.position} @ ${formatPrice(signal.entryPrice)}`,
		`TP: ${formatPrice(signal.takeProfitPrice)} / SL: ${formatPrice(signal.stopLossPrice)} (RR: ${rr})`,
		signal.reason,
	].join("\n");

	try {
		const image = await renderChart(candles, signal);
		await sendDiscordNotification({ content, channel: "trade", image });
	} catch (err) {
		console.error("Chart render failed, sending without image:", err);
		await sendDiscordNotification({ content, channel: "trade" });
	}
}

async function placeSignalOrder(
	method: { id: string; name: string },
	symbol: string,
	signal: Signal,
	volume: number,
	tp: number | undefined,
	sl: number | undefined,
) {
	try {
		const result = await mt5Bridge.placeOrder(symbol, signal.position, volume, tp, sl);

		if (!result.success) {
			console.error(`Order failed: ${result.error}`);
			return;
		}

		const executionPrice = result.price ? Number(result.price) : signal.entryPrice;
		const slippage = executionPrice - signal.entryPrice;

		await db.insert(trades).values({
			method: method.id,
			symbol,
			domain: "fx",
			position: signal.position,
			status: "open",
			exposure: String(volume * 100000),
			entryPrice: String(executionPrice),
			signalPrice: String(signal.entryPrice),
			slippage: String(slippage),
			takeProfitPrice: String(signal.takeProfitPrice),
			stopLossPrice: String(signal.stopLossPrice),
			isDemo: false,
			isManual: false,
			brokerOrder: result.ticket,
			reasonDescription: signal.reason,
			entryAt: new Date(),
		});

		const slippageStr = slippage !== 0 ? ` (slip: ${slippage > 0 ? "+" : ""}${formatPrice(slippage)})` : "";
		sendDiscordNotification({
			content: `🤖 自動注文: ${method.name}\n${symbol} ${signal.position} @ ${formatPrice(executionPrice)}${slippageStr}\nTP: ${formatPrice(signal.takeProfitPrice)} / SL: ${formatPrice(signal.stopLossPrice)}${signal.useLimit ? " [指値]" : ""}\n${signal.reason}`,
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

function formatPrice(price: number): string {
	if (price >= 100) return price.toFixed(3);
	if (price >= 10) return price.toFixed(4);
	return price.toFixed(5);
}
