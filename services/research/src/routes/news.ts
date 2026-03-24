import { Hono } from "hono";
import { desc, eq, sql, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { news } from "../db/schema.js";
import { newsQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = newsQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { symbol, category, limit } = query.data;
	const conditions = [];
	if (symbol) conditions.push(sql`${symbol} = ANY(${news.relatedSymbols})`);
	if (category) conditions.push(eq(news.category, category));

	const rows = await db
		.select()
		.from(news)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(news.publishedAt))
		.limit(limit);

	return c.json(rows);
});

export { app as newsRoutes };
