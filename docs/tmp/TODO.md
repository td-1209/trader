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

- [ ] pnpm workspace初期化（pnpm-workspace.yaml）
- [ ] Turborepo設定（turbo.json: build/lint/testタスク定義）
- [ ] Biome設定（biome.json: lint + format）
- [ ] TypeScript共通設定（tsconfig.json）
- [ ] services/trading パッケージ初期化（Hono）
- [ ] services/research パッケージ初期化（Hono）
- [ ] services/analysis パッケージ初期化（Hono）
- [ ] apps/web パッケージ初期化（Next.js）
- [ ] packages/shared パッケージ初期化（Zodスキーマ）
- [ ] packages/notify パッケージ初期化（Discord Webhook）
- [ ] 各サービスに /health エンドポイント追加

#### 1-2. インフラ構築

- [ ] Terraform定義（infra/main.tf: Hetzner CX32 シンガポール）
- [ ] cloud-init設定（infra/cloud-init.yml: Docker/ufw/SSH）
- [ ] terraform apply でVPS作成
- [ ] ドメイン取得 + DNS設定
- [ ] Caddyfile作成（パスベースルーティング + Basic認証）
- [ ] docker-compose.yml作成（Caddy + 全サービス + PostgreSQL）
- [ ] 各サービスのDockerfile作成
- [ ] .env.example作成（全環境変数のテンプレート）

#### 1-3. DB構築

- [ ] PostgreSQLスキーマ作成（trading, research, analysis）
- [ ] Drizzleテーブル定義: trading.methods
- [ ] Drizzleテーブル定義: trading.trades
- [ ] Drizzleテーブル定義: trading.cashflows
- [ ] Drizzleテーブル定義: trading.candles
- [ ] updated_atトリガー関数作成
- [ ] マイグレーション実行確認
- [ ] 既存データ移行スクリプト（Supabase pl/cf → trading.trades/cashflows）

#### 1-4. 共有パッケージ

- [ ] packages/shared: trading系Zodスキーマ（trades, cashflows, methods, candles）
- [ ] packages/shared: research系Zodスキーマ（news, calendars, sentiment）
- [ ] packages/shared: analysis系Zodスキーマ（analyses, strategies）
- [ ] packages/shared: 共通エラー型定義
- [ ] packages/notify: Discord Webhook送信関数

#### 1-5. CI/CD

- [ ] .github/workflows/deploy.yml作成（main push → SSH → docker compose up）
- [ ] GitHub Secretsに VPS_HOST, VPS_SSH_KEY, VPS_USER を設定
- [ ] デプロイ後ヘルスチェック（各 /health にcurl）
- [ ] デプロイ失敗時のDiscord通知

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