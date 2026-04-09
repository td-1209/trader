import type { BacktestTrade } from "./runner.js";
import type { SimulationConfig } from "./config.js";

export interface MonthlySnapshot {
	month: string;         // YYYY-MM
	balance: number;       // 月末残高
	topUpTotal: number;    // 累計投入額
	tradeCount: number;    // 月間トレード数
	pnl: number;           // 月間損益（円）
}

export interface SimulationResult {
	totalTrades: number;
	winRate: string;
	avgRR: string;
	roi: string;              // ROI（%）= 最終残高 / 累計投入額 - 1
	finalBalance: number;
	totalTopUp: number;       // 累計投入額
	zeroCutCount: number;     // ゼロカット回数
	monthlySnapshots: MonthlySnapshot[];
}

export function simulate(trades: BacktestTrade[], config: SimulationConfig): SimulationResult {
	let balance = config.initialBalance;
	let totalTopUp = config.initialBalance;
	let zeroCutCount = 0;

	// 月次集計用
	const monthlyMap = new Map<string, { balance: number; topUpTotal: number; tradeCount: number; pnl: number }>();
	let currentMonth = "";

	let wins = 0;
	let totalRR = 0;

	for (const trade of trades) {
		const month = trade.entryAt.slice(0, 7); // YYYY-MM
		if (month !== currentMonth) {
			currentMonth = month;
			if (!monthlyMap.has(month)) {
				monthlyMap.set(month, { balance: balance, topUpTotal: totalTopUp, tradeCount: 0, pnl: 0 });
			}
		}

		// ロットサイズはオーケストレーター（evaluate.ts）が決定した値を使用
		const lotSize = trade.volume;

		// --- 過剰評価抑制: 本番で発生するコストをシミュレーションに反映 ---
		// スプレッド: 買値と売値の差。エントリー時点でスプレッド分だけ不利に約定する
		const spreadCost = config.spreadPips * config.pipSize * lotSize * 100000;
		// スリッページ: 注文価格と実際の約定価格の差。流動性不足や急変時に発生
		const slippageCost = config.slippagePips * config.pipSize * lotSize * 100000;
		// スワップ: 日をまたいで保有した際の金利差コスト。long/shortで異なる
		const entryTime = new Date(trade.entryAt).getTime();
		const exitTime = new Date(trade.exitAt).getTime();
		const holdingDays = Math.max(0, (exitTime - entryTime) / (24 * 60 * 60 * 1000));
		const swapRate = trade.position === "long" ? config.swapPerDayLong : config.swapPerDayShort;
		const swapCost = swapRate * config.pipSize * lotSize * 100000 * holdingDays;
		// --- 過剰評価抑制ここまで ---

		const rawPnlPips = trade.profitLoss / config.pipSize;
		const rawPnl = rawPnlPips * config.pipSize * lotSize * 100000;

		// 最終損益 = 生損益 - スプレッド - スリッページ + スワップ
		const netPnl = rawPnl - spreadCost - slippageCost + swapCost;

		// RR計算
		const reward = Math.abs(trade.entryPrice - trade.takeProfitPrice);
		const risk = Math.abs(trade.entryPrice - trade.stopLossPrice);
		if (risk > 0) totalRR += reward / risk;

		if (trade.profitLoss > 0) wins++;

		// 残高更新
		balance += netPnl;

		// ゼロカット判定: 残高が投入額の1%を切ったら再投入
		if (balance < config.topUpAmount * 0.01) {
			balance = config.topUpAmount;
			totalTopUp += config.topUpAmount;
			zeroCutCount++;
		}

		// 月次集計更新
		const snap = monthlyMap.get(month);
		if (snap) {
			snap.tradeCount++;
			snap.pnl += netPnl;
			snap.balance = balance;
			snap.topUpTotal = totalTopUp;
		}
	}

	const totalTrades = trades.length;
	const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0";
	const avgRR = totalTrades > 0 ? (totalRR / totalTrades).toFixed(2) : "0";
	const roi = totalTopUp > 0 ? (((balance / totalTopUp) - 1) * 100).toFixed(1) : "0";

	const monthlySnapshots: MonthlySnapshot[] = Array.from(monthlyMap.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, snap]) => ({
			month,
			balance: Math.round(snap.balance),
			topUpTotal: Math.round(snap.topUpTotal),
			tradeCount: snap.tradeCount,
			pnl: Math.round(snap.pnl),
		}));

	return {
		totalTrades,
		winRate,
		avgRR,
		roi,
		finalBalance: Math.round(balance),
		totalTopUp: Math.round(totalTopUp),
		zeroCutCount,
		monthlySnapshots,
	};
}
