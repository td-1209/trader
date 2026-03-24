import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { trades, methods } from "../db/schema.js";
import {
	tradeInsertSchema,
	tradeUpdateSchema,
	tradeQuerySchema,
} from "@trader/shared";
import { mt5Bridge } from "../broker/mt5-bridge.js";
import { positionCache } from "../positions.js";
import { sendDiscordNotification } from "@trader/notify";
import { broadcast } from "../ws/server.js";

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
	let brokerOrder: string | null = null;
	let entryPrice = data.entryPrice ?? null;

	// ブローカー経由で注文（デモでなく、MT5ブリッジが接続中の場合）
	if (!data.isDemo && mt5Bridge.isConnected()) {
		try {
			const volume = Number(data.exposure) / 100000; // exposure → lot変換（例: 100000 = 1lot）
			const result = await mt5Bridge.placeOrder(data.symbol, data.position, volume);
			if (!result.success) {
				return c.json({ error: { code: "INTERNAL_ERROR", message: `Order rejected: ${result.error}` } }, 500);
			}
			brokerOrder = result.ticket ?? null;
			entryPrice = result.price ?? entryPrice;
		} catch (err) {
			return c.json({ error: { code: "INTERNAL_ERROR", message: "MT5 bridge timeout" } }, 500);
		}
	}

	const [row] = await db
		.insert(trades)
		.values({
			method: data.method ?? null,
			symbol: data.symbol,
			domain: data.domain,
			position: data.position,
			status: "open",
			exposure: data.exposure,
			entryPrice,
			takeProfitPrice: data.takeProfitPrice ?? null,
			stopLossPrice: data.stopLossPrice ?? null,
			isDemo: data.isDemo ?? false,
			isManual: true,
			brokerOrder,
			reasonDescription: data.reasonDescription ?? null,
			entryAt: new Date(),
		})
		.returning();

	positionCache.addPosition({
		id: row.id,
		symbol: row.symbol,
		position: row.position,
		exposure: row.exposure,
		entryPrice: row.entryPrice,
		takeProfitPrice: row.takeProfitPrice,
		stopLossPrice: row.stopLossPrice,
		brokerOrder: row.brokerOrder,
		isDemo: row.isDemo,
	});

	broadcast({
		type: "position",
		tradeId: row.id,
		status: "open",
		symbol: row.symbol,
		position: row.position,
		entryPrice: row.entryPrice,
	});

	await sendDiscordNotification({
		content: `📊 約定: ${row.symbol} ${row.position} @ ${row.entryPrice ?? "N/A"} (${Number(row.exposure).toLocaleString()}円)`,
		channel: "trade",
	});

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

	// ブローカー経由で決済
	if (data.status === "exited" && existing.brokerOrder && !existing.isDemo && mt5Bridge.isConnected()) {
		try {
			const result = await mt5Bridge.closePosition(existing.brokerOrder);
			if (!result.success) {
				return c.json({ error: { code: "INTERNAL_ERROR", message: `Close rejected: ${result.error}` } }, 500);
			}
			data.exitPrice = data.exitPrice ?? result.price ?? undefined;
			if (result.profit) data.profitLoss = data.profitLoss ?? result.profit;
		} catch (err) {
			return c.json({ error: { code: "INTERNAL_ERROR", message: "MT5 bridge timeout" } }, 500);
		}
	}

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (data.status) updates.status = data.status;
	if (data.exitPrice) updates.exitPrice = data.exitPrice;
	if (data.profitLoss) updates.profitLoss = data.profitLoss;
	if (data.reasonDescription !== undefined) updates.reasonDescription = data.reasonDescription;
	if (data.resultDescription !== undefined) updates.resultDescription = data.resultDescription;
	if (data.status === "exited") updates.exitAt = new Date();

	const [row] = await db.update(trades).set(updates).where(eq(trades.id, id)).returning();

	if (data.status === "exited") {
		positionCache.removePosition(id);

		broadcast({
			type: "position",
			tradeId: row.id,
			status: "exited",
			symbol: row.symbol,
			position: row.position,
			exitPrice: row.exitPrice,
			profitLoss: row.profitLoss,
		});

		const pl = Number(row.profitLoss ?? 0);
		await sendDiscordNotification({
			content: `📊 決済: ${row.symbol} ${row.position} @ ${row.exitPrice ?? "N/A"} (P/L: ${pl >= 0 ? "+" : ""}${Math.round(pl).toLocaleString()}円)`,
			channel: "trade",
		});
	}

	return c.json(row);
});

export { app as tradesRoutes };
