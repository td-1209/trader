import { z } from "zod";

const impact = z.enum(["low", "medium", "high"]);

export const calendarSchema = z.object({
	id: z.string().uuid(),
	source: z.string(),
	external: z.string().nullable(),
	country: z.string(),
	name: z.string(),
	impact: impact.nullable(),
	actual: z.string().nullable(),
	forecast: z.string().nullable(),
	previous: z.string().nullable(),
	scheduledAt: z.string().datetime(),
	createdAt: z.string().datetime(),
});

export type Calendar = z.infer<typeof calendarSchema>;

export const calendarQuerySchema = z.object({
	country: z.string().optional(),
	impact: impact.optional(),
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});
