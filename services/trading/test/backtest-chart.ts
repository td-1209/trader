import { Canvas } from "skia-canvas";
import { writeFileSync } from "node:fs";

const snaps = [
	{ month: "2024-04", balance: 10470, topUpTotal: 10000, tradeCount: 201, pnl: 470 },
	{ month: "2024-05", balance: 7440, topUpTotal: 10000, tradeCount: 199, pnl: -3030 },
	{ month: "2024-06", balance: 7683, topUpTotal: 10000, tradeCount: 173, pnl: 243 },
	{ month: "2024-07", balance: 6138, topUpTotal: 10000, tradeCount: 173, pnl: -1545 },
	{ month: "2024-08", balance: 7422, topUpTotal: 10000, tradeCount: 200, pnl: 1284 },
	{ month: "2024-09", balance: 16169, topUpTotal: 10000, tradeCount: 166, pnl: 8747 },
	{ month: "2024-10", balance: 14498, topUpTotal: 10000, tradeCount: 219, pnl: -1671 },
	{ month: "2024-11", balance: 14461, topUpTotal: 10000, tradeCount: 175, pnl: -37 },
	{ month: "2024-12", balance: 17339, topUpTotal: 10000, tradeCount: 177, pnl: 2878 },
	{ month: "2025-01", balance: 17889, topUpTotal: 10000, tradeCount: 197, pnl: 550 },
	{ month: "2025-02", balance: 20277, topUpTotal: 10000, tradeCount: 197, pnl: 2388 },
	{ month: "2025-03", balance: 22772, topUpTotal: 10000, tradeCount: 237, pnl: 2495 },
	{ month: "2025-04", balance: 29375, topUpTotal: 10000, tradeCount: 206, pnl: 6603 },
	{ month: "2025-05", balance: 37144, topUpTotal: 10000, tradeCount: 204, pnl: 7769 },
	{ month: "2025-06", balance: 38676, topUpTotal: 10000, tradeCount: 183, pnl: 1532 },
	{ month: "2025-07", balance: 41150, topUpTotal: 10000, tradeCount: 198, pnl: 2474 },
	{ month: "2025-08", balance: 44017, topUpTotal: 10000, tradeCount: 154, pnl: 2867 },
	{ month: "2025-09", balance: 46337, topUpTotal: 10000, tradeCount: 195, pnl: 2320 },
	{ month: "2025-10", balance: 48732, topUpTotal: 10000, tradeCount: 175, pnl: 2396 },
	{ month: "2025-11", balance: 48002, topUpTotal: 10000, tradeCount: 189, pnl: -730 },
	{ month: "2025-12", balance: 50483, topUpTotal: 10000, tradeCount: 154, pnl: 2480 },
	{ month: "2026-01", balance: 52161, topUpTotal: 10000, tradeCount: 196, pnl: 1678 },
	{ month: "2026-02", balance: 55155, topUpTotal: 10000, tradeCount: 169, pnl: 2994 },
	{ month: "2026-03", balance: 56807, topUpTotal: 10000, tradeCount: 201, pnl: 1652 },
	{ month: "2026-04", balance: 56553, topUpTotal: 10000, tradeCount: 74, pnl: -255 },
];

const W = 1000, H = 500;
const PAD = { top: 50, right: 20, bottom: 70, left: 90 };
const cw = W - PAD.left - PAD.right;
const ch = H - PAD.top - PAD.bottom;

const canvas = new Canvas(W, H);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#1a1a2e";
ctx.fillRect(0, 0, W, H);

const maxVal = Math.max(...snaps.map(s => s.balance));
const gap = cw / snaps.length;

// Title
ctx.font = "16px sans-serif";
ctx.fillStyle = "#ffffff";
ctx.textAlign = "center";
ctx.fillText("pivot_update USDJPY 5m — 残高 vs 投入額", W / 2, 28);

// Y axis
ctx.font = "11px sans-serif";
ctx.textAlign = "right";
for (let i = 0; i <= 5; i++) {
	const val = maxVal * i / 5;
	const y = PAD.top + ch - (ch * i / 5);
	ctx.fillStyle = "#cccccc";
	const label = val >= 1000 ? (val / 1000).toFixed(0) + "K" : String(Math.round(val));
	ctx.fillText(label, PAD.left - 8, y + 4);
	ctx.strokeStyle = "#2a2a4a";
	ctx.lineWidth = 0.5;
	ctx.beginPath();
	ctx.moveTo(PAD.left, y);
	ctx.lineTo(PAD.left + cw, y);
	ctx.stroke();
}

// Balance line (area fill)
ctx.beginPath();
ctx.moveTo(PAD.left + gap / 2, PAD.top + ch);
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	const y = PAD.top + ch - (snaps[i].balance / maxVal) * ch;
	ctx.lineTo(x, y);
}
ctx.lineTo(PAD.left + gap * (snaps.length - 1) + gap / 2, PAD.top + ch);
ctx.closePath();
ctx.fillStyle = "rgba(38, 166, 154, 0.3)";
ctx.fill();

// Balance line
ctx.strokeStyle = "#26a69a";
ctx.lineWidth = 2.5;
ctx.beginPath();
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	const y = PAD.top + ch - (snaps[i].balance / maxVal) * ch;
	if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
ctx.stroke();

// Balance dots
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	const y = PAD.top + ch - (snaps[i].balance / maxVal) * ch;
	ctx.fillStyle = "#26a69a";
	ctx.beginPath();
	ctx.arc(x, y, 3, 0, Math.PI * 2);
	ctx.fill();
}

// TopUp line
ctx.strokeStyle = "#ff9800";
ctx.lineWidth = 2;
ctx.setLineDash([6, 4]);
ctx.beginPath();
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	const y = PAD.top + ch - (snaps[i].topUpTotal / maxVal) * ch;
	if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
ctx.stroke();
ctx.setLineDash([]);

// Month labels
ctx.fillStyle = "#cccccc";
ctx.font = "9px sans-serif";
ctx.textAlign = "center";
for (let i = 0; i < snaps.length; i++) {
	const x = PAD.left + gap * i + gap / 2;
	ctx.save();
	ctx.translate(x, PAD.top + ch + 15);
	ctx.rotate(-Math.PI / 4);
	ctx.fillText(snaps[i].month, 0, 0);
	ctx.restore();
}

// Legend
ctx.font = "12px sans-serif";
ctx.strokeStyle = "#26a69a";
ctx.lineWidth = 2.5;
ctx.setLineDash([]);
ctx.beginPath();
ctx.moveTo(PAD.left + 10, PAD.top - 14);
ctx.lineTo(PAD.left + 30, PAD.top - 14);
ctx.stroke();
ctx.fillStyle = "#cccccc";
ctx.textAlign = "left";
ctx.fillText("残高", PAD.left + 35, PAD.top - 10);

ctx.strokeStyle = "#ff9800";
ctx.lineWidth = 2;
ctx.setLineDash([6, 4]);
ctx.beginPath();
ctx.moveTo(PAD.left + 80, PAD.top - 14);
ctx.lineTo(PAD.left + 100, PAD.top - 14);
ctx.stroke();
ctx.setLineDash([]);
ctx.fillText("累計投入額", PAD.left + 105, PAD.top - 10);

const buf = Buffer.from(await canvas.toBuffer("png"));
writeFileSync(new URL("./data/backtest-chart.png", import.meta.url), buf);
console.log("Saved: data/backtest-chart.png");
