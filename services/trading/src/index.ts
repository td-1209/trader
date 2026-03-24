import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initWebSocketServer } from "./ws/server.js";
import { startTiingo } from "./ws/tiingo.js";
import { positionCache } from "./positions.js";

const port = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port }, () => {
	console.log(`trading service listening on port ${port}`);
});

initWebSocketServer(server);
positionCache.loadOpenPositions();
startTiingo();
