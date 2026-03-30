# line

現在価格から上下それぞれ最も近い山・谷を3本ずつ算出する。

## 入力

- current_price: 現在価格
- candles: OHLCデータ（期間は呼び出し元が決定）

## 処理

### 1. 山・谷の検出

candlesから、前後2本と比較して反発した点を検出する。

- **谷**: candles[i].low が前後2本のlowより全て低い
  - `candles[i].low < min(candles[i-2].low, candles[i-1].low)` かつ
  - `candles[i].low < min(candles[i+1].low, candles[i+2].low)`
- **山**: candles[i].high が前後2本のhighより全て高い
  - `candles[i].high > max(candles[i-2].high, candles[i-1].high)` かつ
  - `candles[i].high > max(candles[i+1].high, candles[i+2].high)`

2本以内に山同士・谷同士が隣接する場合、絶対値がより大きい方（山ならhighが高い方、谷ならlowが低い方）のみ残す。

### 2. 上下に分離・ソート

1. 検出した山・谷をcurrent_priceを境に上下に分離
   - 上グループ: 価格 > current_price
   - 下グループ: 価格 < current_price
2. 上グループはcurrent_priceに近い順にソートし、上位3本を選択
3. 下グループはcurrent_priceに近い順にソートし、上位3本を選択

## 出力

- upper_lines: { price: DECIMAL, type: "peak" | "trough" }[]  # 上3本（近い順）
- lower_lines: { price: DECIMAL, type: "peak" | "trough" }[]  # 下3本（近い順）
