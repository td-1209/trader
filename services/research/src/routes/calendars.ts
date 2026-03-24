import { Hono } from "hono";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { calendars } from "../db/schema.js";
import { calendarQuerySchema } from "@trader/shared";

const app = new Hono();

app.get("/", async (c) => {
	const query = calendarQuerySchema.safeParse(c.req.query());
	if (!query.success) {
		return c.json(
			{ error: { code: "BAD_REQUEST", message: "Validation failed", details: query.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } },
			400,
		);
	}

	const { country, impact, from, to } = query.data;
	const conditions = [];
	if (country) conditions.push(eq(calendars.country, country));
	if (impact) conditions.push(eq(calendars.impact, impact));
	if (from) conditions.push(gte(calendars.scheduledAt, new Date(from)));
	if (to) conditions.push(lte(calendars.scheduledAt, new Date(to)));

	const rows = await db
		.select()
		.from(calendars)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(calendars.scheduledAt));

	return c.json(rows);
});

export { app as calendarsRoutes };
