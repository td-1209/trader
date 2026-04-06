import { db } from "../db/client.js";
import { candles } from "../db/schema.js";

const API_BASE = "https://api.tiingo.com/tiingo/fx";
const API_KEY = process.env.TIINGO_API_KEY;
const SYMBOL = "usdjpy";
const TIMEFRAME = "5m";
const RATE_LIMIT_DELAY = 75_000; // 75秒（50req/時 = 72秒/req + マージン）

interface TiingoCandle {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

async function fetchDay(date: string): Promise<TiingoCandle[]> {
	const url = `${API_BASE}/${SYMBOL}/prices?startDate=${date}&endDate=${date}&resampleFreq=${TIMEFRAME}&token=${API_KEY}`;
	const res = await fetch(url);

	if (res.status === 429) {
		console.log(`Rate limited, waiting 5 minutes...`);
		await sleep(300_000);
		return fetchDay(date);
	}

	if (!res.ok) {
		console.error(`Failed to fetch ${date}: ${res.status}`);
		return [];
	}

	return (await res.json()) as TiingoCandle[];
}

async function persistDay(items: TiingoCandle[]): Promise<number> {
	if (items.length === 0) return 0;

	const values = items.map((item) => ({
		symbol: SYMBOL.toUpperCase(),
		timeframe: TIMEFRAME,
		open: String(item.open),
		high: String(item.high),
		low: String(item.low),
		close: String(item.close),
		timestamp: new Date(item.date),
	}));

	await db.insert(candles).values(values).onConflictDoNothing();
	return values.length;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	if (!API_KEY) {
		console.error("TIINGO_API_KEY is required");
		process.exit(1);
	}

	const endDate = new Date();
	const startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

	console.log(`Loading ${SYMBOL.toUpperCase()} ${TIMEFRAME} data from ${formatDate(startDate)} to ${formatDate(endDate)}`);

	let totalInserted = 0;
	let requestCount = 0;
	const current = new Date(startDate);

	while (current <= endDate) {
		const dateStr = formatDate(current);
		const items = await fetchDay(dateStr);
		const inserted = await persistDay(items);
		totalInserted += inserted;
		requestCount++;

		if (items.length > 0) {
			console.log(`${dateStr}: ${inserted} candles (total: ${totalInserted}, requests: ${requestCount})`);
		} else {
			console.log(`${dateStr}: no data (market closed?) (requests: ${requestCount})`);
		}

		current.setDate(current.getDate() + 1);

		// レート制限: 50req/時
		if (current <= endDate) {
			await sleep(RATE_LIMIT_DELAY);
		}
	}

	console.log(`\nDone: ${totalInserted} candles inserted over ${requestCount} requests`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Data loader failed:", err);
	process.exit(1);
});
