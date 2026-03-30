import cron from "node-cron";
import { db } from "./db/client.js";
import { analyses } from "./db/schema.js";
import { runAnalysis, ANALYSIS_TARGETS } from "./orchestrator.js";
import { fetchTrades, fetchCandles } from "./clients.js";

async function flashReportJob() {
	for (const symbol of ANALYSIS_TARGETS) {
		try {
			// 直近の価格データから急変を検出
			const candles = await fetchCandles({ symbol, limit: 12 });
			if (candles.length < 2) continue;

			const latest = Number(candles[0].close);
			const oldest = Number(candles[candles.length - 1].close);
			const changePercent = Math.abs((latest - oldest) / oldest) * 100;

			// 1%以上の変動があれば速報生成
			const threshold = symbol.includes("XAU") ? 0.5 : 1.0;
			if (changePercent < threshold) continue;

			console.log(`Flash report triggered: ${symbol} ${changePercent.toFixed(2)}% change`);

			const [row] = await db
				.insert(analyses)
				.values({
					type: "flash_report",
					status: "pending",
					trigger: "price_spike",
					symbol,
					title: "生成中...",
					content: "",
					metadata: {},
				})
				.returning();

			await runAnalysis(row.id, "flash_report", symbol, "price_spike");
		} catch (err) {
			console.error(`Flash report job failed for ${symbol}:`, err);
		}
	}
}

async function improvementJob() {
	try {
		const trades = await fetchTrades({ status: "exited", limit: 50 });
		if (trades.length < 3) {
			console.log("Improvement job: not enough trades, skipping");
			return;
		}

		const [row] = await db
			.insert(analyses)
			.values({
				type: "improvement",
				status: "pending",
				trigger: "weekly_scheduled",
				symbol: null,
				title: "生成中...",
				content: "",
				metadata: {},
			})
			.returning();

		await runAnalysis(row.id, "improvement", null, "weekly_scheduled");
	} catch (err) {
		console.error("Improvement job failed:", err);
	}
}

export function startJobs() {
	// 速報分析: 4時間ごと
	cron.schedule("0 */4 * * *", flashReportJob);

	// 改善提案: 毎週月曜JST 9:00（UTC 0:00）
	cron.schedule("0 0 * * 1", improvementJob);

	console.log("Analysis jobs started (node-cron)");
}
