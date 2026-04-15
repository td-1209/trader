import WebSocket from "ws";
import { ohlcAggregator } from "./ohlc.js";
import { broadcast } from "./server.js";
import { sendDiscordNotification } from "@trader/notify";
import { startWatchdog, onTick as watchdogOnTick } from "./watchdog.js";
import { fillGaps } from "./gap-fill.js";

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
let watchdogStarted = false;
const MAX_RECONNECT_DELAY = 60_000;
const RECONNECT_ALERT_THRESHOLD = 3;

const SYMBOLS = [
	"usdjpy", "eurusd", "gbpusd", "audusd", "nzdusd", "usdchf", "eurgbp",
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

function forceReconnect() {
	console.log("Watchdog: forcing reconnect");
	ws?.close();
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
		const wasReconnecting = reconnectAttempt > 0;
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

		if (wasReconnecting) {
			sendDiscordNotification({ content: "✅ Tiingo再接続成功", channel: "alert" });
		}

		fillGaps(wasReconnecting ? "reconnect" : "startup").catch((err) => {
			console.error("Gap-fill failed:", err);
			sendDiscordNotification({
				content: `⚠️ ギャップ埋め失敗: ${String(err).slice(0, 200)}`,
				channel: "alert",
			});
		});

		if (!watchdogStarted) {
			watchdogStarted = true;
			startWatchdog(forceReconnect);
		}
	});

	ws.on("message", (raw) => {
		const msg = JSON.parse(String(raw));

		if (msg.messageType === "A" && Array.isArray(msg.data)) {
			const quote = parseQuote(msg.data);
			if (!quote) return;

			watchdogOnTick();
			ohlcAggregator.onTick(quote.symbol, Number(quote.mid), quote.timestamp);

			broadcast({
				type: "price",
				symbol: quote.symbol,
				bid: quote.bid,
				ask: quote.ask,
				mid: quote.mid,
				timestamp: quote.timestamp,
			});
		}
	});

	ws.on("close", () => {
		console.log("Tiingo WebSocket disconnected, reconnecting...");
		scheduleReconnect();
	});

	ws.on("error", (err) => {
		console.error("Tiingo WebSocket error:", err.message);
		ws?.close();
	});
}

function scheduleReconnect() {
	const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
	reconnectAttempt++;
	console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);

	if (reconnectAttempt === RECONNECT_ALERT_THRESHOLD) {
		sendDiscordNotification({
			content: `⚠️ Tiingo再接続が${RECONNECT_ALERT_THRESHOLD}回連続で失敗しています（継続リトライ中）`,
			channel: "alert",
		});
	}

	setTimeout(connect, delay);
}

function startTiingo() {
	connect();

	setInterval(() => {
		fillGaps("periodic").catch((err) => console.error("Periodic gap-fill failed:", err));
	}, 60 * 60 * 1000);
}

export { startTiingo };
