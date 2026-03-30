import cron from "node-cron";
import { desc, gte } from "drizzle-orm";
import { db } from "./db/client.js";
import { news, calendars, sentiments } from "./db/schema.js";
import { fetchNews, fetchEconomicCalendar } from "./finnhub.js";
import { analyzeSentiment } from "./claude.js";

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

		await db.insert(news).values(values).onConflictDoNothing();
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
	// 起動時: ニュース取得 → 完了後にセンチメント分析
	newsJob().then(() => sentimentJob());
	calendarJob();

	// 定期実行（cron式）
	cron.schedule("*/5 * * * *", newsJob);        // 5分ごと: ニュース取得
	cron.schedule("0 * * * *", calendarJob);       // 毎時0分: 経済カレンダー
	cron.schedule("5 9 * * *", sentimentJob);       // 毎日9:05 UTC: センチメント

	console.log("Research jobs started (node-cron)");
}
