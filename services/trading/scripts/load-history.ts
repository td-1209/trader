/**
 * 過去FXデータをTiingo REST APIから取得してCSVに保存し、VPSのDBにインポートする。
 *
 * 使い方:
 *   source .env
 *   npx tsx services/trading/scripts/load-history.ts <symbol> 2025-04
 *   npx tsx services/trading/scripts/load-history.ts <symbol> all        # 過去24ヶ月
 *
 * CSVはtest/data/history/<symbol>/に保存される。
 * 取得後、自動でVPSのDBにインポートする。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const TIINGO_API_KEY = process.env.TIINGO_API_KEY;
const SYMBOL = (process.argv[2] ?? "").toLowerCase();
const TIMEFRAME = "5m";
const DELAY = 3_000;
const OUTPUT_DIR = new URL(`../test/data/history/${SYMBOL}/`, import.meta.url).pathname;

interface TiingoCandle {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

async function fetchRange(startDate: string, endDate: string): Promise<TiingoCandle[]> {
	const resample = TIMEFRAME === "5m" ? "5Min" : TIMEFRAME;
	const url = `https://api.tiingo.com/tiingo/fx/${SYMBOL}/prices?startDate=${startDate}&endDate=${endDate}&resampleFreq=${resample}&token=${TIINGO_API_KEY}`;
	const res = await fetch(url);

	if (res.status === 429) {
		console.log("  Rate limited, waiting 1 hour...");
		await sleep(3_600_000);
		return fetchRange(startDate, endDate);
	}

	if (!res.ok) {
		const body = await res.text();
		console.error(`  Fetch ${startDate}..${endDate}: ${res.status} ${body.slice(0, 100)}`);
		return [];
	}
	const data = (await res.json()) as TiingoCandle[];
	return data;
}

async function loadMonth(yearMonth: string): Promise<number> {
	const [year, month] = yearMonth.split("-").map(Number);
	const days = daysInMonth(year, month);
	const csvPath = `${OUTPUT_DIR}/${yearMonth}.csv`;
	const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
	const endDate = `${year}-${String(month).padStart(2, "0")}-${String(days).padStart(2, "0")}`;

	console.log(`\n=== ${yearMonth} (${startDate} .. ${endDate}) ===`);

	const items = await fetchRange(startDate, endDate);
	const rows: string[] = items.map((item) =>
		`${SYMBOL.toUpperCase()},${TIMEFRAME},${item.open},${item.high},${item.low},${item.close},${item.date}`
	);
	console.log(`  fetched: ${rows.length} candles`);

	if (rows.length === 0) {
		console.log("  → no data");
		return 0;
	}

	// CSVに保存
	const csv = `symbol,timeframe,open,high,low,close,timestamp\n${rows.join("\n")}\n`;
	writeFileSync(csvPath, csv);
	console.log(`  → ${rows.length} candles saved to ${csvPath}`);

	// VPSのDBにインポート
	try {
		console.log("  → Importing to VPS DB...");
		const insertSql = rows.map((row) => {
			const [sym, tf, o, h, l, c, ts] = row.split(",");
			return `INSERT INTO trading.candles(symbol, timeframe, "open", high, low, "close", "timestamp") VALUES ('${sym}', '${tf}', ${o}, ${h}, ${l}, ${c}, '${ts}') ON CONFLICT DO NOTHING;`;
		}).join("\n");

		const sqlPath = csvPath.replace(".csv", ".sql");
		writeFileSync(sqlPath, insertSql);
		execSync(`cat "${sqlPath}" | ssh -i ~/.ssh/id_ed25519 deploy@trader-ai.app 'docker compose -f /opt/trader/docker-compose.yml exec -T postgres psql -U trade -d trader'`, { stdio: "pipe" });
		console.log("  → Imported to DB");
	} catch (err) {
		console.error("  → DB import failed:", err);
	}

	return rows.length;
}

async function main() {
	if (!TIINGO_API_KEY) {
		console.error("Set TIINGO_API_KEY: source .env");
		process.exit(1);
	}

	if (!SYMBOL) {
		console.error("Usage: npx tsx services/trading/scripts/load-history.ts <symbol> <yyyy-mm|all>");
		process.exit(1);
	}

	mkdirSync(OUTPUT_DIR, { recursive: true });

	const args = process.argv.slice(3);
	let months: string[];

	if (args.length === 0 || args[0] === "all") {
		months = [];
		const now = new Date();
		for (let i = 24; i >= 1; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
		}
	} else {
		months = args;
	}

	console.log(`Loading ${SYMBOL.toUpperCase()} ${TIMEFRAME}: ${months.join(", ")}`);

	let grandTotal = 0;
	for (let i = 0; i < months.length; i++) {
		grandTotal += await loadMonth(months[i]);
		if (i < months.length - 1) await sleep(DELAY);
	}

	console.log(`\nDone: ${grandTotal} candles total`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
