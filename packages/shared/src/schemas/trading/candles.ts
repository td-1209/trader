import { z } from "zod";

export const candleSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	timeframe: z.string(),
	open: z.string(),
	high: z.string(),
	low: z.string(),
	close: z.string(),
	timestamp: z.string().datetime(),
	createdAt: z.string().datetime(),
});

export type Candle = z.infer<typeof candleSchema>;

export const candleQuerySchema = z.object({
	symbol: z.string().min(1),
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
	limit: z.coerce.number().int().positive().max(1000).default(300),
});
