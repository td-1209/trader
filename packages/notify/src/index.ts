interface DiscordMessage {
	content: string;
	username?: string;
}

export async function sendDiscordNotification(message: DiscordMessage): Promise<void> {
	const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
	if (!webhookUrl) {
		console.warn("DISCORD_WEBHOOK_URL is not set, skipping notification");
		return;
	}

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			content: message.content,
			username: message.username ?? "Trade Dashboard",
		}),
	});

	if (!response.ok) {
		console.error(`Discord notification failed: ${response.status} ${response.statusText}`);
	}
}
