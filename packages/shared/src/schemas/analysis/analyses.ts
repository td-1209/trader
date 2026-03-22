import { z } from "zod";

const analysisType = z.enum(["flash_report", "improvement", "strategy"]);
const analysisStatus = z.enum(["pending", "running", "completed", "failed"]);

export const analysisSchema = z.object({
	id: z.string().uuid(),
	type: analysisType,
	status: analysisStatus,
	trigger: z.string(),
	symbol: z.string().nullable(),
	title: z.string(),
	content: z.string(),
	metadata: z.record(z.unknown()),
	sourceTrades: z.array(z.string().uuid()),
	createdAt: z.string().datetime(),
});

export type Analysis = z.infer<typeof analysisSchema>;

export const analysisInsertSchema = z.object({
	type: analysisType,
	symbol: z.string().optional(),
});

export const analysisQuerySchema = z.object({
	type: analysisType.optional(),
	symbol: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(20),
});
