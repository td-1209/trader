import { Hono } from "hono";
import { newsRoutes } from "./routes/news.js";
import { calendarsRoutes } from "./routes/calendars.js";
import { sentimentsRoutes } from "./routes/sentiments.js";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "research" }));

app.route("/news", newsRoutes);
app.route("/calendars", calendarsRoutes);
app.route("/sentiments", sentimentsRoutes);

export { app };
