import { readFileSync, writeFileSync } from "node:fs";
import { renderChart } from "../src/methods/chart.js";
import { findLines } from "../src/methods/line.js";
import { pivotUpdate } from "../src/methods/pivot-update.js";
import type { Candle } from "../src/methods/types.js";

const csv = readFileSync(new URL("./data/usdjpy-5m.csv", import.meta.url), "utf-8");
const rows = csv.trim().split("\n").slice(1);

const candles: Candle[] = rows.map((row) => {
	const [open, high, low, close, timestamp] = row.split(",");
	return {
		open: Number(open),
		high: Number(high),
		low: Number(low),
		close: Number(close),
		timestamp,
	};
});

console.log(`Loaded ${candles.length} candles`);
console.log(`Price range: ${Math.min(...candles.map(c => c.low)).toFixed(3)} - ${Math.max(...candles.map(c => c.high)).toFixed(3)}`);
console.log(`Latest close: ${candles[candles.length - 1].close.toFixed(3)}`);

// pivot_update手法を実行
const signal = pivotUpdate.execute("USDJPY", "5m", candles);
console.log("Signal:", signal);

// line関数の結果を表示
const lastPrice = candles[candles.length - 1].close;
const lines = findLines(lastPrice, candles);
console.log("Upper lines (resistance peaks):", lines.upper);
console.log("Lower lines (support troughs):", lines.lower);

// チャート画像生成
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
writeFileSync(new URL("./data/chart-output.png", import.meta.url), image);
console.log("Chart saved to test/data/chart-output.png");
