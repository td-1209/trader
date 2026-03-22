import { z } from "zod";

const domain = z.enum(["fx", "stock", "gold"]);

export const methodSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	description: z.string().nullable(),
	domain,
	timeframe: z.string().nullable(),
	config: z.record(z.unknown()),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type Method = z.infer<typeof methodSchema>;

export const methodQuerySchema = z.object({
	domain: domain.optional(),
	isActive: z.coerce.boolean().optional(),
});
