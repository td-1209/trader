import { z } from "zod";

export const cashflowSchema = z.object({
	id: z.string().uuid(),
	executedAt: z.string().datetime(),
	amount: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type Cashflow = z.infer<typeof cashflowSchema>;

export const cashflowInsertSchema = z.object({
	executedAt: z.string().datetime(),
	amount: z.string().min(1),
});

export type CashflowInsert = z.infer<typeof cashflowInsertSchema>;
