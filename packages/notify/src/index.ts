type Channel = "alert" | "trade" | "market";

interface DiscordMessage {
	content: string;
	username?: string;
	channel?: Channel;
	threadName?: string;
	threadId?: string;
	image?: Buffer;
}

interface DiscordResponse {
	id: string;
	channel_id: string;
}

const WEBHOOK_ENV: Record<Channel, string> = {
	alert: "DISCORD_WEBHOOK_ALERT",
	trade: "DISCORD_WEBHOOK_TRADE",
	market: "DISCORD_WEBHOOK_MARKET",
};

// レート制限管理
let sendCount = 0;
let rateLimitedUntil = 0;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendDiscordNotification(message: DiscordMessage): Promise<DiscordResponse | null> {
	const channel = message.channel ?? "alert";
	const webhookUrl = process.env[WEBHOOK_ENV[channel]];
	if (!webhookUrl) {
		console.warn(`${WEBHOOK_ENV[channel]} is not set, skipping notification`);
		return null;
	}

	// レート制限中なら待機
	const now = Date.now();
	if (rateLimitedUntil > now) {
		await sleep(rateLimitedUntil - now);
	}

	// 5通知ごとに1分待機
	if (sendCount > 0 && sendCount % 5 === 0) {
		await sleep(60_000);
	}

	// 1通知ごとに1秒間隔
	if (sendCount > 0) {
		await sleep(1_000);
	}

	const params = new URLSearchParams({ wait: "true" });
	if (message.threadId) params.set("thread_id", message.threadId);

	let response: Response;

	if (message.image) {
		const formData = new FormData();
		const payload: Record<string, unknown> = {
			content: message.content,
			username: message.username ?? "trader",
		};
		if (message.threadName) payload.thread_name = message.threadName;

		formData.append("payload_json", JSON.stringify(payload));
		formData.append("files[0]", new Blob([new Uint8Array(message.image)], { type: "image/png" }), "chart.png");

		response = await fetch(`${webhookUrl}?${params}`, {
			method: "POST",
			body: formData,
		});
	} else {
		const body: Record<string, unknown> = {
			content: message.content,
			username: message.username ?? "trader",
		};
		if (message.threadName) body.thread_name = message.threadName;

		response = await fetch(`${webhookUrl}?${params}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	sendCount++;

	if (response.status === 429) {
		// レート制限エラー → 1分待機してリトライ
		console.warn("Discord rate limited, waiting 60s");
		rateLimitedUntil = Date.now() + 60_000;
		await sleep(60_000);
		return sendDiscordNotification(message);
	}

	if (!response.ok) {
		console.error(`Discord notification failed: ${response.status} ${response.statusText}`);
		return null;
	}

	return (await response.json()) as DiscordResponse;
}
