import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, () => {
	console.log(`research service listening on port ${port}`);
});
