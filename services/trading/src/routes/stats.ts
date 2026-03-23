import { Hono } from "hono";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";
import { db } from "../db/client.js";
import { trades, cashflows } from "../db/schema.js";

const app = new Hono();

app.get("/pnl", async (c) => {
	const from = c.req.query("from");
	const to = c.req.query("to");
	const domain = c.req.query("domain");
	const methodId = c.req.query("method");

	const conditions = [eq(trades.status, "exited")];
	if (from) conditions.push(gte(trades.exitAt, new Date(from)));
	if (to) conditions.push(lte(trades.exitAt, new Date(to)));
	if (domain) conditions.push(eq(trades.domain, domain));
	if (methodId) conditions.push(eq(trades.method, methodId));

	const [result] = await db
		.select({
			totalPnl: sum(trades.profitLoss),
			tradeCount: count(),
			winCount: count(sql`CASE WHEN ${trades.profitLoss}::numeric > 0 THEN 1 END`),
			lossCount: count(sql`CASE WHEN ${trades.profitLoss}::numeric <= 0 THEN 1 END`),
		})
		.from(trades)
		.where(and(...conditions));

	return c.json({
		totalPnl: result.totalPnl ?? "0",
		tradeCount: result.tradeCount,
		winCount: result.winCount,
		lossCount: result.lossCount,
	});
});

app.get("/balance", async (c) => {
	const rows = await db
		.select({
			executedAt: cashflows.executedAt,
			amount: cashflows.amount,
		})
		.from(cashflows)
		.orderBy(cashflows.executedAt);

	let balance = 0;
	const history = rows.map((row) => {
		balance += Number(row.amount);
		return { date: row.executedAt, balance: String(balance) };
	});

	return c.json(history);
});

export { app as statsRoutes };
