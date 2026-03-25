import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { analyses, strategies } from "./db/schema.js";
import { fetchTrades, fetchCandles, fetchNews, fetchLatestSentiment, fetchCalendars } from "./clients.js";
import { generateImprovement, generateFlashReport, generateStrategy } from "./claude.js";
import { sendDiscordNotification } from "@trader/notify";

const ANALYSIS_TARGETS = (process.env.ANALYSIS_TARGETS ?? "USD/JPY,EUR/USD,XAU/USD").split(",");

export async function runAnalysis(analysisId: string, type: string, symbol: string | null, trigger: string): Promise<void> {
	try {
		await db.update(analyses).set({ status: "running" }).where(eq(analyses.id, analysisId));

		let result: { title: string; content: string; metadata: Record<string, unknown> };

		if (type === "improvement") {
			const trades = await fetchTrades({ status: "exited", limit: 50 });
			const candles = trades.length > 0
				? await fetchCandles({ symbol: trades[0].symbol, limit: 100 })
				: [];
			result = await generateImprovement(trades, candles);
		} else if (type === "flash_report") {
			const target = symbol ?? ANALYSIS_TARGETS[0];
			const [candles, news, sentiment, calendars] = await Promise.all([
				fetchCandles({ symbol: target, limit: 48 }),
				fetchNews({ limit: 20 }),
				fetchLatestSentiment(target),
				fetchCalendars({ impact: "high" }),
			]);
			result = await generateFlashReport(target, candles, news, sentiment, calendars);
		} else if (type === "strategy") {
			const target = symbol ?? ANALYSIS_TARGETS[0];
			const [candles, news, sentiment] = await Promise.all([
				fetchCandles({ symbol: target, limit: 48 }),
				fetchNews({ limit: 20 }),
				fetchLatestSentiment(target),
			]);
			const strategyResult = await generateStrategy(target, candles, news, sentiment);
			result = strategyResult;

			// 戦略をstrategiesテーブルに保存
			if (strategyResult.strategies?.length > 0) {
				const now = new Date();
				for (const s of strategyResult.strategies) {
					await db.insert(strategies).values({
						analysis: analysisId,
						symbol: s.symbol,
						position: s.position,
						entryPrice: s.entryPrice,
						takeProfitPrice: s.takeProfitPrice,
						stopLossPrice: s.stopLossPrice,
						confidence: s.confidence,
						rationale: s.rationale,
						validFromAt: now,
						validUntilAt: new Date(now.getTime() + (s.validHours ?? 24) * 60 * 60 * 1000),
					});
				}
			}
		} else {
			throw new Error(`Unknown analysis type: ${type}`);
		}

		await db.update(analyses).set({
			status: "completed",
			title: result.title,
			content: result.content,
			metadata: result.metadata,
		}).where(eq(analyses.id, analysisId));

		// Discord通知（速報・戦略のみ）— フォーラムスレッドにセクション分割投稿
		if (type === "flash_report" || type === "strategy") {
			const meta = result.metadata as Record<string, unknown>;

			// スレッド作成（タイトル + サマリー）
			let summary = `📊 **${result.title}**`;
			if (type === "flash_report" && Array.isArray(meta.scenarios)) {
				const scenarios = meta.scenarios as { name: string; probability: number; targetPrice: string }[];
				summary += "\n" + scenarios.map(s => `• ${s.name}: ${s.probability}%（${s.targetPrice}）`).join("\n");
			}

			const threadResult = await sendDiscordNotification({
				content: summary,
				channel: "market",
				threadName: result.title.slice(0, 100),
			});

			// スレッドに詳細をセクション分割で投稿
			if (threadResult?.channel_id) {
				const threadId = threadResult.channel_id;
				const sections = result.content.split(/\n(?=## )/).filter(Boolean);
				for (const section of sections) {
					if (section.trim().length === 0) continue;
					await sendDiscordNotification({
						content: section.slice(0, 2000),
						channel: "market",
						threadId,
					});
				}
			}
		}

		console.log(`Analysis completed: ${type} ${analysisId}`);
	} catch (err) {
		console.error(`Analysis failed: ${type} ${analysisId}`, err);
		await db.update(analyses).set({
			status: "failed",
			content: String(err),
		}).where(eq(analyses.id, analysisId));
	}
}

export { ANALYSIS_TARGETS };
