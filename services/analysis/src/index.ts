import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT) || 3003;

serve({ fetch: app.fetch, port }, () => {
	console.log(`analysis service listening on port ${port}`);
});
