import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { methods } from "../db/schema.js";
import { methodQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = methodQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { domain, isActive } = query.data;
	const conditions = [];
	if (domain) conditions.push(eq(methods.domain, domain));
	if (isActive !== undefined) conditions.push(eq(methods.isActive, isActive));

	const rows = await db
		.select()
		.from(methods)
		.where(conditions.length > 0 ? and(...conditions) : undefined);

	return c.json(rows);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");
	const [row] = await db.select().from(methods).where(eq(methods.id, id)).limit(1);
	if (!row) {
		return c.json({ error: { code: "NOT_FOUND", message: "Method not found" } }, 404);
	}
	return c.json(row);
});

export { app as methodsRoutes };
