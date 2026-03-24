import { desc, gte, sql, and } from "drizzle-orm";
import { db } from "./db/client.js";
import { news, calendars, sentiments } from "./db/schema.js";
import { fetchNews, fetchEconomicCalendar } from "./finnhub.js";
import { analyzeSentiment } from "./claude.js";

const NEWS_INTERVAL = 5 * 60 * 1000;
const CALENDAR_INTERVAL = 60 * 60 * 1000;
const SENTIMENT_INTERVAL = 60 * 60 * 1000;
const STARTUP_DELAY = 10_000;

const SENTIMENT_TARGETS = (process.env.SENTIMENT_TARGETS ?? "USD/JPY,EUR/USD,XAU/USD").split(",");

async function newsJob() {
	try {
		const items = [
			...(await fetchNews("general")),
			...(await fetchNews("forex")),
		];

		if (items.length === 0) return;

		const values = items.map((item) => ({
			source: "finnhub",
			external: String(item.id),
			headline: item.headline,
			summary: item.summary || null,
			url: item.url || null,
			category: item.category || null,
			relatedSymbols: item.related ? item.related.split(",").filter(Boolean) : [],
			publishedAt: new Date(item.datetime * 1000),
		}));

		const result = await db.insert(news).values(values).onConflictDoNothing();
		console.log(`News job: fetched ${items.length}, inserted new items`);
	} catch (err) {
		console.error("News job failed:", err);
	}
}

async function calendarJob() {
	try {
		const today = new Date();
		const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
		const from = today.toISOString().slice(0, 10);
		const to = nextWeek.toISOString().slice(0, 10);

		const items = await fetchEconomicCalendar(from, to);
		if (items.length === 0) return;

		for (const item of items) {
			const externalId = `${item.event}:${item.time}`;
			const values = {
				source: "finnhub",
				external: externalId,
				country: item.country,
				name: item.event,
				impact: item.impact || null,
				actual: item.actual ?? null,
				forecast: item.estimate ?? null,
				previous: item.prev ?? null,
				scheduledAt: new Date(item.time),
			};

			await db
				.insert(calendars)
				.values(values)
				.onConflictDoUpdate({
					target: [calendars.source, calendars.external],
					set: { actual: values.actual, forecast: values.forecast, previous: values.previous },
				});
		}

		console.log(`Calendar job: processed ${items.length} events`);
	} catch (err) {
		console.error("Calendar job failed:", err);
	}
}

async function sentimentJob() {
	for (const target of SENTIMENT_TARGETS) {
		try {
			const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const recentNews = await db
				.select({ headline: news.headline, summary: news.summary })
				.from(news)
				.where(gte(news.publishedAt, since))
				.orderBy(desc(news.publishedAt))
				.limit(20);

			if (recentNews.length === 0) {
				console.log(`Sentiment job: no recent news for ${target}, skipping`);
				continue;
			}

			const result = await analyzeSentiment(target, recentNews);
			if (!result) continue;

			await db.insert(sentiments).values({
				source: "claude",
				target,
				score: result.score,
				label: result.label,
				summary: result.summary,
				mentions: result.mentions,
			});

			console.log(`Sentiment job: ${target} → ${result.label} (${result.score})`);
		} catch (err) {
			console.error(`Sentiment job failed for ${target}:`, err);
		}
	}
}

export function startJobs() {
	setTimeout(() => {
		newsJob();
		calendarJob();
		sentimentJob();
	}, STARTUP_DELAY);

	setInterval(newsJob, NEWS_INTERVAL);
	setInterval(calendarJob, CALENDAR_INTERVAL);
	setInterval(sentimentJob, SENTIMENT_INTERVAL);

	console.log("Research jobs started");
}
