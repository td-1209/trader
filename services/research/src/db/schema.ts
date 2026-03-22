import {
	decimal,
	index,
	integer,
	pgSchema,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const research = pgSchema("research");

export const news = research.table(
	"news",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		source: text().notNull(),
		external: text(),
		headline: text().notNull(),
		summary: text(),
		url: text(),
		category: text(),
		relatedSymbols: text("related_symbols").array().default(sql`'{}'`),
		publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		unique("uq_news_source_external").on(t.source, t.external),
		index("idx_news_published_at").on(t.publishedAt),
	],
);

export const calendars = research.table(
	"calendars",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		source: text().notNull().default("finnhub"),
		external: text(),
		country: text().notNull(),
		name: text().notNull(),
		impact: text(),
		actual: text(),
		forecast: text(),
		previous: text(),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		unique("uq_calendars_source_external").on(t.source, t.external),
		index("idx_calendars_scheduled").on(t.scheduledAt),
		index("idx_calendars_country_impact").on(t.country, t.impact),
	],
);

export const sentiments = research.table(
	"sentiments",
	{
		id: uuid().primaryKey().default(sql`gen_random_uuid()`),
		source: text().notNull(),
		target: text().notNull(),
		score: decimal({ precision: 5, scale: 4 }),
		label: text(),
		summary: text(),
		mentions: integer(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [index("idx_sentiments_target_created").on(t.target, t.createdAt)],
);
