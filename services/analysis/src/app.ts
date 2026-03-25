import { Hono } from "hono";
import { analysesRoutes } from "./routes/analyses.js";
import { strategiesRoutes } from "./routes/strategies.js";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "analysis" }));

app.route("/analyses", analysesRoutes);
app.route("/strategies", strategiesRoutes);

export { app };
