import { WebSocketServer, WebSocket } from "ws";
let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

function initWebSocketServer(server: unknown) {
	wss = new WebSocketServer({ server: server as never, path: "/ws" });

	wss.on("connection", (ws) => {
		clients.add(ws);

		ws.on("close", () => {
			clients.delete(ws);
		});

		ws.on("error", () => {
			clients.delete(ws);
		});
	});

	console.log("WebSocket server initialized on /ws");
}

function broadcast(message: unknown) {
	const data = JSON.stringify(message);
	for (const client of clients) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	}
}

export { initWebSocketServer, broadcast };
