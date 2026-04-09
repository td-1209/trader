/**
 * バックテストのシミュレーション制約。一箇所で管理する。
 */
export interface SimulationConfig {
	// 資金管理
	initialBalance: number;       // 初期資産（円）
	leverage: number;             // レバレッジ
	// ロットサイズはオーケストレーター（evaluate.ts）で管理
	topUpAmount: number;          // ゼロカット後の再投入額（円）

	// コスト
	spreadPips: number;           // スプレッド（pips）
	slippagePips: number;         // スリッページ（pips）
	swapPerDayLong: number;      // スワップ（1日あたり、long、pips）
	swapPerDayShort: number;     // スワップ（1日あたり、short、pips）

	// 約定
	entryDelay: number;           // 約定遅延（足数）。1 = 次の足の始値でエントリー

	// pip値（通貨ペアごとに異なる）
	pipSize: number;              // 1pipの価格単位（USDJPY: 0.01, EURUSD: 0.0001）
}

export const DEFAULT_CONFIG: SimulationConfig = {
	initialBalance: 10000,
	leverage: 1000,
	// ロットサイズはevaluate.tsのFIXED_LOTで管理
	topUpAmount: 10000,

	spreadPips: 2,                 // 2pips
	slippagePips: 1,               // 1pip
	swapPerDayLong: -0.5,          // long側スワップ（pips/日）
	swapPerDayShort: 0.2,          // short側スワップ（pips/日）

	entryDelay: 1,                 // 次の足の始値

	pipSize: 0.01,                 // USDJPY
};

/** シンボルごとのpipサイズ */
export const PIP_SIZES: Record<string, number> = {
	USDJPY: 0.01,
	EURJPY: 0.01,
	GBPJPY: 0.01,
	AUDJPY: 0.01,
	NZDJPY: 0.01,
	CADJPY: 0.01,
	CHFJPY: 0.01,
	EURUSD: 0.0001,
	GBPUSD: 0.0001,
	AUDUSD: 0.0001,
	NZDUSD: 0.0001,
	USDCAD: 0.0001,
	USDCHF: 0.0001,
	EURGBP: 0.0001,
	XAUUSD: 0.01,
};
