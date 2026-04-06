const key = process.env.TIINGO_API_KEY;
console.log("Key:", key?.slice(0, 10));

async function main() {
	const url = `https://api.tiingo.com/tiingo/fx/usdjpy/prices?startDate=2025-04-01&endDate=2025-04-01&resampleFreq=5min&token=${key}`;
	const res = await fetch(url);
	console.log("Status:", res.status);
	const data = await res.json();
	console.log("Type:", typeof data, Array.isArray(data));
	console.log("Length:", Array.isArray(data) ? data.length : "N/A");
	if (Array.isArray(data) && data.length > 0) console.log("First:", data[0]);
	else console.log("Raw:", JSON.stringify(data).slice(0, 300));
}

main().catch(console.error);
