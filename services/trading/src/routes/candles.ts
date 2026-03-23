import { Hono } from "hono";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles } from "../db/schema.js";
import { candleQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = candleQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { symbol, from, to, limit } = query.data;
	const conditions = [eq(candles.symbol, symbol)];
	if (from) conditions.push(gte(candles.timestamp, new Date(from)));
	if (to) conditions.push(lte(candles.timestamp, new Date(to)));

	const rows = await db
		.select()
		.from(candles)
		.where(and(...conditions))
		.orderBy(asc(candles.timestamp))
		.limit(limit);

	return c.json(rows);
});

export { app as candlesRoutes };
