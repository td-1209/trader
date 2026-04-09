import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { backtestResults } from "../db/schema.js";
import { runBacktest } from "./runner.js";
import { analyzeBacktest } from "./analyzer.js";

const app = new Hono();

// バックテスト実行トリガー
app.post("/", async (c) => {
	const body = await c.req.json();
	const symbol = body.symbol ?? "USDJPY";
	const timeframe = body.timeframe ?? "5m";
	const startDate = body.startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);

	// バックグラウンド実行
	(async () => {
		try {
			const results = await runBacktest({ symbol, timeframe, startDate, endDate });
			for (const result of results) {
				await analyzeBacktest(result);
			}
		} catch (err) {
			console.error("Backtest failed:", err);
		}
	})();

	return c.json({ status: "started", symbol, timeframe, startDate, endDate }, 202);
});

// 結果一覧
app.get("/results", async (c) => {
	const results = await db
		.select()
		.from(backtestResults)
		.orderBy(desc(backtestResults.createdAt))
		.limit(20);
	return c.json(results);
});

// 結果詳細
app.get("/results/:id", async (c) => {
	const { id } = c.req.param();
	const [result] = await db
		.select()
		.from(backtestResults)
		.where(eq(backtestResults.id, id));
	if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Result not found" } }, 404);
	return c.json(result);
});

export { app as backtestRoutes };
