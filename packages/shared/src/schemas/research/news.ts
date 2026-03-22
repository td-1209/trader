import { z } from "zod";

export const newsSchema = z.object({
	id: z.string().uuid(),
	source: z.string(),
	external: z.string().nullable(),
	headline: z.string(),
	summary: z.string().nullable(),
	url: z.string().nullable(),
	category: z.string().nullable(),
	relatedSymbols: z.array(z.string()),
	publishedAt: z.string().datetime(),
	createdAt: z.string().datetime(),
});

export type News = z.infer<typeof newsSchema>;

export const newsQuerySchema = z.object({
	symbol: z.string().optional(),
	category: z.string().optional(),
	limit: z.coerce.number().int().positive().max(200).default(50),
});
