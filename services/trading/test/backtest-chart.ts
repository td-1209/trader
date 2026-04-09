import { Canvas } from "skia-canvas";
import { writeFileSync } from "node:fs";

const snaps = [
	{ month: "2024-04", balance: 6865, topUpTotal: 20000, tradeCount: 200, pnl: -13039 },
	{ month: "2024-05", balance: 607, topUpTotal: 20000, tradeCount: 197, pnl: -6259 },
	{ month: "2024-06", balance: 324, topUpTotal: 20000, tradeCount: 171, pnl: -283 },
	{ month: "2024-07", balance: 8496, topUpTotal: 30000, tradeCount: 171, pnl: -1729 },
	{ month: "2024-08", balance: 211440, topUpTotal: 30000, tradeCount: 200, pnl: 202943 },
	{ month: "2024-09", balance: 176290, topUpTotal: 30000, tradeCount: 166, pnl: -35150 },
	{ month: "2024-10", balance: 893490, topUpTotal: 30000, tradeCount: 219, pnl: 717200 },
	{ month: "2024-11", balance: 1341140, topUpTotal: 30000, tradeCount: 174, pnl: 447650 },
	{ month: "2024-12", balance: 636135, topUpTotal: 30000, tradeCount: 176, pnl: -705006 },
	{ month: "2025-01", balance: 1152920, topUpTotal: 30000, tradeCount: 197, pnl: 516785 },
	{ month: "2025-02", balance: 4527832, topUpTotal: 30000, tradeCount: 194, pnl: 3374912 },
	{ month: "2025-03", balance: 8572088, topUpTotal: 30000, tradeCount: 234, pnl: 4044256 },
	{ month: "2025-04", balance: 29255730, topUpTotal: 30000, tradeCount: 206, pnl: 20683642 },
	{ month: "2025-05", balance: 10498781, topUpTotal: 30000, tradeCount: 204, pnl: -18756949 },
	{ month: "2025-06", balance: 5621785, topUpTotal: 30000, tradeCount: 182, pnl: -4876996 },
	{ month: "2025-07", balance: 28258957, topUpTotal: 30000, tradeCount: 197, pnl: 22637172 },
	{ month: "2025-08", balance: 12010052, topUpTotal: 30000, tradeCount: 153, pnl: -16248904 },
	{ month: "2025-09", balance: 2901608, topUpTotal: 30000, tradeCount: 194, pnl: -9108445 },
	{ month: "2025-10", balance: 12301672, topUpTotal: 30000, tradeCount: 175, pnl: 9400064 },
	{ month: "2025-11", balance: 240475, topUpTotal: 30000, tradeCount: 188, pnl: -12061197 },
	{ month: "2025-12", balance: 205041, topUpTotal: 30000, tradeCount: 153, pnl: -35434 },
	{ month: "2026-01", balance: 128287, topUpTotal: 30000, tradeCount: 196, pnl: -76754 },
	{ month: "2026-02", balance: 346021, topUpTotal: 30000, tradeCount: 169, pnl: 217734 },
	{ month: "2026-03", balance: 75169, topUpTotal: 30000, tradeCount: 199, pnl: -270852 },
	{ month: "2026-04", balance: 23031, topUpTotal: 30000, tradeCount: 74, pnl: -52138 },
];

const W = 1000, H = 500;
const PAD = { top: 50, right: 20, bottom: 70, left: 90 };
const cw = W - PAD.left - PAD.right;
const ch = H - PAD.top - PAD.bottom;

const canvas = new Canvas(W, H);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#1a1a2e";
ctx.fillRect(0, 0, W, H);

const maxBal = Math.max(...snaps.map(s => s.balance));
const gap = cw / snaps.length;
const barW = gap * 0.7;

// Title
ctx.font = "16px sans-serif";
ctx.fillStyle = "#ffffff";
ctx.textAlign = "center";
ctx.fillText("pivot_update USDJPY 5m — 月次残高推移", W / 2, 28);

// Y axis
ctx.font = "11px sans-serif";
ctx.textAlign = "right";
for (let i = 0; i <= 5; i++) {
	const val = maxBal * i / 5;
	const y = PAD.top + ch - (ch * i / 5);
	ctx.fillStyle = "#cccccc";
	const label = val >= 1000000 ? (val / 1000000).toFixed(0) + "M" : val >= 1000 ? (val / 1000).toFixed(0) + "K" : String(Math.round(val));
	ctx.fillText(label, PAD.left - 8, y + 4);
	ctx.strokeStyle = "#2a2a4a";
	ctx.lineWidth = 0.5;
	ctx.beginPath();
	ctx.moveTo(PAD.left, y);
	ctx.lineTo(PAD.left + cw, y);
	ctx.stroke();
}

// Bars
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	const h = (snaps[i].balance / maxBal) * ch;
	const y = PAD.top + ch - h;

	ctx.fillStyle = snaps[i].pnl >= 0 ? "#26a69a" : "#ef5350";
	ctx.fillRect(x - barW / 2, y, barW, Math.max(h, 1));

	// Month label
	ctx.fillStyle = "#cccccc";
	ctx.font = "9px sans-serif";
	ctx.textAlign = "center";
	ctx.save();
	ctx.translate(x, PAD.top + ch + 15);
	ctx.rotate(-Math.PI / 4);
	ctx.fillText(snaps[i].month, 0, 0);
	ctx.restore();
}

// Legend
ctx.font = "12px sans-serif";
ctx.fillStyle = "#26a69a";
ctx.fillRect(PAD.left + 10, PAD.top - 20, 12, 12);
ctx.fillStyle = "#cccccc";
ctx.textAlign = "left";
ctx.fillText("利益月", PAD.left + 28, PAD.top - 10);
ctx.fillStyle = "#ef5350";
ctx.fillRect(PAD.left + 80, PAD.top - 20, 12, 12);
ctx.fillStyle = "#cccccc";
ctx.fillText("損失月", PAD.left + 98, PAD.top - 10);

const buf = Buffer.from(await canvas.toBuffer("png"));
writeFileSync(new URL("./data/backtest-chart.png", import.meta.url), buf);
console.log("Saved: data/backtest-chart.png");
