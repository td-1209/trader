export interface Candle {
	open: number;
	high: number;
	low: number;
	close: number;
	timestamp: string;
}

export interface Line {
	price: number;
	type: "peak" | "trough";
}

export interface Signal {
	position: "long" | "short";
	entryPrice: number;
	takeProfitPrice: number;
	stopLossPrice: number;
	reason: string;
	upperLines: Line[];
	lowerLines: Line[];
	rrRejected?: boolean;
	useLimit: boolean; // MT5にTP/SL指値を設定するか
}

export interface Method {
	name: string;
	execute(symbol: string, timeframe: string, candles: Candle[]): Signal | null;
}
