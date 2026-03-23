import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { trades, methods } from "../db/schema.js";
import {
	tradeInsertSchema,
	tradeUpdateSchema,
	tradeQuerySchema,
} from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = tradeQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { symbol, domain, status, isDemo, limit, offset } = query.data;
	const conditions = [];
	if (symbol) conditions.push(eq(trades.symbol, symbol));
	if (domain) conditions.push(eq(trades.domain, domain));
	if (status) conditions.push(eq(trades.status, status));
	if (isDemo !== undefined) conditions.push(eq(trades.isDemo, isDemo));

	const rows = await db
		.select()
		.from(trades)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(trades.createdAt))
		.limit(limit)
		.offset(offset);

	return c.json(rows);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");
	const [row] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
	if (!row) {
		return c.json({ error: { code: "NOT_FOUND", message: "Trade not found" } }, 404);
	}
	return c.json(row);
});

app.post("/", async (c) => {
	const body = tradeInsertSchema.safeParse(await c.req.json());
	if (!body.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const data = body.data;
	const [row] = await db
		.insert(trades)
		.values({
			method: data.method ?? null,
			symbol: data.symbol,
			domain: data.domain,
			position: data.position,
			status: "open",
			exposure: data.exposure,
			entryPrice: data.entryPrice ?? null,
			takeProfitPrice: data.takeProfitPrice ?? null,
			stopLossPrice: data.stopLossPrice ?? null,
			isDemo: data.isDemo ?? false,
			isManual: true,
			reasonDescription: data.reasonDescription ?? null,
			entryAt: new Date(),
		})
		.returning();

	return c.json(row, 201);
});

app.patch("/:id", async (c) => {
	const id = c.req.param("id");
	const body = tradeUpdateSchema.safeParse(await c.req.json());
	if (!body.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const [existing] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
	if (!existing) {
		return c.json({ error: { code: "NOT_FOUND", message: "Trade not found" } }, 404);
	}

	const data = body.data;
	if (data.status === "exited" && existing.status === "exited") {
		return c.json({ error: { code: "CONFLICT", message: "Trade already exited" } }, 409);
	}

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (data.status) updates.status = data.status;
	if (data.exitPrice) updates.exitPrice = data.exitPrice;
	if (data.profitLoss) updates.profitLoss = data.profitLoss;
	if (data.reasonDescription !== undefined) updates.reasonDescription = data.reasonDescription;
	if (data.resultDescription !== undefined) updates.resultDescription = data.resultDescription;
	if (data.status === "exited") updates.exitAt = new Date();

	const [row] = await db.update(trades).set(updates).where(eq(trades.id, id)).returning();
	return c.json(row);
});

export { app as tradesRoutes };
