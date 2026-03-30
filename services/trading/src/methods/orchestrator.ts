import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { methods, trades } from "../db/schema.js";
import { mt5Bridge } from "../broker/mt5-bridge.js";
import { sendDiscordNotification } from "@trader/notify";
import { onFiveMinuteClose, fetchCandles } from "./aggregator.js";
import { renderChart } from "./chart.js";
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

	const candles = await fetchCandles(symbol, timeframe);
	if (candles.length < 5) return;

	const signal = impl.execute(symbol, timeframe, candles);

	if (method.mode === "notify") {
		await notifySignal(method, symbol, timeframe, signal, candles);
		return;
	}

	if (!signal) return;

	console.log(`Signal: ${method.name} ${symbol} ${timeframe} → ${signal.position} @ ${signal.entryPrice} (mode: ${method.mode})`);
	await placeSignalOrder(method, symbol, signal);
}

async function notifySignal(
	method: { id: string; name: string },
	symbol: string,
	timeframe: string,
	signal: Signal | null,
	candles: Awaited<ReturnType<typeof fetchCandles>>,
) {
	const { findLines } = await import("./line.js");
	const lastPrice = candles[candles.length - 1]?.close ?? 0;
	const chartSignal: Signal = signal ?? {
		position: "long",
		entryPrice: lastPrice,
		takeProfitPrice: lastPrice,
		stopLossPrice: lastPrice,
		reason: "シグナルなし",
		...(() => { const l = findLines(lastPrice, candles); return { upperLines: l.upper, lowerLines: l.lower }; })(),
	};

	let content: string;
	if (signal) {
		const reward = Math.abs(signal.entryPrice - signal.takeProfitPrice);
		const risk = Math.abs(signal.entryPrice - signal.stopLossPrice);
		const rr = risk > 0 ? (reward / risk).toFixed(2) : "N/A";
		content = [
			`🤖 シグナル検出: ${method.name}`,
			`${symbol} ${timeframe}足 → ${signal.position} @ ${formatPrice(signal.entryPrice)}`,
			`TP: ${formatPrice(signal.takeProfitPrice)} / SL: ${formatPrice(signal.stopLossPrice)} (RR: ${rr})`,
			signal.reason,
		].join("\n");
	} else {
		content = `📊 ${method.name} ${symbol} ${timeframe}足（現在値: ${formatPrice(lastPrice)}）`;
	}

	try {
		const image = await renderChart(candles, chartSignal);
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
) {
	const volume = 0.01;

	try {
		const result = await mt5Bridge.placeOrder(symbol, signal.position, volume);

		if (!result.success) {
			console.error(`Order failed: ${result.error}`);
			return;
		}

		await db.insert(trades).values({
			method: method.id,
			symbol,
			domain: "fx",
			position: signal.position,
			status: "open",
			exposure: String(volume * 100000),
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

function formatPrice(price: number): string {
	if (price >= 100) return price.toFixed(3);
	if (price >= 10) return price.toFixed(4);
	return price.toFixed(5);
}
