import { eq, and, max } from "drizzle-orm";
import { db } from "../db/client.js";
import { candles } from "../db/schema.js";
import { sendDiscordNotification } from "@trader/notify";

const SYMBOLS = ["USDJPY", "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCHF", "EURGBP"];
const INTERVAL_MS = 5 * 60 * 1000;
const GAP_THRESHOLD_MS = 10 * 60 * 1000;

interface TiingoCandle {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
}

async function fetchRange(symbol: string, startDate: string, endDate: string, retries = 2): Promise<TiingoCandle[]> {
	const apiKey = process.env.TIINGO_API_KEY;
	const url = `https://api.tiingo.com/tiingo/fx/${symbol.toLowerCase()}/prices?startDate=${startDate}&endDate=${endDate}&resampleFreq=5Min&token=${apiKey}`;
	const res = await fetch(url);

	if (res.status === 429) {
		console.log(`Gap-fill ${symbol}: rate limited, waiting 1h`);
		await new Promise((r) => setTimeout(r, 3_600_000));
		return fetchRange(symbol, startDate, endDate, retries);
	}

	if (!res.ok) {
		if (retries > 0) {
			await new Promise((r) => setTimeout(r, 5000));
			return fetchRange(symbol, startDate, endDate, retries - 1);
		}
		throw new Error(`Tiingo ${res.status}: ${(await res.text()).slice(0, 100)}`);
	}

	return (await res.json()) as TiingoCandle[];
}

async function fillSymbol(symbol: string): Promise<{ symbol: string; inserted: number; error?: string }> {
	try {
		const [row] = await db
			.select({ latest: max(candles.timestamp) })
			.from(candles)
			.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, "5m")));

		const latest = row?.latest;
		if (!latest) return { symbol, inserted: 0, error: "no existing candles" };

		const now = Date.now();
		const gapMs = now - latest.getTime();
		if (gapMs < GAP_THRESHOLD_MS) return { symbol, inserted: 0 };

		const startDate = new Date(latest.getTime() + INTERVAL_MS).toISOString().slice(0, 10);
		const endDate = new Date(now).toISOString().slice(0, 10);

		const items = await fetchRange(symbol, startDate, endDate);
		if (items.length === 0) return { symbol, inserted: 0 };

		const rows = items
			.filter((it) => new Date(it.date).getTime() > latest.getTime())
			.map((it) => ({
				symbol,
				timeframe: "5m",
				open: String(it.open),
				high: String(it.high),
				low: String(it.low),
				close: String(it.close),
				timestamp: new Date(it.date),
			}));

		if (rows.length === 0) return { symbol, inserted: 0 };

		await db.insert(candles).values(rows).onConflictDoNothing();
		return { symbol, inserted: rows.length };
	} catch (err) {
		return { symbol, inserted: 0, error: String(err).slice(0, 200) };
	}
}

async function fillGaps(reason: string): Promise<void> {
	console.log(`Gap-fill triggered: ${reason}`);
	const results = await Promise.all(SYMBOLS.map((s) => fillSymbol(s)));

	const succeeded = results.filter((r) => !r.error);
	const failed = results.filter((r) => r.error);
	const totalInserted = succeeded.reduce((sum, r) => sum + r.inserted, 0);

	if (totalInserted === 0 && failed.length === 0) return;

	const lines = [
		`📊 ギャップ埋め完了 (${reason})`,
		`成功: ${succeeded.length}/${results.length} 通貨、合計 ${totalInserted} 本`,
	];
	if (failed.length > 0) {
		lines.push(`失敗: ${failed.map((f) => `${f.symbol}(${f.error})`).join(", ")}`);
	}
	const perSymbol = succeeded.filter((r) => r.inserted > 0).map((r) => `${r.symbol}:${r.inserted}`).join(" ");
	if (perSymbol) lines.push(perSymbol);

	await sendDiscordNotification({ content: lines.join("\n"), channel: "alert" });
}

export { fillGaps };
