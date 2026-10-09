# Abiko Study App (AI & SI Tutor) - 開発業務引継ぎ仕様書 (AI Handover Document)

本書は、本リポジトリの開発・運用・保守業務を別のAIツール（Claude, ChatGPT, Cursor, GitHub Copilot, Roo Code等）に完全に引き継ぐための詳細仕様・設計・運用手順書です。

---

## 1. プロジェクト基本情報

- **リポジトリ名**: `abiko-study-app` (GitHub: `tomotsuneko/hiroaki-study-app.git`)
- **本番デプロイ**: Vercel (`https://hiroaki-study-app.vercel.app`)
- **主要ブランチ**: `main` (本番自動デプロイ連動)
- **主要技術スタック**:
  - **Framework**: Next.js 16.3.6 (Turbopack, App Router)
  - **UI/Language**: React 19.2.8, TypeScript 5, CSS Modules
  - **Database**: Firebase Firestore (`firebase-admin` 14.5.0, Client SDK `firebase` 12.19.0)
  - **LLM/AI**: Google Generative AI SDK (`@google/generative-ai` 0.24.1 / Gemini Flash & Pro系)
  - **数式・Markdown**: KaTeX 0.18.9, `react-markdown`, `remark-math`, `rehype-katex`
  - **Mail**: `nodemailer` 10.0.10

---

## 2. システムアーキテクチャ・ディレクトリ構成

```
.
├── src/
│   ├── app/
│   │   ├── (main)/                     # 生徒用メインUI（認証必須・左サイドバーレイアウト）
│   │   │   ├── dashboard/              # ダッシュボード（達成度、学習ログ、AIコメント、ミニレッスン）
│   │   │   ├── chat/                   # AI質問チャット（Persona切り替え・数式レンダリング）
│   │   │   ├── drill/                  # 単元別ドリル生成・自動採点・解説
│   │   │   ├── exam-analysis/          # 模試結果の分析・弱点補強提案
│   │   │   ├── flashcard/              # 暗記カード（間隔反復復習ロジック）
│   │   │   ├── plan/                   # 学習シラバス・週間スケジュール
│   │   │   ├── lesson/                 # 今日の学習レッスン
│   │   │   ├── library/                # 参考動画・教材検索（YouTube API連携）
│   │   │   ├── profile/                # 志望校・苦手科目・学年設定（進級自動判定）
│   │   │   └── layout.tsx              # サイドバーナビゲーション + FloatingTimer
│   │   ├── admin/                      # 管理者用UI
│   │   │   ├── curriculum/             # カリキュラム管理（マスターDB閲覧）
│   │   │   ├── materials/              # 学習コンテンツ管理（HTMLインポート・3世代管理）
│   │   │   ├── tests/                  # テストコンテンツ管理（HTMLインポート・3世代管理）
│   │   │   ├── syllabus/               # 個別シラバス管理（生徒個人シラバス閲覧・同期）
│   │   │   ├── models/                 # AIモデル・API動的設定・フォールバック管理
│   │   │   └── AdminNav.tsx            # 管理画面サイドバーナビゲーション
│   │   ├── preview/[id]/               # 教材フルスクリーンプレビュー（独立iframe表示）
│   │   ├── login/                      # ログイン / 自動新規登録 / パスワード再設定
│   │   ├── api/                        # Next.js Route Handlers (全API一覧参照)
│   │   ├── layout.tsx                  # ルートレイアウト
│   │   └── page.tsx                    # トップページ（ログイン状態によりリダイレクト）
│   ├── components/
│   │   ├── AIAvatar.tsx                # AIアバターコンポーネント
│   │   └── FloatingTimer.tsx           # ポモドーロ学習タイマー（画面下部固定）
│   ├── lib/
│   │   ├── firebase-admin.ts           # サーバー側Firestore接続初期化
│   │   ├── gemini.ts                   # Google Generative AIクライアント初期化
│   │   ├── model-manager.ts            # AIモデル動的チェーン・Firestore同期
│   │   ├── db.ts                       # 生徒ユーザー向けFirestoreデータ読み書き関数群
│   │   └── UserContext.tsx             # クライアント側ユーザープロフィールContext
│   ├── data/
│   │   └── master_curriculum/          # 中学5教科・高校各科目の正規カリキュラムMarkdown (36資料)
│   └── middleware.ts                   # 認証ミドルウェア（Cookie: study_user_id 検証）
├── Study_AI設定ファイル/               # カリキュラム仕様書・AI保守ガイド等の基礎資料
├── scripts/                            # DB移行・データメンテナンス用スクリプト群
└── .env.local                          # ローカル環境変数（Git管理外）
```

---

## 3. 画面一覧とUI機能詳細

### 3.1 一般生徒向け画面 (`src/app/(main)`)
すべての画面は `src/app/(main)/layout.tsx` の共通レイアウト（左サイドバー、下部ポモドーロタイマー `FloatingTimer`）でラップされています。

1. **ダッシュボード (`/dashboard`)**:
   - 本日の学習時間、目標校合格判定レベルバー、AIアドバイスコメントの表示。
   - **チューターコメント (日次分析結果)**:
     - 縦幅をスリム化し、アクションボタンをヘッダー右側に配置。【弱点対策】セクションを省き、モチベーション向上と今日のアクションに集中したコンパクトな短評（100〜150文字程度）を表示。
   - **学習タイムマネジメント・簡易カレンダー (`StudyCalendar`)**:
     - 当日を中心に前後を見通せるローリング7日間表示（**過去2日分 ＋ 当日（左から3番目） ＋ 翌日付4日分**）。前週・翌週へのスライド移動にも対応。
     - **日のタイプ別プリセット**: 「🏀 部活日」「🏫 塾・予備校」「🔥 一日勉強Day」「📖 通常自習」「💤 休養・オフ」「⚡ テスト直前」をワンタップで目標時間付き設定。
     - **予定 vs 実績の自動可視化**: ポモドーロタイマーやドリルから自動集計された実績時間を対比表示。目標達成で「✅ 達成！」バッジ付与。
     - **コミットメントサマリー**: 表示期間（7日間）の目標学習時間合計、実績合計、達成率（%）、AIエールアドバイスを表示。
   - **今日のミッション (シラバス連携)**:
     - カレンダーの学習予定時間登録と連動し、目標時間（30分〜360分）に応じて表示タスク数（1〜4件）および各タスクの目安時間を動的提示。未登録時は基本2件を表示。
   - **今日のミニレッスン枠の削除**:
     - 画面全体の視認性と縦幅の引き締めのため、ダッシュボード上のミニレッスン枠を削除し、ミッション・カレンダーに集中できるUIへ刷新。
   - 初回ロード時に `/api/db/daily` を呼び出し。キャッシュがない場合は `/api/cron/daily` をキックして当日レポートを生成。
2. **AI質問チャット (`/chat`)**:
   - 塾講師AIとの個別チャット。Gemini Web風の左サイドバー履歴UIを搭載。
   - **当日チャット自動再開**: 当日中は画面を切り替えても前回のチャットを自動復帰して続きから学習可能。
   - **日付切り替え & 控えめなアテンション**: 日付が変わると自動で新規チャットを開始し、画面上部に控えめなバナーで案内。
   - **チャット履歴一覧 & 呼び出し**: 左メニューに「今日」「昨日」「過去7日間」「それ以前」別に過去のチャットを一覧表示・ワンクリックで復元。新規チャット作成や履歴削除にも対応。
   - ペルソナ（優しいお姉さん、熱血コーチ、論理的メンター）に応じてトーンが変化。
   - 数式（LaTeX/KaTeX）やマークダウンを美しくレンダリング。
   - 会話ログは自動で学習履歴（logs）および `users/{userId}/chat_sessions` に記録。
3. **ドリル学習 (`/drill`)**:
   - 志望校や苦手科目に合わせた4択問題・記述問題をGeminiが動的生成。
   - 解答後に `/api/drill/evaluate` で自動採点、詳細解説と弱点克服メモを提示。
4. **模試分析 (`/exam-analysis`)**:
   - 模試の点数・偏差値・判定・弱点大問を入力。
   - Geminiが現状の学力ボトルネックを判定し、優先して復習すべき単元リストを出力。
5. **暗記カード (`/flashcard`)**:
   - 単語や重要公式を登録し、忘却曲線に基づく間隔反復（Leitner System風: 正解で間隔延長、不正解でLv0リセット）で出題。
6. **学習計画 (`/plan`)**:
   - **目標校・学年からの逆算設計**: 生徒の学年（高1/高2/高3/中学生）と目標校のボーダー偏差値から入試本番までのマイルストーン（到達目標・時期）を逆算してタイムライン化。
   - **現在地と先の可視化**: 「合格逆算ロードマップ」カードにて現在地（学年・偏差値）と各フェーズの到達目標をグラフィカルに俯瞰表示。
   - **レベルチェックコンテンツ**: 偏差値未診断・不透明な場合は、シラバス先頭への診断タスク（`type: "diagnostic"`）自動挿入およびワンタップ目安偏差値設定/診断ドリル案内を提供。
   - **流動的自動組み換え（Rebalance）**: 模試画像解析（`/exam-analysis`）や志望校変更を検知すると、完了済みタスクを保持したまま無理のない現実的なペースでシラバスを自動再編成。
   - **アテンション通知**: 自動組み換え発生時は画面上部およびダッシュボードに目立つアテンションバナーを掲示。
7. **教材ライブラリ (`/library`)**:
   - 学習単元に関連するYouTube解説動画をYouTube Data API v3経由で検索・再生。
8. **プロフィール (`/profile`)**:
   - 氏名、志望校、目安偏差値、苦手科目、学年、文理選択などを管理。目標校や偏差値の変更時はシラバスの自動組み換えを連動。年度替わり（4月）に自動で学年が進級するロジック内蔵。

### 3.2 管理者向け画面 (`src/app/admin`)
ヘッダーに `AdminNav` を備えた専用ダッシュボード。

1. **カリキュラム管理 (`/admin/curriculum`)**:
   - 中学校・高等学校の全教科マスターDB（`curriculum_db`）を閲覧。
   - 「マスターDBを更新」ボタンで `src/data/master_curriculum/*.md` を全件再パースしてFirestoreに同期。
2. **学習コンテンツ管理 (`/admin/materials`)**:
   - 各科目の学習コンテンツ（HTML等）のインポート・世代管理画面。
   - **大項目連携**: カリキュラム管理の大項目（「高等学校 数学」「中学校 国語」等）と完全同期したインポートボタン。
   - **視認性**: 高等学校（青）と中学校（緑）にエリア・色分け分離。
   - **ショートカット**: 画面上部にページ内アンカーリンクを配置。
   - **並び順**: コンテンツタイトル（`数Ⅰ-001` 等）の昇順ソート。
   - **タイトル表示**: ファイル名横にHTMLの`<title>`から抽出した正式タイトルを表示。
   - **重複アラート & 世代管理**: 同一ファイル名アップロード時はダイアログで確認。最新版＋過去2世代（計3世代）を保持。
   - **プレビュー & 正規化**: 旧バージョンの参照プレビュー、および旧バージョンを最新版へ昇格させる「正規化」機能。
3. **テストコンテンツ管理 (`/admin/tests`)**:
   - 各科目のテスト問題データ（HTML等）のインポート・世代管理画面。
   - 仕様は学習コンテンツ管理と同等で、科目ごとのインポート、最新版＋過去2世代（計3世代）の履歴保持、プレビュー（`?type=test`）、正規化復元に対応。データは `test_materials` コレクションに格納。
4. **個別シラバス管理 (`/admin/syllabus`)**:
   - 対象生徒を選び、マスターカリキュラムと個人属性を掛け合わせた個人専用シラバス（正データ）の閲覧・管理。
5. **AIモデル・API管理 (`/admin/models`)**:
   - Gemini APIの利用可能モデル一覧を動的取得し、フォールバックチェーン（Syllabus用 / Chat用）をGUI上で確認・再同期。

### 3.3 プレビュー専用画面 (`src/app/preview/[id]`)
- 管理者が学習コンテンツまたはテストコンテンツのリンクをクリックした際に遷移する独立画面。
- `type=test` クエリパラメータにより学習コンテンツ（`learning_materials`）とテストコンテンツ（`test_materials`）の双方のプレビューに対応。
- 生徒画面のサイドバーに囚われないよう独立したルートで動作。
- 上部に「← 管理画面に戻る」ボタンを常設し、教材本体は全画面 `iframe` (`srcDoc`) で埋め込み。元のCSSやJSモジュール（KaTeX等）が完全に動作。

---

## 4. APIエンドポイント詳細仕様

| エンドポイント | Method | 主なパラメータ / Body | 概要 | 外部連携 / Firestore |
|---|---|---|---|---|
| `/api/auth/login` | `POST` | `{ userId, password }` | 認証・自動新規登録・Cookie発行 | `users/{userId}` |
| `/api/auth/reset` | `POST` | `{ userId, newPassword }` | パスワードリセット | `users/{userId}` |
| `/api/chat` | `POST` | `{ message, history, persona, sessionId? }` | 生徒チャット応答生成・セッション保存 | Gemini Flash, `users/{userId}/chat_sessions/{sessionId}` |
| `/api/chat/sessions` | `GET/POST` | なし / `{ title, id }` | チャットセッション一覧取得・新規作成 | `users/{userId}/chat_sessions` |
| `/api/chat/sessions/[id]` | `GET/DELETE` | なし | 特定セッション取得・セッション削除 | `users/{userId}/chat_sessions/{id}` |
| `/api/drill` | `POST` | `{ subject, topic, level }` | ドリル問題自動生成 | Gemini Flash |
| `/api/drill/evaluate` | `POST` | `{ question, userAnswer }` | 解答自動採点・解説生成 | Gemini Flash, `users/{userId}.db.logs` |
| `/api/exam-analysis` | `POST` | `{ examData }` | 模試成績分析・改善案生成 | Gemini Pro/Flash |
| `/api/flashcard` | `GET/POST` | `{ cards }` | 暗記カード取得・保存 | `users/{userId}.db.flashcards` |
| `/api/flashcard/review` | `POST` | `{ id, correct }` | 反復間隔・レベル更新 | `users/{userId}.db.flashcards` |
| `/api/plan/generate` | `POST` | `{ profile }` | 個人用学習シラバス生成 | Gemini Pro, `users/{userId}.db.syllabus` |
| `/api/db/daily` | `GET` | なし (Cookie依存) | 本日の分析・キャッシュ取得 | `users/{userId}.db.dailyAnalysis` |
| `/api/cron/daily` | `POST` | `{ profile }` | 日次分析・ミニレッスン生成 | Gemini, `users/{userId}.db.dailyAnalysis` |
| `/api/cron/report` | `GET` | なし (Cron実行) | 管理者宛て日次進捗メール送信 | Firestore全ユーザー集計, Nodemailer (Gmail) |
| `/api/youtube` | `GET` | `?q=検索ワード` | YouTube解説動画検索 | YouTube Data API v3 |
| `/api/materials/[id]` | `GET` | `?v=世代インデックス(任意)` | 学習コンテンツHTML取得 | `learning_materials/{id}` |
| `/api/tests/[id]` | `GET` | `?v=世代インデックス(任意)` | テストコンテンツHTML取得 | `test_materials/{id}` |
| `/api/admin/master-db` | `GET` | なし | 全教科マスターカリキュラム取得 | `curriculum_db` |
| `/api/admin/generate-syllabus`| `POST` | なし | master_curriculumのMDをFirestoreへ全同期 | `curriculum_db` (全件書き換え) |
| `/api/admin/materials-list` | `GET` | なし | 学習コンテンツメタデータ一覧取得 | `learning_materials` |
| `/api/admin/import-materials` | `POST` | `FormData (subject, files)` | 学習コンテンツHTML一括インポート（世代管理） | `learning_materials` (Chunk分割) |
| `/api/admin/restore-version` | `POST` | `{ id, versionIndex }` | 学習コンテンツ旧バージョンの正規化 | `learning_materials/{id}` |
| `/api/admin/tests-list` | `GET` | なし | テストコンテンツメタデータ一覧取得 | `test_materials` |
| `/api/admin/import-tests` | `POST` | `FormData (subject, files)` | テストコンテンツHTML一括インポート（世代管理） | `test_materials` (Chunk分割) |
| `/api/admin/restore-test-version` | `POST` | `{ id, versionIndex }` | テスト旧バージョンの正規化 | `test_materials/{id}` |
| `/api/admin/models-config` | `GET` | なし | AIモデル設定取得 | `config/ai_models` |
| `/api/admin/update-models` | `GET` | なし | Gemini APIから最新モデル一覧を同期 | `config/ai_models` |
| `/api/admin/users` | `GET` | なし | 登録生徒一覧取得 | `users` |

---

## 5. データベース (Firestore) データモデル仕様

### 5.1 `users` コレクション
- **Doc ID**: `userId` (生徒のID)
- **フィールド**:
  - `password`: string (平文またはハッシュ)
  - `createdAt`: string (ISO 8601)
  - `db`: Map (生徒の学習実データ)
    - `logs`: Array<LogEntry> (チャット、ドリル、ポモドーロの履歴)
    - `studyTime`: Record<YYYY-MM-DD, 分数>
    - `syllabus`: Array<SyllabusPhase> (パーソナライズされたシラバス)
    - `syllabusUpdatedAt`: string
    - `dailyAnalysis`: Map (日次AI分析、合格判定レベル、ミニレッスン等)
    - `flashcards`: Array<Flashcard> (暗記カードデータ)
    - `dayPlans`: Record<YYYY-MM-DD, DayPlan> (日ごとの学習予定枠、目標時間、日タイプ、メモ)
- **サブコレクション `chat_sessions`**:
  - **Doc ID**: `sessionId` (例: `chat_1712659200000_abc`)
  - **フィールド**:
    - `id`: string
    - `userId`: string
    - `title`: string (最初のユーザー発言から自動生成)
    - `date`: string (JST基準 `YYYY-MM-DD`)
    - `createdAt`: string (ISO 8601)
    - `updatedAt`: string (ISO 8601)
    - `messages`: Array<{ role: 'user' | 'model', content: string, timestamp: string }>


### 5.2 `curriculum_db` コレクション
学習指導要領準拠の公式マスターカリキュラム。
- **Doc ID**: `{level}_{subjectName}` (例: `high_school_数学`, `junior_high_国語`)
- **フィールド**:
  - `id`: string
  - `level`: `'junior_high' | 'high_school'`
  - `subjectName`: string (例: `数学`, `英語`)
  - `updatedAt`: string (ISO 8601)
  - `largeCategories`: Array<{
      name: string, // 大項目 (例: "数学Ⅰ")
      mediumCategories: Array<{
        name: string, // 中項目 (例: "第1章 数と式")
        smallCategories: Array<string> // 小項目・コマ単位 (例: ["整式の整理と加法・減法", ...])
      }>
    }>

### 5.3 `learning_materials` コレクション
インポートされた授業用HTMLコンテンツ。
- **Doc ID**: `title` (例: `数Ⅰ-001`, `数Ａ-005`。ファイル名から拡張子を除いたもの)
- **フィールド**:
  - `title`: string (ファイル識別子)
  - `contentTitle`: string (HTML内`<title>`タグから抽出した正式名称。例: `整式の整理と加法・減法`)
  - `filename`: string (例: `数Ⅰ-001.html`)
  - `content`: string (HTML全文)
  - `type`: `'html'`
  - `subject`: string (大項目ID。例: `high_school_数学`)
  - `importedAt`: string (ISO 8601)
  - `versions`: Array<{
      content: string,
      importedAt: string
    }> (最大2世代保持。最新版と合わせて3世代管理)

### 5.4 `config` コレクション
- **Doc ID**: `ai_models`
- **フィールド**:
  - `syllabus`: Array<string> (シラバス・分析用モデルフォールバック順)
  - `chat`: Array<string> (チャット用モデルフォールバック順)
  - `updatedAt`: string

---

## 6. AIモデル管理とフォールバック仕様

- **デフォルトモデル構成 (`DEFAULT_MODELS`)**:
  - `syllabus`: `["gemini-3.8-flash", "gemini-3.7-flash", "gemini-1.5-pro", "gemini-1.5-flash"]`
  - `chat`: `["gemini-3.8-flash", "gemini-3.7-flash", "gemini-1.5-flash"]`
- **フォールバック機構**:
  - API呼び出し時、配列の先頭モデルから順に実行を試行。
  - レートリミット（429）、存在しないモデルエラー、タイムアウト等が発生した場合は自動的に次のモデルに切り替えて実行を継続。
- **動的更新**:
  - `/api/admin/update-models` を叩くことで、Google Gemini APIのエンドポイント（`v1beta/models`）から最新の利用可能モデルを自動取得・マージしてFirestoreへ保存。

---

## 7. 環境変数一覧 (`.env.local` / Vercel Environment Variables)

| 変数名 | 用途 | 必須度 |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Firebase Admin SDK プロジェクトID | 必須 |
| `FIREBASE_CLIENT_EMAIL` | Firebase サービスアカウントのクライアントメール | 必須 |
| `FIREBASE_PRIVATE_KEY` | Firebase サービスアカウントの秘密鍵 (`\n`を含む形式) | 必須 |
| `GEMINI_API_KEY` | Google AI Studio の APIキー | 必須 |
| `YOUTUBE_API_KEY` | YouTube Data API v3 の APIキー | 任意 (ライブラリ動画検索用) |
| `EMAIL_USER` | レポート送信用 Gmail アカウント | 任意 (Cronレポート用) |
| `EMAIL_PASS` | Gmail アプリパスワード (16桁) | 任意 (Cronレポート用) |

---

## 8. 既知の仕様・過去の経緯・注意点 (重要申し送り)

1. **Vercelのペリロード制限 (4.5MB)**:
   - Serverless Functions のリクエストボディには 4.5MB の上限があります。HTML教材を一括アップロードする際は、フロントエンド (`admin/materials/page.tsx`) 側で 5ファイルずつのチャンクに分割して送信しています。
2. **教材のレンダリング方式**:
   - 教材HTMLは `<head>` 内のKaTeXモジュールやスタイルシートに依存しています。Next.js側のUIとCSSが衝突しないよう、プレビュー画面 (`/preview/[id]`) では `iframe` の `srcDoc` 属性を用いて完全隔離レンダリングしています。
3. **カリキュラム命名規則**:
   - カリキュラムの元ファイル (`src/data/master_curriculum`) は必ず `中学校_` または `高等学校_` で始まっている必要があります。例外ファイルを追加する際はプレフィックス規則を厳守してください。
4. **管理画面の認証セキュリティ**:
   - 現状は `middleware.ts` による Cookie (`study_user_id`) の存在チェックのみとなっており、ロール別の管理者権限分離（Role-Based Access Control）は未実装です。本格運用時は管理者フラグの判定を追加することが推奨されます。
5. **教材の世代管理 (3世代)**:
   - 最新版1件 + `versions` 配列2件で合計3世代を保持します。新バージョンインポート時、および旧バージョン正規化（復元）時に配列の先頭へunshiftされ、3件を超える古い履歴は自動で切り捨てられます。

---

## 9. 別のAIツールへの引継ぎ手順

次のAIツールに作業を依頼する際は、以下のステップで進めてください。

### ステップ1: プロンプト（引継ぎ宣言）の投入
以下のテキストをコピーして新しいAIツールに送信してください：

```markdown
あなたは「Abiko Study App (AI & SI Tutor)」のリードエンジニアとして開発業務を引き継ぎます。
リポジトリ直下の `docs/AI_HANDOVER_SPECIFICATION.md` に全仕様・データ構造・既知の注意点が記載されています。
まずはこの仕様書とリポジトリ構成を確認し、現在のプロジェクト状況を完全に把握したことを宣言してください。
```

### ステップ2: 開発環境の確認コマンド
引き継いだAIに以下のコマンドを実行させ、環境が正常に稼働しているか確認させてください：
```bash
npm run build
```
Buildが `Exit code: 0` で通れば、コードおよび型定義の整合性は保たれています。
