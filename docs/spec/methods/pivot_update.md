# pivot_update

最高安値を更新した場合に、山谷から利確/損切ラインを決定しエントリーする。

## 入力

- symbol: 通貨ペア
- timeframe: 執行足（例: "1h"）

## 条件

※各足確定時に実行・既に同足同ペアが取引中の場合はスキップ

- current_candle: 最新の1本のOHLCデータ
- previous_candles: 最新を除く指定期間のOHLCデータ
  - 1w足 → 3年（160本）
  - 1d足 → 6ヶ月（約130本）
  - 4h足 → 1ヶ月（約180本）
  - 1h足 → 1週間（約120本）※市場営業時間
  - 5m足 → 半日（約144本）

## 処理

### 1. 山・谷の検出（line処理）

previous_candlesに対してline処理を実行し、全ての山・谷を取得する。
※line処理の詳細は [line.md](./line.md) を参照。

### 2. 最高安値の更新判定

1. 検出した全山の最大値・全谷の最小値を取得
2. current_candleの終値が最大値を上回る or 最小値を下回るかチェック
   - 終値 > 全山の最大値 → 上方更新
   - 終値 < 全谷の最小値 → 下方更新
   - どちらでもない → エントリーなし（処理終了）

### 3. 利確/損切ラインの算出

entry_price = current_candle.closeとする。
山・谷をentry_priceを境に上下に分離し、それぞれ最も近いものを選択する。

- **上方更新（long）**:
  - 利確ライン = entry_priceより上で最も近い山
  - 損切ライン = entry_priceより下で最も近い谷
- **下方更新（short）**:
  - 利確ライン = entry_priceより下で最も近い谷
  - 損切ライン = entry_priceより上で最も近い山

### 4. RRチェック

- RR = |entry_price - 利確ライン| / |entry_price - 損切ライン|
- RR <= 1.0 の場合、エントリーしない（処理終了）

## 出力

- signal: "long" | "short" | null
- entry_price: DECIMAL
- take_profit_price: DECIMAL
- stop_loss_price: DECIMAL
