import { sendDiscordNotification } from "@trader/notify";

const CHECK_INTERVAL_MS = 60_000;
const SILENCE_THRESHOLD_MS = 10 * 60 * 1000;

let lastTickAt: number = Date.now();
let alertSent = false;

function onTick() {
	lastTickAt = Date.now();
	alertSent = false;
}

function isMarketOpen(now: Date): boolean {
	const day = now.getUTCDay();
	const hour = now.getUTCHours();
	if (day === 6) return false;
	if (day === 0 && hour < 22) return false;
	if (day === 5 && hour >= 22) return false;
	return true;
}

function startWatchdog(onSilence: () => void) {
	setInterval(() => {
		if (!isMarketOpen(new Date())) return;
		const silentMs = Date.now() - lastTickAt;
		if (silentMs < SILENCE_THRESHOLD_MS) return;
		if (alertSent) return;

		alertSent = true;
		const mins = Math.round(silentMs / 60_000);
		console.log(`Watchdog: silence detected (${mins}m)`);
		sendDiscordNotification({
			content: `⚠️ Tiingo無音検知: ${mins}分間ticksなし。再接続を試行します。`,
			channel: "alert",
		});
		onSilence();
	}, CHECK_INTERVAL_MS);
}

export { startWatchdog, onTick };
