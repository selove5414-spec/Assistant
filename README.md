# 導師小助 (Line AI Bot)

這是一個專為導師/教師設計的 LINE AI 助理機器人。它結合了 **Google Gemini** 與 **Groq** 雙模型架構，並串接 **Notion** 作為知識庫，能自動讀取學校或課程的公告、行事曆與規章，即時回答使用者的提問。

## ✨ 主要功能

- **雙 AI 模型架構 (Dual AI Models)**：
  - **主要模型**：Google Gemini (預設使用 `gemini-flash-latest`，即 1.5 Flash)，處理能力強且支援長文本。
  - **備援模型**：Groq (使用 `llama-3.3-70b-versatile`)，當 Gemini 配額不足或連線失敗時，系統會自動切換至 Groq，確保服務不中斷。
- **Notion 知識庫整合**：
  - 自動讀取指定的 Notion 頁面內容作為 AI 的回答依據。
  - 內建快取機制 (Cache)，預設每 24 小時更新一次資料，確保回應速度快且節省 API 呼叫。
- **LINE Messaging API 整合**：
  - 支援 LINE 官方帳號接收訊息與自動回覆。
  - 支援 Webhook 事件處理。
- **開發測試工具**：
  - 提供 `/api/test-models` 快速檢測 AI 模型連線狀態與 Notion 資料讀取狀況。
  - 提供 `/api/debug-gemini` 協助除錯 Google API Key 的權限與可用模型列表。

## 🛠️ 技術架構

- **框架**：[Next.js 16](https://nextjs.org/) (App Router)
- **語言**：TypeScript
- **AI SDK**：
  - `@google/generative-ai` (Gemini)
  - `groq-sdk` (Groq/Llama)
- **資料庫/CMS**：Notion API (`@notionhq/client`, `notion-to-md`)
- **平台**：LINE Messaging API (`@line/bot-sdk`)

## 🚀 快速開始

### 1. 安裝套件

```bash
npm install
```

### 2. 環境變數設定 (.env)

請在專案根目錄建立 `.env` 檔案，並填入以下資訊：

```properties
# --- Google Gemini (主要模型) ---
GOOGLE_API_KEY=你的_Google_AI_Studio_Key
GEMINI_MODEL_NAME=gemini-flash-latest

# --- Groq (備援模型) ---
GROQ_API_KEY=你的_Groq_API_Key
GROQ_MODEL_NAME=llama-3.3-70b-versatile

# --- Notion (知識庫) ---
NOTION_API_KEY=你的_Notion_Integration_Token
# 要讀取的 Notion 頁面 ID，可多個，用逗號分隔
NOTION_PAGE_IDS=page_id_1,page_id_2

# --- LINE Messaging API ---
LINE_CHANNEL_ACCESS_TOKEN=你的_Channel_Access_Token
LINE_CHANNEL_SECRET=你的_Channel_Secret

# --- 其他設定 ---
AI_ENABLED=true
AI_TEMPERATURE=0.0
# 管理員 LINE ID (用於接收通知)
ADMIN_LINE_ID=你的_Line_Use_ID
```
> *詳細變數說明請參考 `configuration_guide.md`*

### 3. 啟動開發伺服器

```bash
npm run dev
```

伺服器預設運作於 [http://localhost:3000](http://localhost:3000)。

## 🧪 測試與驗證

本專案內建測試 API，方便您確認系統狀態：

1.  **整合測試**：
    瀏覽 [http://localhost:3000/api/test-models](http://localhost:3000/api/test-models)
    - 檢查 Notion 資料是否讀取成功。
    - 同時測試 Gemini 與 Groq 回應是否正常。
    - 觀察回應時間 (Latency)。

2.  **Gemini 除錯**：
    瀏覽 [http://localhost:3000/api/debug-gemini](http://localhost:3000/api/debug-gemini)
    - 測試多個 Gemini 版本 (2.0, 1.5, Pro 等) 的連線狀態。
    - 用於解決 404 Model Not Found 或 429 配額不足的問題。

## 📂 專案結構

```
src/
├── app/
│   ├── api/
│   │   ├── line/          # LINE Webhook 入口
│   │   ├── test-models/   # 系統自我檢測 API
│   │   └── debug-gemini/  # Gemini 模型除錯 API
├── lib/
│   ├── ai.ts              # AI 邏輯 (包含 Gemini/Groq 切換機制)
│   ├── notion.ts          # Notion 資料讀取與轉檔
│   └── line.ts            # LINE Client 初始化
└── ...
```

## 📝 授權

MIT License
