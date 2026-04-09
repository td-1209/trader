import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client.js";
import { backtestResults } from "../db/schema.js";
import type { BacktestTrade, BacktestResult } from "./runner.js";
import { simulate, type SimulationResult } from "./simulator.js";
import { DEFAULT_CONFIG, PIP_SIZES, type SimulationConfig } from "./config.js";

type GroupName = "big_win" | "win" | "small_win" | "small_loss" | "loss" | "big_loss";

function classifyTrade(trade: BacktestTrade): GroupName {
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

export async function analyzeBacktest(result: BacktestResult): Promise<void> {
	const { methodName, symbol, timeframe, trades } = result;
	console.log(`\nAnalyzing: ${methodName} ${symbol} ${timeframe} (${trades.length} trades)`);

	if (trades.length === 0) {
		console.log("No trades to analyze");
		return;
	}

	// シミュレーション設定
	const config: SimulationConfig = {
		...DEFAULT_CONFIG,
		pipSize: PIP_SIZES[symbol] ?? DEFAULT_CONFIG.pipSize,
	};

	// シミュレーション実行
	const sim = simulate(trades, config);

	console.log(`Trades: ${sim.totalTrades}, WinRate: ${sim.winRate}%, AvgRR: ${sim.avgRR}, ROI: ${sim.roi}%`);
	console.log(`Balance: ${sim.finalBalance}, TopUp: ${sim.totalTopUp}, ZeroCut: ${sim.zeroCutCount}`);

	// グルーピング
	const grouped: Record<GroupName, BacktestTrade[]> = {
		big_win: [], win: [], small_win: [],
		small_loss: [], loss: [], big_loss: [],
	};
	for (const trade of trades) {
		grouped[classifyTrade(trade)].push(trade);
	}

	const groupSummary: Record<string, { count: number; avgPL: number; sampleTrades: BacktestTrade[] }> = {};
	for (const [name, groupTrades] of Object.entries(grouped)) {
		const avgPL = groupTrades.length > 0
			? groupTrades.reduce((s, t) => s + t.profitLoss, 0) / groupTrades.length
			: 0;
		groupSummary[name] = { count: groupTrades.length, avgPL, sampleTrades: groupTrades.slice(0, 5) };
		console.log(`  ${name}: ${groupTrades.length} trades, avg P/L: ${avgPL.toFixed(5)}`);
	}

	// LLM分析
	let llmAnalysis = "";
	try {
		llmAnalysis = await analyzeWithLLM(methodName, symbol, timeframe, sim, groupSummary);
	} catch (err) {
		console.error("LLM analysis failed:", err);
		llmAnalysis = "LLM analysis failed";
	}

	// DB保存
	await db.insert(backtestResults).values({
		methodName,
		symbol,
		timeframe,
		totalTrades: sim.totalTrades,
		winRate: sim.winRate,
		avgRR: sim.avgRR,
		roi: sim.roi,
		groupAnalysis: {
			groups: groupSummary,
			simulation: {
				finalBalance: sim.finalBalance,
				totalTopUp: sim.totalTopUp,
				zeroCutCount: sim.zeroCutCount,
				config,
			},
			monthlySnapshots: sim.monthlySnapshots,
		},
		summary: llmAnalysis,
	});

	console.log("Backtest analysis saved");
}

async function analyzeWithLLM(
	methodName: string,
	symbol: string,
	timeframe: string,
	sim: SimulationResult,
	groups: Record<string, { count: number; avgPL: number; sampleTrades: BacktestTrade[] }>,
): Promise<string> {
	const anthropic = new Anthropic();

	const groupDescriptions = Object.entries(groups)
		.map(([name, { count, avgPL, sampleTrades }]) => {
			const samples = sampleTrades.map((t) =>
				`  entry:${t.entryAt.slice(0, 16)} ${t.position} @${t.entryPrice} → exit:${t.exitAt.slice(0, 16)} @${t.exitPrice} P/L:${t.profitLoss.toFixed(5)} (${t.exitReason})`
			).join("\n");
			return `## ${name} (${count} trades, avg P/L: ${avgPL.toFixed(5)})\n${samples || "  (no trades)"}`;
		})
		.join("\n\n");

	const monthlyTable = sim.monthlySnapshots
		.map((s) => `${s.month}: 残高${s.balance}円, 投入${s.topUpTotal}円, ${s.tradeCount}回, 損益${s.pnl}円`)
		.join("\n");

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 2048,
		system: `You are a quantitative trading analyst. Analyze backtest results and provide actionable insights. Respond in Japanese.`,
		messages: [{
			role: "user",
			content: `${methodName}手法 ${symbol} ${timeframe}足のバックテスト結果:

勝率: ${sim.winRate}%
平均RR: ${sim.avgRR}
ROI: ${sim.roi}%
最終残高: ${sim.finalBalance}円（初期1万円、レバ1000倍）
累計投入: ${sim.totalTopUp}円
ゼロカット: ${sim.zeroCutCount}回

月次推移:
${monthlyTable}

グループ別:
${groupDescriptions}

以下を分析してください:
1. 勝ちパターンと負けパターンの違い
2. ゼロカットが発生した時期の特徴
3. 月次パフォーマンスの傾向
4. 手法の改善提案`,
		}],
	});

	return response.content[0].type === "text" ? response.content[0].text : "";
}
