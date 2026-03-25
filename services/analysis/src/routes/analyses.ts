import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { analyses } from "../db/schema.js";
import { analysisInsertSchema, analysisQuerySchema } from "@trader/shared";
import { runAnalysis } from "../orchestrator.js";

const app = new Hono();

app.get("/", async (c) => {
	const query = analysisQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { type, symbol, limit } = query.data;
	const conditions = [];
	if (type) conditions.push(eq(analyses.type, type));
	if (symbol) conditions.push(eq(analyses.symbol, symbol));

	const rows = await db
		.select()
		.from(analyses)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(analyses.createdAt))
		.limit(limit);

	return c.json(rows);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");
	const [row] = await db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
	if (!row) {
		return c.json({ error: { code: "NOT_FOUND", message: "Analysis not found" } }, 404);
	}
	return c.json(row);
});

app.post("/", async (c) => {
	const body = analysisInsertSchema.safeParse(await c.req.json());
	if (!body.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { type, symbol } = body.data;

	const [row] = await db
		.insert(analyses)
		.values({
			type,
			status: "pending",
			trigger: "manual",
			symbol: symbol ?? null,
			title: "生成中...",
			content: "",
			metadata: {},
		})
		.returning();

	// バックグラウンドで実行
	runAnalysis(row.id, type, symbol ?? null, "manual");

	return c.json(row, 202);
});

export { app as analysesRoutes };
