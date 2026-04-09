/**
 * 過去FXデータをTiingo REST APIから取得してCSVに保存し、VPSのDBにインポートする。
 *
 * 使い方:
 *   source .env
 *   npx tsx services/trading/scripts/load-history.ts 2025-04
 *   npx tsx services/trading/scripts/load-history.ts all
 *
 * CSVはtest/data/history/に保存される。
 * 取得後、自動でVPSのDBにインポートする。
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const TIINGO_API_KEY = process.env.TIINGO_API_KEY;
const SYMBOL = "usdjpy";
const TIMEFRAME = "5m";
const DELAY = 3_000;
const OUTPUT_DIR = new URL("../test/data/history/", import.meta.url).pathname;

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

async function fetchDay(date: string): Promise<TiingoCandle[]> {
	const resample = TIMEFRAME === "5m" ? "5Min" : TIMEFRAME;
	const url = `https://api.tiingo.com/tiingo/fx/${SYMBOL}/prices?startDate=${date}&endDate=${date}&resampleFreq=${resample}&token=${TIINGO_API_KEY}`;
	const res = await fetch(url);

	if (res.status === 429) {
		console.log("  Rate limited, waiting 1 hour...");
		await sleep(3_600_000);
		return fetchDay(date);
	}

	if (!res.ok) {
		const body = await res.text();
		console.error(`  Fetch ${date}: ${res.status} ${body.slice(0, 100)}`);
		return [];
	}
	const data = (await res.json()) as TiingoCandle[];
	if (data.length === 0) console.log(`  DEBUG empty: ${date}`);
	return data;
}

async function loadMonth(yearMonth: string): Promise<number> {
	const [year, month] = yearMonth.split("-").map(Number);
	const days = daysInMonth(year, month);
	const csvPath = `${OUTPUT_DIR}/${yearMonth}.csv`;

	console.log(`\n=== ${yearMonth} (${days} days) ===`);

	const rows: string[] = [];
	for (let day = 1; day <= days; day++) {
		const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		const items = await fetchDay(date);

		if (items.length > 0) {
			for (const item of items) {
				rows.push(`${SYMBOL.toUpperCase()},${TIMEFRAME},${item.open},${item.high},${item.low},${item.close},${item.date}`);
			}
			process.stdout.write(`  ${date}: ${items.length}\n`);
		} else {
			process.stdout.write(`  ${date}: -\n`);
		}

		if (day < days) await sleep(DELAY);
	}

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
		const cmd = `cat "${csvPath}" | ssh root@65.21.62.107 'cd /opt/trader && docker compose exec -T postgres psql -U trade -d trader -c "COPY trading.candles(symbol, timeframe, \\\"open\\\", high, low, \\\"close\\\", \\\"timestamp\\\") FROM STDIN WITH CSV HEADER" 2>&1 || docker compose exec -T postgres psql -U trade -d trader -c "\\\\copy trading.candles(symbol, timeframe, \\\"open\\\", high, low, \\\"close\\\", \\\"timestamp\\\") FROM STDIN WITH CSV HEADER"'`;
		// COPYは権限の問題があるので、INSERT文で代替
		const insertSql = rows.map((row) => {
			const [sym, tf, o, h, l, c, ts] = row.split(",");
			return `INSERT INTO trading.candles(symbol, timeframe, "open", high, low, "close", "timestamp") VALUES ('${sym}', '${tf}', ${o}, ${h}, ${l}, ${c}, '${ts}') ON CONFLICT DO NOTHING;`;
		}).join("\n");

		const sqlPath = csvPath.replace(".csv", ".sql");
		writeFileSync(sqlPath, insertSql);
		execSync(`cat "${sqlPath}" | ssh root@65.21.62.107 'cd /opt/trader && docker compose exec -T postgres psql -U trade -d trader'`, { stdio: "pipe" });
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

	mkdirSync(OUTPUT_DIR, { recursive: true });

	const args = process.argv.slice(2);
	let months: string[];

	if (args.length === 0 || args[0] === "all") {
		months = [];
		const now = new Date();
		for (let i = 12; i >= 1; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
		}
	} else {
		months = args;
	}

	console.log(`Loading ${SYMBOL.toUpperCase()} ${TIMEFRAME}: ${months.join(", ")}`);

	let grandTotal = 0;
	for (const month of months) {
		grandTotal += await loadMonth(month);
	}

	console.log(`\nDone: ${grandTotal} candles total`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
