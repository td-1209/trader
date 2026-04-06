import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client.js";
import { trades, backtestResults } from "../db/schema.js";

interface GroupedTrade {
	id: string;
	symbol: string;
	position: string;
	entryPrice: number;
	exitPrice: number;
	profitLoss: number;
	takeProfitPrice: number;
	stopLossPrice: number;
	reason: string | null;
	exitReason: string | null;
	entryAt: string;
	exitAt: string;
}

type GroupName = "big_win" | "win" | "small_win" | "small_loss" | "loss" | "big_loss";

function classifyTrade(trade: GroupedTrade): GroupName {
	const risk = Math.abs(trade.entryPrice - trade.stopLossPrice);
	const pl = trade.profitLoss;

	if (pl > 0) {
		if (pl > 2 * risk) return "big_win";
		if (pl > 0.5 * risk) return "win";
		return "small_win";
	}
	if (pl < -risk) return "big_loss";
	if (pl < -0.5 * risk) return "loss";
	return "small_loss";
}

export async function analyzeBacktest(methodName: string, symbol: string): Promise<void> {
	console.log(`\nAnalyzing backtest results: ${methodName} ${symbol}`);

	// デモトレードを取得
	const demoTrades = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.isDemo, true),
				eq(trades.symbol, symbol),
				eq(trades.status, "exited"),
			),
		)
		.orderBy(desc(trades.entryAt));

	if (demoTrades.length === 0) {
		console.log("No demo trades found");
		return;
	}

	const grouped: Record<GroupName, GroupedTrade[]> = {
		big_win: [],
		win: [],
		small_win: [],
		small_loss: [],
		loss: [],
		big_loss: [],
	};

	let totalPL = 0;
	let maxDrawdown = 0;
	let runningPL = 0;
	let peak = 0;

	for (const t of demoTrades) {
		const trade: GroupedTrade = {
			id: t.id,
			symbol: t.symbol,
			position: t.position,
			entryPrice: Number(t.entryPrice),
			exitPrice: Number(t.exitPrice),
			profitLoss: Number(t.profitLoss),
			takeProfitPrice: Number(t.takeProfitPrice),
			stopLossPrice: Number(t.stopLossPrice),
			reason: t.reasonDescription,
			exitReason: t.resultDescription,
			entryAt: t.entryAt?.toISOString() ?? "",
			exitAt: t.exitAt?.toISOString() ?? "",
		};

		const group = classifyTrade(trade);
		grouped[group].push(trade);
		totalPL += trade.profitLoss;

		// ドローダウン計算
		runningPL += trade.profitLoss;
		if (runningPL > peak) peak = runningPL;
		const dd = peak - runningPL;
		if (dd > maxDrawdown) maxDrawdown = dd;
	}

	const totalTrades = demoTrades.length;
	const wins = grouped.big_win.length + grouped.win.length + grouped.small_win.length;
	const winRate = ((wins / totalTrades) * 100).toFixed(1);
	const grossProfit = Object.values(grouped)
		.flat()
		.filter((t) => t.profitLoss > 0)
		.reduce((s, t) => s + t.profitLoss, 0);
	const grossLoss = Math.abs(
		Object.values(grouped)
			.flat()
			.filter((t) => t.profitLoss < 0)
			.reduce((s, t) => s + t.profitLoss, 0),
	);
	const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

	console.log(`Total: ${totalTrades} trades, Win: ${wins} (${winRate}%), PF: ${profitFactor.toFixed(2)}, MaxDD: ${maxDrawdown.toFixed(5)}`);

	// グループ別サマリ
	const groupSummary: Record<string, { count: number; avgPL: number; trades: GroupedTrade[] }> = {};
	for (const [name, trades] of Object.entries(grouped)) {
		const avgPL = trades.length > 0
			? trades.reduce((s, t) => s + t.profitLoss, 0) / trades.length
			: 0;
		groupSummary[name] = { count: trades.length, avgPL, trades };
		console.log(`  ${name}: ${trades.length} trades, avg P/L: ${avgPL.toFixed(5)}`);
	}

	// LLM分析
	let llmAnalysis = "";
	try {
		llmAnalysis = await analyzWithLLM(methodName, symbol, groupSummary);
	} catch (err) {
		console.error("LLM analysis failed:", err);
		llmAnalysis = "LLM analysis failed";
	}

	// DB保存
	await db.insert(backtestResults).values({
		methodName,
		symbol,
		timeframe: "5m",
		totalTrades,
		winRate: String(winRate),
		profitFactor: String(profitFactor.toFixed(4)),
		maxDrawdown: String(maxDrawdown),
		totalProfitLoss: String(totalPL),
		groupAnalysis: groupSummary,
		summary: llmAnalysis,
	});

	console.log("Backtest analysis saved");
}

async function analyzWithLLM(
	methodName: string,
	symbol: string,
	groups: Record<string, { count: number; avgPL: number; trades: GroupedTrade[] }>,
): Promise<string> {
	const anthropic = new Anthropic();

	const groupDescriptions = Object.entries(groups)
		.map(([name, { count, avgPL, trades }]) => {
			const sampleTrades = trades.slice(0, 5).map((t) =>
				`  entry:${t.entryAt.slice(0, 16)} ${t.position} @${t.entryPrice} → exit:${t.exitAt.slice(0, 16)} @${t.exitPrice} P/L:${t.profitLoss.toFixed(5)} (${t.exitReason}) reason:${t.reason}`
			).join("\n");
			return `## ${name} (${count} trades, avg P/L: ${avgPL.toFixed(5)})\n${sampleTrades || "  (no trades)"}`;
		})
		.join("\n\n");

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 2048,
		system: `You are a quantitative trading analyst. Analyze backtest results for the ${methodName} strategy on ${symbol}. Identify patterns in winning and losing trades. Respond in Japanese.`,
		messages: [{
			role: "user",
			content: `以下は${methodName}手法の${symbol}バックテスト結果です。6段階のグループ（大勝、勝ち、小勝、小負、負け、大負）に分類されています。\n\n各グループの特徴、勝ちパターンと負けパターンの違い、改善点を分析してください。\n\n${groupDescriptions}`,
		}],
	});

	const text = response.content[0].type === "text" ? response.content[0].text : "";
	return text;
}
