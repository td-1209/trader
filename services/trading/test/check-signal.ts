import { readFileSync } from "node:fs";
import { pivotUpdate } from "../src/methods/pivot-update.js";
import { findLines } from "../src/methods/line.js";
import type { Candle } from "../src/methods/types.js";

const symbols = ["usdjpy", "eurusd", "gbpusd", "eurjpy", "xauusd"];

for (const sym of symbols) {
	let csv: string;
	try {
		csv = readFileSync(new URL(`./data/${sym}-5m.csv`, import.meta.url), "utf-8");
	} catch { continue; }

	const rows = csv.trim().split("\n").slice(1);
	const candles: Candle[] = rows.map((r) => {
		const [o, h, l, c, t] = r.split(",");
		return { open: +o, high: +h, low: +l, close: +c, timestamp: t };
	});

	const close = candles[candles.length - 1].close;
	const prevClose = candles[candles.length - 2].close;
	const { upper, lower } = findLines(close, candles.slice(0, -1));

	console.log(`\n=== ${sym.toUpperCase()} ===`);
	console.log(`PrevClose: ${prevClose} → Close: ${close}`);
	console.log(`Nearest peak: ${upper[0]?.price ?? "none"} (diff: ${upper[0] ? (upper[0].price - close).toFixed(5) : "N/A"})`);
	console.log(`Nearest trough: ${lower[0]?.price ?? "none"} (diff: ${lower[0] ? (close - lower[0].price).toFixed(5) : "N/A"})`);
	console.log(`Breakout up? ${upper[0] ? `prev ${prevClose <= upper[0].price} → close ${close > upper[0].price}` : "no peak"}`);
	console.log(`Breakout down? ${lower[0] ? `prev ${prevClose >= lower[0].price} → close ${close < lower[0].price}` : "no trough"}`);

	const signal = pivotUpdate.execute(sym.toUpperCase(), "5m", candles);
	console.log(`Signal: ${signal ? `${signal.position} @ ${signal.entryPrice} TP:${signal.takeProfitPrice} SL:${signal.stopLossPrice}` : "none"}`);
}
