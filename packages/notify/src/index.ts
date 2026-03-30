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

export async function sendDiscordNotification(message: DiscordMessage): Promise<DiscordResponse | null> {
	const channel = message.channel ?? "alert";
	const webhookUrl = process.env[WEBHOOK_ENV[channel]];
	if (!webhookUrl) {
		console.warn(`${WEBHOOK_ENV[channel]} is not set, skipping notification`);
		return null;
	}

	const params = new URLSearchParams({ wait: "true" });
	if (message.threadId) params.set("thread_id", message.threadId);

	let response: Response;

	if (message.image) {
		// multipart/form-data で画像添付
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

	if (!response.ok) {
		console.error(`Discord notification failed: ${response.status} ${response.statusText}`);
		return null;
	}

	return (await response.json()) as DiscordResponse;
}
