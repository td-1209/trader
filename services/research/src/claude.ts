import Anthropic from "@anthropic-ai/sdk";

interface NewsItem {
	headline: string;
	summary: string | null;
}

interface SentimentResult {
	score: string;
	label: "bearish" | "neutral" | "bullish";
	summary: string;
	mentions: number;
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
	if (!process.env.ANTHROPIC_API_KEY) return null;
	if (!client) client = new Anthropic();
	return client;
}

export async function analyzeSentiment(target: string, newsItems: NewsItem[]): Promise<SentimentResult | null> {
	const anthropic = getClient();
	if (!anthropic) return null;
	if (newsItems.length === 0) return null;

	const newsText = newsItems
		.map((n, i) => `${i + 1}. ${n.headline}${n.summary ? ` - ${n.summary}` : ""}`)
		.join("\n");

	const response = await anthropic.messages.create({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 512,
		system: `You are a forex market sentiment analyst. Analyze news headlines for the given currency pair or asset and return a JSON object with:
- "score": number from -1.0 (extremely bearish) to 1.0 (extremely bullish)
- "label": "bearish", "neutral", or "bullish"
- "summary": 1-2 sentence summary in Japanese
- "mentions": count of articles directly relevant to the target
Return ONLY valid JSON, no markdown.`,
		messages: [
			{
				role: "user",
				content: `Target: ${target}\n\nRecent news:\n${newsText}`,
			},
		],
	});

	const text = response.content[0].type === "text" ? response.content[0].text : "";

	try {
		const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
		const parsed = JSON.parse(cleaned);
		return {
			score: String(parsed.score),
			label: parsed.label,
			summary: parsed.summary,
			mentions: parsed.mentions,
		};
	} catch {
		console.error("Failed to parse sentiment response:", text);
		return null;
	}
}
