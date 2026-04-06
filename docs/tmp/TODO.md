# TODO

## 戦略

### 状況

- Phase4まで完了
- 価格取得は安定稼働中
- 注文決済も稼働確認
- 市場調査も稼働確認（指標情報のみ取得困難）
- 速報分析は実装済み（現状急変してないので無風）
- 定期分析は実装済み（取引実績不足で未動作）
- 戦略立案は実装済み（手動トリガー）

### 未実装

- フロントエンド
- 取引ロジック

### 検討

#### 手動取引について

特に検討事項なし？ただ取引口座のスイッチ処理は必要か。

#### デモによる成績評価の運用について

過去1年くらいの取引データをDBに置いておき、定義された手法のデモトレードを行い、その取引結果をis_demo=trueとしてDBに記録して分析対象にする。

## 見通し

### Phase 1: 基盤

- モノレポ構築（pnpm workspaces + Turborepo）
- Docker Compose + Caddy構成
- DB構築（PostgreSQL + Drizzleマイグレーション）
- 共有パッケージ（packages/shared, packages/notify）

### Phase 2: trading

- WebSocketリアルタイムデータ取得（Tiingo）
- 5分足OHLC永続化
- 自動注文（Windows VPS + MT5 + ZeroMQブリッジでXMTrading連携）
- 手動注文
- 取引記録・資金管理

### Phase 3: research

- ニュース・経済カレンダー取得（Finnhub）
- センチメント分析（Finnhub + Claude API）

### Phase 4: analysis

- 改善提案（既存取引データ活用）
- 速報分析（価格急変・指標発表）
- 戦略立案（β）

### Phase 5: web

- ダッシュボード（損益・資金推移・手法別分析）
- 分析ビュー（センチメント・ニュース・改善提案・戦略）
- 手法管理・注文パネル

## 詳細TODO

### Phase 1: 基盤

#### 1-1. モノレポ構築

- [x] pnpm workspace初期化（pnpm-workspace.yaml）
- [x] Turborepo設定（turbo.json: build/lint/testタスク定義）
- [x] Biome設定（biome.json: lint + format）
- [x] TypeScript共通設定（tsconfig.json）
- [x] services/trading パッケージ初期化（Hono）
- [x] services/research パッケージ初期化（Hono）
- [x] services/analysis パッケージ初期化（Hono）
- [x] apps/web パッケージ初期化（Next.js）
- [x] packages/shared パッケージ初期化（Zodスキーマ）
- [x] packages/notify パッケージ初期化（Discord Webhook）
- [x] 各サービスに /health エンドポイント追加

#### 1-2. インフラ構築

- [x] Terraform定義（infra/main.tf: Hetzner CX32 シンガポール）
- [x] cloud-init設定（infra/cloud-init.yml: Docker/ufw/SSH）
- [x] Caddyfile作成（パスベースルーティング + Basic認証）
- [x] docker-compose.yml作成（Caddy + 全サービス + PostgreSQL）
- [x] 各サービスのDockerfile作成
- [x] .env.example作成（全環境変数のテンプレート）

#### 1-3. DB構築

- [x] PostgreSQLスキーマ作成（trading, research, analysis）
- [x] Drizzleテーブル定義: trading.methods
- [x] Drizzleテーブル定義: trading.trades
- [x] Drizzleテーブル定義: trading.cashflows
- [x] Drizzleテーブル定義: trading.candles
- [x] updated_atトリガー関数作成

#### 1-4. 共有パッケージ

- [x] packages/shared: trading系Zodスキーマ（trades, cashflows, methods, candles）
- [x] packages/shared: research系Zodスキーマ（news, calendars, sentiment）
- [x] packages/shared: analysis系Zodスキーマ（analyses, strategies）
- [x] packages/shared: 共通エラー型定義
- [x] packages/notify: Discord Webhook送信関数

#### 1-5. CI/CD

- [x] .github/workflows/deploy.yml作成（main push → SSH → docker compose up → ヘルスチェック → 失敗時Discord通知）

#### 1-6. 外部サービス登録

- [x] Hetzner Cloud: アカウント作成
- [x] Hetzner Cloud: APIトークン発行
- [x] ドメイン取得
- [x] GitHub: privateリポジトリ作成
- [x] Discord: 通知用チャンネル作成 + Webhook URL発行
- [x] Tiingo: アカウント作成（Free） + APIキー発行 ※Phase 2で必要
- [x] XMTrading: デモ口座開設 + MT5ログインID・パスワード・サーバー名を確認 ※Phase 2で必要
- [x] ABLENET VPS: Win1プラン契約 + MT5インストール + XMTrading口座ログイン確認 ※Phase 2で必要
- [x] Finnhub: アカウント作成（Free） + APIキー発行 ※Phase 3で必要
- [x] Anthropic: APIキー発行 ※Phase 3で必要

#### 1-7. VPS構築

- [x] デプロイ用SSH鍵ペア生成（ed25519）
- [x] infra/terraform.tfvars にAPIトークン・SSH公開鍵を記入
- [x] `terraform apply` でVPS作成（cx23 / hel1 / 65.21.62.107）
- [x] VPSにSSH接続できることを確認
- [x] ドメインのAレコードをVPSのIPに設定（trader-ai.app → Cloudflare）
- [x] `caddy hash-password` でBasic認証パスワードハッシュ生成

#### 1-8. DB

- [x] VPS上の `.env` に `POSTGRES_PASSWORD` を設定
- [x] `docker compose up -d postgres` で起動確認
- [x] 初期マイグレーションSQL実行（各サービスの `drizzle/0000_init.sql`）

#### 1-9. 初回デプロイ

- [x] VPSに `git clone` してリポジトリ配置（`/opt/trader`）
- [x] VPS上に `.env` ファイル作成（`.env.example` をベースに全値を埋める）
- [x] GitHub Secrets 設定（`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `DISCORD_WEBHOOK_URL`）
- [x] `docker compose up -d` で全サービス起動
- [x] 各サービスの `/health` にcurlして疎通確認
- [x] HTTPS自動取得の確認（Caddy）
- [x] ブラウザからドメインにアクセス → Basic認証 + Web UI表示を確認
- [x] Discord通知テスト送信で疎通確認（障害・取引・市場の3チャンネル）

### Phase 2: trading

#### 2-1. 価格データ取得

- [x] Tiingo WebSocket接続（FX）
- [x] 接続管理（起動時接続、切断時に指数バックオフで再接続）
- [x] 5分足OHLC集約ロジック（インメモリ）
- [x] trading.candlesへの永続化（5分区間切り替え時にINSERT）
- [x] WebSocketで価格データ・ローソク足をweb（クライアント）に配信

#### 2-2. 取引記録・資金管理

- [x] REST API: 取引履歴照会（GET /trades, フィルタ: symbol, domain, method, is_demo）
- [x] REST API: 取引詳細取得（GET /trades/:id）
- [x] REST API: 取引振り返り更新（PATCH /trades/:id: reason/result_description, images）
- [x] REST API: 入出金一覧（GET /cashflows）
- [x] REST API: 入出金登録（POST /cashflows）
- [x] REST API: 手法一覧（GET /methods）
- [x] REST API: 損益サマリ（GET /stats/pnl, /stats/balance: 期間別、手法別、ドメイン別）
- [x] 画像アップロード（POST /trades/:id/images: 5MB制限、png/jpeg/webp）

#### 2-3. 注文執行（MT5 HTTPブリッジ）

- [x] XMTrading API調査 → 独自APIなし、MT5 EA + HTTPポーリング方式に決定
- [x] MT5 EA開発: HTTPポーリングでコマンド取得・結果返送
- [x] MT5 EA開発: 注文受信→成行発注→結果返却
- [x] MT5 EA開発: 決済受信→ポジション決済→結果返却
- [x] MT5 EA開発: ポジション同期
- [x] trading service: ブリッジエンドポイント実装（/bridge/commands, /bridge/results, /bridge/sync）
- [x] MT5にEA配置・コンパイル・起動確認
- [x] 成行注文発注（POST /trades: symbol, position, exposure）→ ブリッジ経由でMT5に送信
- [x] 約定結果のtrading.tradesへの記録（status=open）
- [x] 決済処理（PATCH /trades/:id）→ ブリッジ経由で決済、status=exited, exit_price, profit_loss計算
- [x] 損切り自動執行（stop_loss_price到達時、Tiingoティックで監視）
- [x] 利確自動執行（take_profit_price到達時、Tiingoティックで監視）
- [x] 約定・決済・損切り・利確時のDiscord通知（packages/notify経由、tradeチャンネル）
- [x] オープンポジションのインメモリキャッシュ管理（起動時DBからロード）

### Phase 3: research

#### 3-1. Finnhubデータ取得

- [x] Finnhub APIクライアント（レート制限ガード: 60req/min）
- [x] ニュース取得ジョブ（5分間隔、research.newsにINSERT、重複除外）
- [x] 経済カレンダー取得ジョブ（60分間隔、research.calendarsにUPSERT）
- [x] REST API: ニュース一覧（GET /news: symbol, category, limitフィルタ）
- [x] REST API: 経済カレンダー一覧（GET /calendars: country, impact, from, toフィルタ）

#### 3-2. センチメント分析

- [x] Claudeセンチメント分析クライアント（claude-haiku-4-5、ニュースからscore/label/summary生成）
- [x] センチメント分析ジョブ（60分間隔、対象: USDJPY, EURUSD, XAUUSD）
- [x] REST API: センチメント一覧（GET /sentiments）
- [x] REST API: 最新センチメント（GET /sentiments/latest: target指定）

### Phase 4: analysis

#### 4-1. 改善提案

- [x] サービス間HTTPクライアント（trading/researchへの内部通信）
- [x] Claude改善提案エンジン（claude-sonnet、取引履歴からアンチパターン検出・改善提案）
- [x] 分析オーケストレーター（データ収集→Claude→DB保存→Discord通知の共通ロジック）
- [x] REST API: 分析一覧（GET /analyses: type, symbol, limitフィルタ）
- [x] REST API: 分析詳細（GET /analyses/:id）
- [x] REST API: 分析手動トリガー（POST /analyses: 202で即返し、バックグラウンド実行）
- [x] 改善提案ジョブ（毎週月曜9時、直近の取引データから生成）

#### 4-2. 速報分析

- [x] Claude速報分析エンジン（シナリオ分析: bull/bear/base）
- [x] 速報分析ジョブ（4時間間隔、1%以上の価格急変検出時にflash_report生成→Discord市場チャンネル通知）

#### 4-3. 戦略立案

- [x] Claude戦略立案エンジン（エントリーポイント・TP/SL提案）
- [x] REST API: 戦略一覧（GET /strategies: symbol, activeフィルタ）
- [x] REST API: 戦略詳細（GET /strategies/:id）

### Phase N: その他

#### データ移行

- [ ] 既存データ移行スクリプト作成（Supabase pl/cf → trading.trades/cashflows）
- [ ] 移行スクリプト実行 + データ検証