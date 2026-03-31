import WebSocket from "ws";
import { ohlcAggregator } from "./ohlc.js";
import { broadcast } from "./server.js";
import { positionCache } from "../positions.js";
import { sendDiscordNotification } from "@trader/notify";

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_DELAY = 60_000;

const SYMBOLS = [
	// /JPY
	"usdjpy", "eurjpy", "gbpjpy", "audjpy", "nzdjpy", "cadjpy", "chfjpy",
	// /USD
	"eurusd", "gbpusd", "audusd", "nzdusd", "xauusd",
	// /CAD
	"usdcad", "eurcad", "gbpcad", "audcad", "nzdcad",
	// /CHF
	"usdchf", "eurchf", "gbpchf", "audchf", "cadchf", "nzdchf",
	// /GBP
	"eurgbp",
	// /AUD
	"gbpaud", "euraud",
	// /NZD
	"gbpnzd", "eurnzd", "audnzd",
];

interface TiingoQuote {
	symbol: string;
	bid: string;
	ask: string;
	mid: string;
	timestamp: string;
}

function parseQuote(data: unknown[]): TiingoQuote | null {
	if (data[0] !== "Q") return null;
	return {
		symbol: String(data[1]).toUpperCase(),
		bid: String(data[4]),
		ask: String(data[7]),
		mid: String(data[5]),
		timestamp: String(data[2]),
	};
}

function connect() {
	const apiKey = process.env.TIINGO_API_KEY;
	if (!apiKey) {
		console.warn("TIINGO_API_KEY not set, skipping price feed");
		return;
	}

	ws = new WebSocket("wss://api.tiingo.com/fx");

	ws.on("open", () => {
		console.log("Tiingo WebSocket connected");
		reconnectAttempt = 0;

		ws?.send(
			JSON.stringify({
				eventName: "subscribe",
				authorization: apiKey,
				eventData: {
					thresholdLevel: 5,
					tickers: SYMBOLS,
				},
			}),
		);
	});

	ws.on("message", (raw) => {
		const msg = JSON.parse(String(raw));

		if (msg.messageType === "A" && Array.isArray(msg.data)) {
			const quote = parseQuote(msg.data);
			if (!quote) return;

			ohlcAggregator.onTick(quote.symbol, Number(quote.mid), quote.timestamp);

			broadcast({
				type: "price",
				symbol: quote.symbol,
				bid: quote.bid,
				ask: quote.ask,
				mid: quote.mid,
				timestamp: quote.timestamp,
			});

			positionCache.checkStopLossTakeProfit(quote.symbol, Number(quote.bid), Number(quote.ask));
		}
	});

	ws.on("close", () => {
		console.log("Tiingo WebSocket disconnected, reconnecting...");
		scheduleReconnect();
	});

	ws.on("error", (err) => {
		console.error("Tiingo WebSocket error:", err.message);
		sendDiscordNotification({ content: `⚠️ Tiingo接続エラー: ${err.message}`, channel: "alert" });
		ws?.close();
	});
}

function scheduleReconnect() {
	const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
	reconnectAttempt++;
	console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
	setTimeout(connect, delay);
}

function startTiingo() {
	connect();
}

export { startTiingo };
