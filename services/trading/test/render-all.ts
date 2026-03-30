import { readFileSync, writeFileSync } from "node:fs";
import { renderChart } from "../src/methods/chart.js";
import { findLines } from "../src/methods/line.js";
import { pivotUpdate } from "../src/methods/pivot-update.js";
import type { Candle } from "../src/methods/types.js";

const symbols = ["usdjpy", "eurusd", "gbpusd", "eurjpy", "xauusd"];

for (const sym of symbols) {
	const csv = readFileSync(new URL(`./data/${sym}-5m.csv`, import.meta.url), "utf-8");
	const rows = csv.trim().split("\n").slice(1);

	const candles: Candle[] = rows.map((row) => {
		const [open, high, low, close, timestamp] = row.split(",");
		return { open: Number(open), high: Number(high), low: Number(low), close: Number(close), timestamp };
	});

	const lastPrice = candles[candles.length - 1].close;
	const signal = pivotUpdate.execute(sym.toUpperCase(), "5m", candles);
	const lines = findLines(lastPrice, candles);

	console.log(`\n=== ${sym.toUpperCase()} ===`);
	console.log(`Range: ${Math.min(...candles.map(c => c.low)).toFixed(5)} - ${Math.max(...candles.map(c => c.high)).toFixed(5)}`);
	console.log(`Close: ${lastPrice.toFixed(5)}`);
	console.log(`Signal: ${signal ? `${signal.position} @ ${signal.entryPrice}` : "none"}`);
	console.log(`Upper: ${lines.upper.map(l => l.price.toFixed(5)).join(", ") || "none"}`);
	console.log(`Lower: ${lines.lower.map(l => l.price.toFixed(5)).join(", ") || "none"}`);

	const chartSignal = signal ?? {
		position: "long" as const,
		entryPrice: lastPrice,
		takeProfitPrice: lastPrice,
		stopLossPrice: lastPrice,
		reason: "シグナルなし",
		upperLines: lines.upper,
		lowerLines: lines.lower,
	};

	const image = await renderChart(candles, chartSignal);
	writeFileSync(new URL(`./data/${sym}-chart.png`, import.meta.url), image);
	console.log(`Saved: data/${sym}-chart.png`);
}
