import { z } from "zod";

const domain = z.enum(["fx", "stock", "gold"]);
const position = z.enum(["long", "short"]);
const status = z.enum(["open", "exited"]);

export const tradeSchema = z.object({
	id: z.string().uuid(),
	method: z.string().uuid().nullable(),
	symbol: z.string(),
	domain,
	position,
	status,
	exposure: z.string(),
	entryPrice: z.string().nullable(),
	exitPrice: z.string().nullable(),
	takeProfitPrice: z.string().nullable(),
	stopLossPrice: z.string().nullable(),
	profitLoss: z.string().nullable(),
	isDemo: z.boolean(),
	isManual: z.boolean(),
	brokerOrder: z.string().nullable(),
	reasonDescription: z.string().nullable(),
	resultDescription: z.string().nullable(),
	reasonImage: z.string().nullable(),
	resultImage: z.string().nullable(),
	entryAt: z.string().datetime().nullable(),
	exitAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type Trade = z.infer<typeof tradeSchema>;

export const tradeInsertSchema = z.object({
	method: z.string().uuid().optional(),
	symbol: z.string().min(1),
	domain,
	position,
	exposure: z.string().min(1),
	entryPrice: z.string().optional(),
	takeProfitPrice: z.string().optional(),
	stopLossPrice: z.string().optional(),
	isDemo: z.boolean().optional(),
	reasonDescription: z.string().optional(),
});

export type TradeInsert = z.infer<typeof tradeInsertSchema>;

export const tradeUpdateSchema = z.object({
	status: status.optional(),
	exitPrice: z.string().optional(),
	profitLoss: z.string().optional(),
	reasonDescription: z.string().optional(),
	resultDescription: z.string().optional(),
});

export type TradeUpdate = z.infer<typeof tradeUpdateSchema>;

export const tradeQuerySchema = z.object({
	symbol: z.string().optional(),
	domain: domain.optional(),
	status: status.optional(),
	isDemo: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().positive().max(200).default(50),
	offset: z.coerce.number().int().nonnegative().default(0),
});
