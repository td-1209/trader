import { Canvas } from "skia-canvas";
import type { Candle, Signal } from "./types.js";

const WIDTH = 800;
const HEIGHT = 500;
const PADDING = { top: 20, right: 80, bottom: 30, left: 10 };
const CHART_W = WIDTH - PADDING.left - PADDING.right;
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;

const COLORS = {
	bg: "#1a1a2e",
	grid: "#2a2a4a",
	bullish: "#26a69a",
	bearish: "#ef5350",
	entry: "#ff9800",
	tp: "#4caf50",
	sl: "#f44336",
	lineUpper: "#ff7043",
	lineLower: "#42a5f5",
	text: "#cccccc",
	label: "#ffffff",
};

export async function renderChart(candles: Candle[], signal: Signal): Promise<Buffer> {
	const canvas = new Canvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	// 価格レンジ計算（全ライン含む）
	const allPrices = [
		...candles.flatMap((c) => [c.high, c.low]),
		signal.entryPrice,
		signal.takeProfitPrice,
		signal.stopLossPrice,
		...signal.upperLines.map((l) => l.price),
		...signal.lowerLines.map((l) => l.price),
	];
	const minPrice = Math.min(...allPrices);
	const maxPrice = Math.max(...allPrices);
	const priceRange = maxPrice - minPrice || 1;
	const pricePadding = priceRange * 0.05;
	const adjMin = minPrice - pricePadding;
	const adjMax = maxPrice + pricePadding;
	const adjRange = adjMax - adjMin;

	const toY = (price: number) => PADDING.top + CHART_H * (1 - (price - adjMin) / adjRange);
	const toX = (i: number) => PADDING.left + (CHART_W / candles.length) * (i + 0.5);
	const candleWidth = Math.max(2, (CHART_W / candles.length) * 0.6);

	// 背景
	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	// グリッド
	ctx.strokeStyle = COLORS.grid;
	ctx.lineWidth = 0.5;
	const gridSteps = 6;
	for (let i = 0; i <= gridSteps; i++) {
		const y = PADDING.top + (CHART_H / gridSteps) * i;
		ctx.beginPath();
		ctx.moveTo(PADDING.left, y);
		ctx.lineTo(PADDING.left + CHART_W, y);
		ctx.stroke();

		// 価格ラベル
		const price = adjMax - (adjRange / gridSteps) * i;
		ctx.fillStyle = COLORS.text;
		ctx.font = "11px monospace";
		ctx.textAlign = "left";
		ctx.fillText(formatPrice(price), PADDING.left + CHART_W + 5, y + 4);
	}

	// ローソク足
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i];
		const x = toX(i);
		const isBullish = c.close >= c.open;
		const color = isBullish ? COLORS.bullish : COLORS.bearish;

		// ヒゲ
		ctx.strokeStyle = color;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, toY(c.high));
		ctx.lineTo(x, toY(c.low));
		ctx.stroke();

		// 実体
		const bodyTop = toY(Math.max(c.open, c.close));
		const bodyBottom = toY(Math.min(c.open, c.close));
		const bodyHeight = Math.max(1, bodyBottom - bodyTop);
		ctx.fillStyle = color;
		ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
	}

	// 山谷ライン（上）
	for (const line of signal.upperLines) {
		drawHorizontalLine(ctx, toY(line.price), COLORS.lineUpper, true);
		drawPriceLabel(ctx, toY(line.price), formatPrice(line.price), COLORS.lineUpper);
	}

	// 山谷ライン（下）
	for (const line of signal.lowerLines) {
		drawHorizontalLine(ctx, toY(line.price), COLORS.lineLower, true);
		drawPriceLabel(ctx, toY(line.price), formatPrice(line.price), COLORS.lineLower);
	}

	// TP/SL/エントリーライン
	drawHorizontalLine(ctx, toY(signal.takeProfitPrice), COLORS.tp, false);
	drawPriceLabel(ctx, toY(signal.takeProfitPrice), `TP ${formatPrice(signal.takeProfitPrice)}`, COLORS.tp);

	drawHorizontalLine(ctx, toY(signal.stopLossPrice), COLORS.sl, false);
	drawPriceLabel(ctx, toY(signal.stopLossPrice), `SL ${formatPrice(signal.stopLossPrice)}`, COLORS.sl);

	drawHorizontalLine(ctx, toY(signal.entryPrice), COLORS.entry, false);
	drawPriceLabel(ctx, toY(signal.entryPrice), `Entry ${formatPrice(signal.entryPrice)}`, COLORS.entry);

	// 矢印（エントリー方向）
	const arrowX = toX(candles.length - 1) + 15;
	const arrowY = toY(signal.entryPrice);
	ctx.fillStyle = COLORS.entry;
	ctx.beginPath();
	if (signal.position === "long") {
		ctx.moveTo(arrowX, arrowY);
		ctx.lineTo(arrowX - 6, arrowY + 12);
		ctx.lineTo(arrowX + 6, arrowY + 12);
	} else {
		ctx.moveTo(arrowX, arrowY);
		ctx.lineTo(arrowX - 6, arrowY - 12);
		ctx.lineTo(arrowX + 6, arrowY - 12);
	}
	ctx.fill();

	return Buffer.from(await canvas.toBuffer("png"));
}

function drawHorizontalLine(ctx: ReturnType<Canvas["getContext"]>, y: number, color: string, dashed: boolean) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	ctx.setLineDash(dashed ? [6, 4] : []);
	ctx.beginPath();
	ctx.moveTo(PADDING.left, y);
	ctx.lineTo(PADDING.left + CHART_W, y);
	ctx.stroke();
	ctx.setLineDash([]);
}

function drawPriceLabel(ctx: ReturnType<Canvas["getContext"]>, y: number, text: string, color: string) {
	ctx.font = "10px monospace";
	ctx.fillStyle = color;
	ctx.textAlign = "left";
	ctx.fillText(text, PADDING.left + CHART_W + 5, y - 3);
}

function formatPrice(price: number): string {
	if (price >= 100) return price.toFixed(3);
	if (price >= 10) return price.toFixed(4);
	return price.toFixed(5);
}
