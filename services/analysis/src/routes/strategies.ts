import { Hono } from "hono";
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { strategies } from "../db/schema.js";
import { strategyQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = strategyQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { symbol, active } = query.data;
	const conditions = [];
	if (symbol) conditions.push(eq(strategies.symbol, symbol));
	if (active) conditions.push(gte(strategies.validUntilAt, new Date()));

	const rows = await db
		.select()
		.from(strategies)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(strategies.createdAt));

	return c.json(rows);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");
	const [row] = await db.select().from(strategies).where(eq(strategies.id, id)).limit(1);
	if (!row) {
		return c.json({ error: { code: "NOT_FOUND", message: "Strategy not found" } }, 404);
	}
	return c.json(row);
});

export { app as strategiesRoutes };
