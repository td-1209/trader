import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sentiments } from "../db/schema.js";
import { sentimentLatestQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const rows = await db
		.select()
		.from(sentiments)
		.orderBy(desc(sentiments.createdAt))
		.limit(100);

	return c.json(rows);
});

app.get("/latest", async (c) => {
	const query = sentimentLatestQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const [row] = await db
		.select()
		.from(sentiments)
		.where(eq(sentiments.target, query.data.target))
		.orderBy(desc(sentiments.createdAt))
		.limit(1);

	if (!row) {
		return c.json({ error: { code: "NOT_FOUND", message: "No sentiment found for target" } }, 404);
	}

	return c.json(row);
});

export { app as sentimentsRoutes };
