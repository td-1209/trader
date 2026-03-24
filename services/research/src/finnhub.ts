const API_BASE = "https://finnhub.io/api/v1";
const MAX_REQUESTS_PER_MIN = 55; // 60制限に対してマージン
const requestTimestamps: number[] = [];

interface FinnhubNewsItem {
	id: number;
	headline: string;
	summary: string;
	url: string;
	source: string;
	datetime: number;
	category: string;
	related: string;
}

interface FinnhubCalendarEvent {
	country: string;
	event: string;
	impact: string;
	actual: string | null;
	estimate: string | null;
	prev: string | null;
	time: string;
	unit: string;
}

async function rateLimitedFetch(url: string): Promise<Response | null> {
	const now = Date.now();
	const windowStart = now - 60_000;
	while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
		requestTimestamps.shift();
	}

	if (requestTimestamps.length >= MAX_REQUESTS_PER_MIN) {
		console.warn("Finnhub rate limit reached, skipping request");
		return null;
	}

	requestTimestamps.push(now);
	return fetch(url);
}

export async function fetchNews(category: string): Promise<FinnhubNewsItem[]> {
	const apiKey = process.env.FINNHUB_API_KEY;
	if (!apiKey) return [];

	try {
		const res = await rateLimitedFetch(`${API_BASE}/news?category=${category}&token=${apiKey}`);
		if (!res || !res.ok) return [];
		return (await res.json()) as FinnhubNewsItem[];
	} catch (err) {
		console.error("Finnhub news fetch failed:", err);
		return [];
	}
}

export async function fetchEconomicCalendar(from: string, to: string): Promise<FinnhubCalendarEvent[]> {
	const apiKey = process.env.FINNHUB_API_KEY;
	if (!apiKey) return [];

	try {
		const res = await rateLimitedFetch(`${API_BASE}/calendar/economic?from=${from}&to=${to}&token=${apiKey}`);
		if (!res || !res.ok) return [];
		const data = (await res.json()) as Record<string, unknown>;
		return ((data?.economicCalendar as FinnhubCalendarEvent[]) ?? []);
	} catch (err) {
		console.error("Finnhub calendar fetch failed:", err);
		return [];
	}
}
