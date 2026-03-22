# TODO

## 見通し

### Phase 1: 基盤

- モノレポ構築（pnpm workspaces + Turborepo）
- Docker Compose + Caddy構成
- DB構築（PostgreSQL + Drizzleマイグレーション）
- 共有パッケージ（packages/shared, packages/notify）

### Phase 2: trading

- WebSocketリアルタイムデータ取得（Tiingo）
- 5分足OHLC永続化
- 自動注文（XMTrading API連携）
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
- [ ] GitHub: privateリポジトリ作成
- [x] Discord: 通知用チャンネル作成 + Webhook URL発行
- [ ] Tiingo: アカウント作成（Free） + APIキー発行 ※Phase 2で必要
- [ ] XMTrading: デモ口座開設 + API認証情報の取得方法調査 ※Phase 2で必要
- [ ] Finnhub: アカウント作成（Free） + APIキー発行 ※Phase 3で必要
- [ ] Anthropic: APIキー発行 ※Phase 3で必要

#### 1-7. VPS構築

- [x] デプロイ用SSH鍵ペア生成（ed25519）
- [x] infra/terraform.tfvars にAPIトークン・SSH公開鍵を記入
- [x] `terraform apply` でVPS作成（cx23 / hel1 / 65.21.62.107）
- [x] VPSにSSH接続できることを確認
- [x] ドメインのAレコードをVPSのIPに設定（trader-ai.app → Cloudflare）
- [ ] `caddy hash-password` でBasic認証パスワードハッシュ生成

#### 1-8. DB・データ移行

- [ ] VPS上の `.env` に `POSTGRES_PASSWORD` を設定
- [ ] `docker compose up -d postgres` で起動確認
- [ ] 初期マイグレーションSQL実行（各サービスの `drizzle/0000_init.sql`）
- [ ] 既存データ移行スクリプト作成（Supabase pl/cf → trading.trades/cashflows）
- [ ] 移行スクリプト実行 + データ検証

#### 1-9. 初回デプロイ

- [ ] VPSに `git clone` してリポジトリ配置（`/opt/trader`）
- [ ] VPS上に `.env` ファイル作成（`.env.example` をベースに全値を埋める）
- [ ] GitHub Secrets 設定（`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `DISCORD_WEBHOOK_URL`）
- [ ] `docker compose up -d` で全サービス起動
- [ ] 各サービスの `/health` にcurlして疎通確認
- [ ] HTTPS自動取得の確認（Caddy）
- [ ] ブラウザからドメインにアクセス → Basic認証 + Web UI表示を確認
- [ ] Discord通知テスト送信で疎通確認

### Phase 2: trading

#### 2-1. 価格データ取得

- [ ] Tiingo WebSocket接続（firehose）
- [ ] 接続管理（起動時接続、切断時に指数バックオフで再接続）
- [ ] ティックデータのインメモリRing buffer
- [ ] 5分足OHLC集約ロジック
- [ ] trading.candlesへの永続化（5分ごとにINSERT）
- [ ] WebSocketで価格データをweb（クライアント）に配信

#### 2-2. 取引記録・資金管理

- [ ] REST API: 取引履歴照会（GET /trades, フィルタ: symbol, domain, method, is_demo）
- [ ] REST API: 取引詳細取得（GET /trades/:id）
- [ ] REST API: 取引振り返り更新（PATCH /trades/:id: reason/result_description, images）
- [ ] REST API: 入出金一覧（GET /cashflows）
- [ ] REST API: 入出金登録（POST /cashflows）
- [ ] REST API: 手法一覧（GET /methods）
- [ ] REST API: 損益サマリ（GET /trades/summary: 期間別、手法別、ドメイン別）
- [ ] 画像アップロード（POST /trades/:id/images: 5MB制限、png/jpeg/webp）

#### 2-3. 注文執行

- [ ] XMTrading API調査（認証方式、エンドポイント、制約）
- [ ] 成行注文発注（POST /trades: symbol, position, exposure）
- [ ] 約定結果のtrading.tradesへの記録（status=open）
- [ ] 決済処理（PATCH /trades/:id/close）→ status=exited, exit_price, profit_loss計算
- [ ] 損切り自動執行（stop_loss_price到達時）
- [ ] 利確自動執行（take_profit_price到達時）
- [ ] 約定・損切り時のDiscord通知（packages/notify経由）
- [ ] オープンポジションのインメモリキャッシュ管理