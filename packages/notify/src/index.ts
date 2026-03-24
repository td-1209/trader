type Channel = "alert" | "trade" | "market";

interface DiscordMessage {
	content: string;
	username?: string;
	channel?: Channel;
}

const WEBHOOK_ENV: Record<Channel, string> = {
	alert: "DISCORD_WEBHOOK_ALERT",
	trade: "DISCORD_WEBHOOK_TRADE",
	market: "DISCORD_WEBHOOK_MARKET",
};

export async function sendDiscordNotification(message: DiscordMessage): Promise<void> {
	const channel = message.channel ?? "alert";
	const webhookUrl = process.env[WEBHOOK_ENV[channel]];
	if (!webhookUrl) {
		console.warn(`${WEBHOOK_ENV[channel]} is not set, skipping notification`);
		return;
	}

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			content: message.content,
			username: message.username ?? "trader",
		}),
	});

	if (!response.ok) {
		console.error(`Discord notification failed: ${response.status} ${response.statusText}`);
	}
}
