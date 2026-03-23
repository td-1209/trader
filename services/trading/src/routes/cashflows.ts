import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { cashflows } from "../db/schema.js";
import { cashflowInsertSchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const rows = await db
		.select()
		.from(cashflows)
		.orderBy(desc(cashflows.executedAt));

	return c.json(rows);
});

app.post("/", async (c) => {
	const body = cashflowInsertSchema.safeParse(await c.req.json());
	if (!body.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const [row] = await db
		.insert(cashflows)
		.values({
			executedAt: new Date(body.data.executedAt),
			amount: body.data.amount,
		})
		.returning();

	return c.json(row, 201);
});

export { app as cashflowsRoutes };
