import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { trades } from "../db/schema.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const IMAGE_DIR = "/data/images/trades";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const app = new Hono();

app.post("/:id/images", async (c) => {
	const id = c.req.param("id");

	const [trade] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
	if (!trade) {
		return c.json({ error: { code: "NOT_FOUND", message: "Trade not found" } }, 404);
	}

	const form = await c.req.formData();
	const type = form.get("type") as string;
	const file = form.get("file") as File;

	if (!type || !["reason", "result"].includes(type)) {
		return c.json({ error: { code: "BAD_REQUEST", message: "type must be 'reason' or 'result'" } }, 400);
	}
	if (!file || !(file instanceof File)) {
		return c.json({ error: { code: "BAD_REQUEST", message: "file is required" } }, 400);
	}
	if (file.size > MAX_SIZE) {
		return c.json({ error: { code: "BAD_REQUEST", message: "File size exceeds 5MB" } }, 400);
	}
	if (!ALLOWED_TYPES.includes(file.type)) {
		return c.json({ error: { code: "BAD_REQUEST", message: "Only png, jpeg, webp allowed" } }, 400);
	}

	const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
	const filename = `${type}.${ext}`;
	const dir = join(IMAGE_DIR, id);
	await mkdir(dir, { recursive: true });
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(join(dir, filename), buffer);

	const imagePath = `/images/trades/${id}/${filename}`;
	const updates = type === "reason" ? { reasonImage: imagePath } : { resultImage: imagePath };
	const [row] = await db.update(trades).set({ ...updates, updatedAt: new Date() }).where(eq(trades.id, id)).returning();

	return c.json(row);
});

export { app as imagesRoutes };
