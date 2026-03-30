import {
	boolean,
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

const trading = pgSchema("trading");

export const methods = trading.table(
	"methods",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		name: text().notNull(),
		description: text(),
		domain: text().notNull(),
		timeframe: text(),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
		symbol: text(),
		mode: text().notNull().default("notify"),
	},
	(t) => [index("idx_methods_domain_active").on(t.domain, t.isActive)],
);

export const trades = trading.table(
	"trades",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		method: uuid().references(() => methods.id),
		symbol: text().notNull(),
		domain: text().notNull(),
		position: text().notNull(),
		status: text().notNull(),
		exposure: decimal({ precision: 20, scale: 8 }).notNull(),
		entryPrice: decimal("entry_price", { precision: 20, scale: 8 }),
		exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
		takeProfitPrice: decimal("take_profit_price", { precision: 20, scale: 8 }),
		stopLossPrice: decimal("stop_loss_price", { precision: 20, scale: 8 }),
		profitLoss: decimal("profit_loss", { precision: 20, scale: 8 }),
		isDemo: boolean("is_demo").notNull().default(false),
		isManual: boolean("is_manual").notNull().default(true),
		brokerOrder: text("broker_order"),
		reasonDescription: text("reason_description"),
		resultDescription: text("result_description"),
		reasonImage: text("reason_image"),
		resultImage: text("result_image"),
		entryAt: timestamp("entry_at", { withTimezone: true }),
		exitAt: timestamp("exit_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		index("idx_trades_status").on(t.status).where(sql`status = 'open'`),
		index("idx_trades_symbol_entry").on(t.symbol, t.entryAt),
		index("idx_trades_method").on(t.method),
		index("idx_trades_domain").on(t.domain, t.entryAt),
		index("idx_trades_is_demo").on(t.isDemo).where(sql`is_demo = false`),
		index("idx_trades_exit_at").on(t.exitAt),
	],
);

export const cashflows = trading.table(
	"cashflows",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
		amount: decimal({ precision: 20, scale: 8 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [index("idx_cashflows_executed_at").on(t.executedAt)],
);

export const candles = trading.table(
	"candles",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		symbol: text().notNull(),
		timeframe: text().notNull().default("5m"),
		open: decimal({ precision: 20, scale: 8 }).notNull(),
		high: decimal({ precision: 20, scale: 8 }).notNull(),
		low: decimal({ precision: 20, scale: 8 }).notNull(),
		close: decimal({ precision: 20, scale: 8 }).notNull(),
		timestamp: timestamp({ withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		unique("uq_candles_symbol_tf_ts").on(t.symbol, t.timeframe, t.timestamp),
		index("idx_candles_symbol_tf_ts").on(t.symbol, t.timeframe, t.timestamp),
	],
);
