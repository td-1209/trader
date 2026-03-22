import { z } from "zod";

export const strategySchema = z.object({
	id: z.string().uuid(),
	analysis: z.string().uuid().nullable(),
	symbol: z.string(),
	position: z.enum(["long", "short"]).nullable(),
	entryPrice: z.string().nullable(),
	takeProfitPrice: z.string().nullable(),
	stopLossPrice: z.string().nullable(),
	confidence: z.string().nullable(),
	rationale: z.string(),
	validFromAt: z.string().datetime(),
	validUntilAt: z.string().datetime(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type Strategy = z.infer<typeof strategySchema>;

export const strategyQuerySchema = z.object({
	symbol: z.string().optional(),
	active: z.coerce.boolean().optional(),
});
