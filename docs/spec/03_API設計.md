# API設計

## RESTエンドポイント

全エンドポイントは `trade.example.com/api/{service}/` 配下。レスポンスは全て `application/json`。

### tradingサービス（/api/trading）

#### 取引

| メソッド | パス | 説明 |
|---|---|---|
| GET | /trades | 取引一覧（フィルタ: symbol, domain, status, is_demo） |
| GET | /trades/:id | 取引詳細 |
| POST | /trades | 手動注文の登録 |
| PATCH | /trades/:id | 取引の更新（決済・振り返り記入） |

##### GET /trades クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| symbol | string | | シンボルでフィルタ |
| domain | string | | 'fx','stock','gold' |
| status | string | | 'open','exited' |
| is_demo | boolean | | デモトレードを含むか |
| limit | number | | 取得件数（デフォルト: 50） |
| offset | number | | オフセット |

##### POST /trades リクエストボディ

```json
{
  "method": "uuid",
  "symbol": "USD/JPY",
  "domain": "fx",
  "position": "long",
  "exposure": "1500000",
  "entry_price": "150.123",
  "take_profit_price": "151.000",
  "stop_loss_price": "149.500",
  "is_demo": false,
  "reason_description": "ブレイクアウト確認"
}
```

##### PATCH /trades/:id リクエストボディ

```json
{
  "status": "exited",
  "exit_price": "151.050",
  "profit_loss": "50000",
  "result_description": "利確ライン到達"
}
```

#### キャッシュフロー

| メソッド | パス | 説明 |
|---|---|---|
| GET | /cashflows | 入出金一覧 |
| POST | /cashflows | 入出金の登録 |

##### POST /cashflows リクエストボディ

```json
{
  "executed_at": "2026-03-22T10:00:00Z",
  "amount": "100000"
}
```

#### 手法

| メソッド | パス | 説明 |
|---|---|---|
| GET | /methods | 手法一覧（フィルタ: domain, is_active） |
| GET | /methods/:id | 手法詳細 |

#### ローソク足

| メソッド | パス | 説明 |
|---|---|---|
| GET | /candles | ローソク足データ取得 |

##### GET /candles クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| symbol | string | Yes | シンボル |
| from | string | | 開始日時（ISO 8601） |
| to | string | | 終了日時（ISO 8601） |
| limit | number | | 取得件数（デフォルト: 300） |

#### 画像アップロード

| メソッド | パス | 説明 |
|---|---|---|
| POST | /trades/:id/images | 取引画像のアップロード（multipart/form-data） |

##### POST /trades/:id/images フォームフィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| type | string | Yes | 'reason' or 'result' |
| file | File | Yes | 画像ファイル |

#### ダッシュボード集計

| メソッド | パス | 説明 |
|---|---|---|
| GET | /stats/pnl | 損益サマリ（期間指定可） |
| GET | /stats/balance | 残高推移 |

### researchサービス（/api/research）

#### ニュース

| メソッド | パス | 説明 |
|---|---|---|
| GET | /news | ニュース一覧 |

##### GET /news クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| symbol | string | | 関連シンボルでフィルタ |
| category | string | | カテゴリでフィルタ |
| limit | number | | 取得件数（デフォルト: 50） |

#### 経済カレンダー

| メソッド | パス | 説明 |
|---|---|---|
| GET | /calendars | 経済指標一覧 |

##### GET /calendars クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| country | string | | 国でフィルタ |
| impact | string | | 'low','medium','high' |
| from | string | | 開始日時 |
| to | string | | 終了日時 |

#### センチメント

| メソッド | パス | 説明 |
|---|---|---|
| GET | /sentiments | センチメント一覧 |
| GET | /sentiments/latest | 対象別の最新センチメント |

##### GET /sentiments/latest クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| target | string | Yes | 分析対象（例: 'USD/JPY'） |

### analysisサービス（/api/analysis）

#### 分析

| メソッド | パス | 説明 |
|---|---|---|
| GET | /analyses | 分析一覧 |
| GET | /analyses/:id | 分析詳細 |
| POST | /analyses | 分析の手動トリガー |

##### GET /analyses クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| type | string | | 'flash_report','improvement','strategy' |
| symbol | string | | シンボルでフィルタ |
| limit | number | | 取得件数（デフォルト: 20） |

##### POST /analyses リクエストボディ

```json
{
  "type": "improvement",
  "symbol": "USD/JPY"
}
```

#### 戦略

| メソッド | パス | 説明 |
|---|---|---|
| GET | /strategies | 戦略一覧 |
| GET | /strategies/:id | 戦略詳細 |

##### GET /strategies クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| symbol | string | | シンボルでフィルタ |
| active | boolean | | 有効期限内のみ（valid_until_at > NOW()） |

### サービス間API（内部）

analysisサービスが他サービスを呼び出すための内部API。外部には公開しない。

| 呼び出し元 | 呼び出し先 | パス | 用途 |
|---|---|---|---|
| analysis | trading | GET /trades | 取引履歴の取得（改善提案用） |
| analysis | trading | GET /candles | 価格データの取得（速報分析用） |
| analysis | research | GET /news | 最新ニュースの取得 |
| analysis | research | GET /sentiments/latest | 最新センチメントの取得 |
| analysis | research | GET /calendars | 経済指標の取得 |

内部通信はCaddyを経由せず、Docker Composeネットワーク内で `http://trading:3001`, `http://research:3002` のようにサービス名で直接アクセスする。

## WebSocketメッセージ仕様

tradingサービスがWebSocketエンドポイントを提供し、webクライアントにリアルタイムデータを配信する。

### 接続

```
ws://trade.example.com/api/trading/ws
```

Caddyが自動的にwss（TLS）に変換する。

### メッセージ形式

全メッセージはJSON形式。`type`フィールドで種別を判別する。

#### サーバー → クライアント

##### price — 価格更新

```json
{
  "type": "price",
  "symbol": "USD/JPY",
  "bid": "150.123",
  "ask": "150.125",
  "mid": "150.124",
  "timestamp": "2026-03-22T10:00:00.123Z"
}
```

##### position — ポジション状態変更

```json
{
  "type": "position",
  "trade_id": "uuid",
  "status": "open",
  "symbol": "USD/JPY",
  "position": "long",
  "entry_price": "150.123",
  "profit_loss": "5000"
}
```

##### candle — ローソク足確定

```json
{
  "type": "candle",
  "symbol": "USD/JPY",
  "timeframe": "5m",
  "open": "150.100",
  "high": "150.200",
  "low": "150.050",
  "close": "150.180",
  "timestamp": "2026-03-22T10:00:00Z"
}
```

#### クライアント → サーバー

##### subscribe — 購読開始

```json
{
  "type": "subscribe",
  "symbols": ["USD/JPY", "EUR/USD"]
}
```

##### unsubscribe — 購読解除

```json
{
  "type": "unsubscribe",
  "symbols": ["EUR/USD"]
}
```

## 外部API利用仕様

具体的なサービス選定・認証・レート制限は運用デプロイ設計を参照。

## エラー定義

### エラーレスポンス形式

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Trade not found"
  }
}
```

### HTTPステータスコード

| ステータス | コード | 説明 |
|---|---|---|
| 400 | BAD_REQUEST | リクエストのバリデーションエラー |
| 404 | NOT_FOUND | リソースが見つからない |
| 409 | CONFLICT | 状態の競合（例: 既にexitedの取引を再度exitしようとした） |
| 500 | INTERNAL_ERROR | サーバー内部エラー |

### バリデーションエラー

Zodスキーマによるバリデーション失敗時は、400レスポンスにフィールド単位のエラーを含める。

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": [
      { "field": "symbol", "message": "Required" },
      { "field": "exposure", "message": "Must be positive" }
    ]
  }
}
```
