import {
	decimal,
	index,
	jsonb,
	pgSchema,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const analysis = pgSchema("analysis");

export const analyses = analysis.table(
	"analyses",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		type: text().notNull(),
		status: text().notNull().default("completed"),
		trigger: text().notNull(),
		symbol: text(),
		title: text().notNull(),
		content: text().notNull(),
		metadata: jsonb().notNull().default({}),
		sourceTrades: uuid("source_trades").array().default(sql`'{}'`),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		index("idx_analyses_type_created").on(t.type, t.createdAt),
		index("idx_analyses_symbol").on(t.symbol, t.createdAt).where(sql`symbol IS NOT NULL`),
	],
);

export const strategies = analysis.table(
	"strategies",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		analysis: uuid().references(() => analyses.id),
		symbol: text().notNull(),
		position: text(),
		entryPrice: decimal("entry_price", { precision: 20, scale: 8 }),
		takeProfitPrice: decimal("take_profit_price", { precision: 20, scale: 8 }),
		stopLossPrice: decimal("stop_loss_price", { precision: 20, scale: 8 }),
		confidence: decimal({ precision: 3, scale: 2 }),
		rationale: text().notNull(),
		validFromAt: timestamp("valid_from_at", { withTimezone: true }).notNull(),
		validUntilAt: timestamp("valid_until_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [index("idx_strategies_symbol").on(t.symbol, t.createdAt)],
);
