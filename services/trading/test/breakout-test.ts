import { readFileSync, writeFileSync } from "node:fs";
import { renderChart } from "../src/methods/chart.js";
import { findLines } from "../src/methods/line.js";
import { pivotUpdate } from "../src/methods/pivot-update.js";
import type { Candle } from "../src/methods/types.js";

const csv = readFileSync(new URL("./data/gbpusd-breakout.csv", import.meta.url), "utf-8");
const allRows = csv.trim().split("\n").slice(1);
const allCandles: Candle[] = allRows.map((r) => {
	const [o, h, l, c, t] = r.split(",");
	return { open: +o, high: +h, low: +l, close: +c, timestamp: t };
});

const simStart = Math.max(0, allCandles.length - 8);
for (let i = simStart; i <= allCandles.length; i++) {
	const candles = allCandles.slice(0, i);
	if (candles.length < 5) continue;

	const close = candles[candles.length - 1].close;
	const prevClose = candles[candles.length - 2].close;
	const prev = candles.slice(0, -1);

	// prevClose基準でライン取得（pivot_updateと同じ）
	const { upper, lower, rawUpper, rawLower } = findLines(prevClose, prev);

	const signal = pivotUpdate.execute("GBPUSD", "5m", candles);
	const ts = candles[candles.length - 1].timestamp;

	console.log(`\n=== Candle ${i} (${ts}) ===`);
	console.log(`PrevClose: ${prevClose.toFixed(5)} → Close: ${close.toFixed(5)}`);
	console.log(`rawLower (prevClose基準): ${rawLower.map((l) => l.price.toFixed(5)).join(", ") || "none"}`);
	if (rawLower.length > 0) {
		const nearest = rawLower[0];
		console.log(`  Nearest: ${nearest.price.toFixed(5)} | prev >= ? ${prevClose >= nearest.price} | close < ? ${close < nearest.price} | BREAK: ${prevClose >= nearest.price && close < nearest.price}`);
	}
	console.log(`Signal: ${signal ? `${signal.position} @ ${signal.entryPrice} TP:${signal.takeProfitPrice} SL:${signal.stopLossPrice}` : "none"}`);

	// チャート描画は現在値基準のラインを使用
	const displayLines = findLines(close, prev);
	const chartSignal = signal ?? {
		position: "long" as const,
		entryPrice: close,
		takeProfitPrice: close,
		stopLossPrice: close,
		reason: "シグナルなし",
		upperLines: displayLines.upper,
		lowerLines: displayLines.lower,
	};
	const image = await renderChart(candles, chartSignal);
	writeFileSync(new URL(`./data/gbpusd-step${i}.png`, import.meta.url), image);
}
console.log("\nDone");
