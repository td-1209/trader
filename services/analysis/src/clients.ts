const TRADING_URL = process.env.TRADING_URL ?? "http://trading:3001";
const RESEARCH_URL = process.env.RESEARCH_URL ?? "http://research:3002";

async function fetchJSON<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
	return res.json() as Promise<T>;
}

interface Trade {
	id: string;
	symbol: string;
	domain: string;
	position: string;
	status: string;
	exposure: string;
	entryPrice: string | null;
	exitPrice: string | null;
	profitLoss: string | null;
	reasonDescription: string | null;
	resultDescription: string | null;
	entryAt: string | null;
	exitAt: string | null;
}

interface Candle {
	symbol: string;
	timeframe: string;
	open: string;
	high: string;
	low: string;
	close: string;
	timestamp: string;
}

interface NewsItem {
	headline: string;
	summary: string | null;
	category: string | null;
	publishedAt: string;
}

interface Sentiment {
	target: string;
	score: string | null;
	label: string | null;
	summary: string | null;
	mentions: number | null;
	createdAt: string;
}

interface CalendarEvent {
	country: string;
	name: string;
	impact: string | null;
	actual: string | null;
	forecast: string | null;
	previous: string | null;
	scheduledAt: string;
}

export async function fetchTrades(params: { symbol?: string; status?: string; limit?: number } = {}): Promise<Trade[]> {
	const query = new URLSearchParams();
	if (params.symbol) query.set("symbol", params.symbol);
	if (params.status) query.set("status", params.status);
	if (params.limit) query.set("limit", String(params.limit));
	return fetchJSON(`${TRADING_URL}/trades?${query}`);
}

export async function fetchCandles(params: { symbol: string; from?: string; to?: string; limit?: number }): Promise<Candle[]> {
	const query = new URLSearchParams({ symbol: params.symbol });
	if (params.from) query.set("from", params.from);
	if (params.to) query.set("to", params.to);
	if (params.limit) query.set("limit", String(params.limit));
	return fetchJSON(`${TRADING_URL}/candles?${query}`);
}

export async function fetchNews(params: { symbol?: string; limit?: number } = {}): Promise<NewsItem[]> {
	const query = new URLSearchParams();
	if (params.symbol) query.set("symbol", params.symbol);
	if (params.limit) query.set("limit", String(params.limit));
	return fetchJSON(`${RESEARCH_URL}/news?${query}`);
}

export async function fetchLatestSentiment(target: string): Promise<Sentiment | null> {
	try {
		return await fetchJSON(`${RESEARCH_URL}/sentiments/latest?target=${encodeURIComponent(target)}`);
	} catch {
		return null;
	}
}

export async function fetchCalendars(params: { from?: string; to?: string; impact?: string } = {}): Promise<CalendarEvent[]> {
	const query = new URLSearchParams();
	if (params.from) query.set("from", params.from);
	if (params.to) query.set("to", params.to);
	if (params.impact) query.set("impact", params.impact);
	return fetchJSON(`${RESEARCH_URL}/calendars?${query}`);
}
