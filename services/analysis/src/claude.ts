import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
	if (!client) client = new Anthropic();
	return client;
}

function parseJSON(text: string): Record<string, unknown> {
	const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
	return JSON.parse(cleaned);
}

interface AnalysisResult {
	title: string;
	content: string;
	metadata: Record<string, unknown>;
}

interface StrategyProposal {
	symbol: string;
	position: string | null;
	entryPrice: string | null;
	takeProfitPrice: string | null;
	stopLossPrice: string | null;
	confidence: string | null;
	rationale: string;
	validHours: number;
}

interface StrategyResult extends AnalysisResult {
	strategies: StrategyProposal[];
}

interface Trade {
	symbol: string;
	position: string;
	entryPrice: string | null;
	exitPrice: string | null;
	profitLoss: string | null;
	reasonDescription: string | null;
	resultDescription: string | null;
	entryAt: string | null;
	exitAt: string | null;
}

interface Candle {
	open: string;
	high: string;
	low: string;
	close: string;
	timestamp: string;
}

interface NewsItem {
	headline: string;
	summary: string | null;
}

interface Sentiment {
	score: string | null;
	label: string | null;
	summary: string | null;
}

export async function generateImprovement(trades: Trade[], candles: Candle[]): Promise<AnalysisResult> {
	const anthropic = getClient();

	const tradesText = trades.map((t, i) =>
		`${i + 1}. ${t.symbol} ${t.position} entry:${t.entryPrice} exit:${t.exitPrice} P/L:${t.profitLoss} reason:${t.reasonDescription ?? "N/A"} result:${t.resultDescription ?? "N/A"} (${t.entryAt} → ${t.exitAt})`
	).join("\n");

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 2048,
		system: `You are a professional trading coach analyzing FX trade history. Identify anti-patterns, recurring mistakes, and provide specific improvement suggestions. Return JSON with:
- "title": concise Japanese title
- "content": detailed analysis in Japanese markdown
- "metadata": {"winRate": number, "avgProfitLoss": number, "patterns": string[]}
Return ONLY valid JSON.`,
		messages: [{
			role: "user",
			content: `取引履歴（直近）:\n${tradesText}\n\n価格データ（最新${candles.length}本）は参考用です。`,
		}],
	});

	const text = response.content[0].type === "text" ? response.content[0].text : "";
	return parseJSON(text) as unknown as AnalysisResult;
}

export async function generateFlashReport(
	symbol: string,
	candles: Candle[],
	news: NewsItem[],
	sentiment: Sentiment | null,
	calendars: { name: string; impact: string | null; scheduledAt: string }[],
): Promise<AnalysisResult> {
	const anthropic = getClient();

	const recentCandles = candles.slice(-12).map(c =>
		`${c.timestamp}: O${c.open} H${c.high} L${c.low} C${c.close}`
	).join("\n");

	const newsText = news.slice(0, 10).map(n => n.headline).join("\n");

	const sentimentText = sentiment
		? `Score: ${sentiment.score}, Label: ${sentiment.label}, Summary: ${sentiment.summary}`
		: "N/A";

	const calendarText = calendars.length > 0
		? calendars.map(c => `${c.scheduledAt}: ${c.name} (impact: ${c.impact})`).join("\n")
		: "N/A";

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 2048,
		system: `You are a forex market analyst providing flash reports. Analyze the current situation for the given symbol and provide scenario analysis. Return JSON with:
- "title": concise Japanese title (e.g. "USD/JPY 速報: 地政学リスクで急落")
- "content": detailed analysis in Japanese markdown with bull/bear/base scenarios and probability estimates
- "metadata": {"scenarios": [{"name": string, "probability": number, "targetPrice": string}], "keyLevels": {"support": string[], "resistance": string[]}}
Return ONLY valid JSON.`,
		messages: [{
			role: "user",
			content: `Symbol: ${symbol}\n\n価格データ（5分足）:\n${recentCandles}\n\nニュース:\n${newsText}\n\nセンチメント:\n${sentimentText}\n\n経済指標:\n${calendarText}`,
		}],
	});

	const text = response.content[0].type === "text" ? response.content[0].text : "";
	return parseJSON(text) as unknown as AnalysisResult;
}

export async function generateStrategy(
	symbol: string,
	candles: Candle[],
	news: NewsItem[],
	sentiment: Sentiment | null,
): Promise<StrategyResult> {
	const anthropic = getClient();

	const recentCandles = candles.slice(-24).map(c =>
		`${c.timestamp}: O${c.open} H${c.high} L${c.low} C${c.close}`
	).join("\n");

	const newsText = news.slice(0, 10).map(n => n.headline).join("\n");

	const sentimentText = sentiment
		? `Score: ${sentiment.score}, Label: ${sentiment.label}, Summary: ${sentiment.summary}`
		: "N/A";

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 2048,
		system: `You are a quantitative forex strategist. Analyze technical and fundamental data to propose trading strategies. Return JSON with:
- "title": concise Japanese title
- "content": detailed rationale in Japanese markdown
- "metadata": {"technicalSignals": string[], "fundamentalFactors": string[]}
- "strategies": array of {"symbol": string, "position": "long"|"short"|null, "entryPrice": string|null, "takeProfitPrice": string|null, "stopLossPrice": string|null, "confidence": string (0-1), "rationale": Japanese string, "validHours": number}
Return ONLY valid JSON.`,
		messages: [{
			role: "user",
			content: `Symbol: ${symbol}\n\n価格データ（5分足）:\n${recentCandles}\n\nニュース:\n${newsText}\n\nセンチメント:\n${sentimentText}`,
		}],
	});

	const text = response.content[0].type === "text" ? response.content[0].text : "";
	return parseJSON(text) as unknown as StrategyResult;
}
