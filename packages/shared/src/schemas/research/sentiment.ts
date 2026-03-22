import { z } from "zod";

const label = z.enum(["bearish", "neutral", "bullish"]);

export const sentimentSchema = z.object({
	id: z.string().uuid(),
	source: z.string(),
	target: z.string(),
	score: z.string().nullable(),
	label: label.nullable(),
	summary: z.string().nullable(),
	mentions: z.number().int().nullable(),
	createdAt: z.string().datetime(),
});

export type Sentiment = z.infer<typeof sentimentSchema>;

export const sentimentLatestQuerySchema = z.object({
	target: z.string().min(1),
});
