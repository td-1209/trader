import { Hono } from "hono";
import { tradesRoutes } from "./routes/trades.js";
import { cashflowsRoutes } from "./routes/cashflows.js";
import { methodsRoutes } from "./routes/methods.js";
import { candlesRoutes } from "./routes/candles.js";
import { statsRoutes } from "./routes/stats.js";
import { imagesRoutes } from "./routes/images.js";
import { bridgeRoutes } from "./broker/mt5-bridge.js";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "trading" }));

app.route("/trades", tradesRoutes);
app.route("/trades", imagesRoutes);
app.route("/cashflows", cashflowsRoutes);
app.route("/methods", methodsRoutes);
app.route("/candles", candlesRoutes);
app.route("/stats", statsRoutes);
app.route("/", bridgeRoutes);

export { app };
