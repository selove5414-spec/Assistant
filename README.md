# 導師小助 (LINE AI Bot)

一個專為導師/教師設計的 LINE AI 助理機器人。結合 **Google Gemini** 與 **Groq** 雙模型架構，串接 **Notion** 作為知識庫，自動回答學生與家長的提問。

## ✨ 主要功能

- **雙 AI 模型架構**：主要使用 Gemini，備援切換至 Groq，確保服務不中斷
- **Notion 知識庫整合**：自動讀取指定 Notion 頁面並快取，加速回應
- **In-Memory 快取**：同一伺服器 Instance 內，知識庫資料直接從記憶體回傳（TTL 1小時），大幅減少延遲
- **真人轉接機制**：用戶可觸發關鍵字轉接真人，並自動通知管理員
- **多學校支援**：透過 `SCHOOL_NAME` 環境變數切換學校名稱，同一套系統可供不同學校使用
- **LINE 純文字排版**：AI 回覆使用 emoji + 純文字格式，在 LINE 聊天室中清楚易讀

## 🤖 AI 模型說明

### 主力模型：Google Gemini（免費版）

| 項目 | 規格 |
| :--- | :--- |
| 每分鐘請求數 (RPM) | 15 RPM |
| 每日請求數 (RPD) | 1,500 RPD |
| 每分鐘 Token 數 (TPM) | 1,000,000 TPM |

### 備援模型：Groq（免費版）

| 項目 | 規格 |
| :--- | :--- |
| 每分鐘請求數 (RPM) | 30 RPM |
| 每日請求數 (RPD) | 1,000 RPD |
| 每分鐘 Token 數 (TPM) | 6,000 TPM |

## 🛠️ 技術架構

- **框架**：Next.js (App Router) + TypeScript
- **AI SDK**：`@google/generative-ai`（Gemini）、`groq-sdk`（Groq）
- **知識庫**：Notion API（`@notionhq/client`、`notion-to-md`）
- **平台**：LINE Messaging API（`@line/bot-sdk`）
- **部署**：Vercel

## 🛡️ 資安與開發規範

- **無硬編碼金鑰 (No Hardcoded Keys)**：所有 API Key、Secret 與 Token 均強制透過環境變數（`.env` 等）讀取，嚴禁直接寫入程式碼。
- **防止機密外洩**：專案已設定 `.gitignore` 排除所有環境變數檔案（僅保留 `.env.example` 供設定參考）。
- **定期掃描**：程式碼均經過金鑰字串掃描，確保無敏感資訊外洩風險。

## 📜 實用腳本

- **`update_ide.bat`**: 用於快速更新與設定開發環境的腳本。

## 🚀 快速開始

### 1. 安裝套件

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env`，並填入所有必填項目：

```bash
cp .env.example .env
```

**環境變數完整說明：**

| 變數 | 必填 | 說明 |
| :--- | :---: | :--- |
| `GOOGLE_API_KEY` | ✅ | Google AI Studio API Key |
| `GEMINI_MODEL_NAME` | | Gemini 模型名稱，預設 `gemini-1.5-flash` |
| `GROQ_API_KEY` | ✅ | Groq Cloud API Key |
| `GROQ_MODEL_NAME` | | Groq 模型名稱，預設 `gemma2-9b-it` |
| `AI_ENABLED` | | 全域開關，預設 `true` |
| `AI_TEMPERATURE` | | 回覆隨機性，預設 `0.0`（最穩定） |
| `SYSTEM_PROMPT` | | 附加到 AI 的額外系統指令 |
| `HANDOVER_KEYWORDS` | | 觸發轉真人的關鍵字，預設 `轉真人,人工客服` |
| `AUTO_SWITCH_MINUTES` | | 真人模式逾時（分鐘），預設 `5` |
| `ADMIN_LINE_ID` | | 管理員 LINE User ID，收轉接通知 |
| `SCHOOL_NAME` | | 學校或單位名稱，出現於 AI 自我介紹，預設 `導師室` |
| `NOTION_API_KEY` | ✅ | Notion Integration Token |
| `NOTION_PAGE_IDS` | ✅ | 知識庫頁面 ID，逗號分隔 |
| `NOTION_CONFIG_DB_ID` | | 系統設定 Database ID（可選） |
| `NOTION_SESSION_DB_ID` | | 對話 Session Database ID（可選） |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Channel Access Token |
| `LINE_CHANNEL_SECRET` | ✅ | LINE Channel Secret |

### 3. 啟動開發伺服器

```bash
npm run dev
```

伺服器預設運作於 [http://localhost:3000](http://localhost:3000)

## 🧪 測試與驗證

| API | 說明 |
| :--- | :--- |
| `/api/test-models` | 測試 Gemini / Groq 連線、Notion 讀取 |
| `/api/debug-gemini` | 測試可用的 Gemini 模型清單 |

在 LINE 聊天中直接輸入：

| 指令 | 功能 |
| :--- | :--- |
| `status` 或 `debug` | 查看目前快取狀態與已載入的 Notion 頁面 |
| `id` 或 `myid` | 取得自己的 LINE User ID |

## 📂 專案結構

```
src/
├── app/
│   ├── api/
│   │   ├── line/          # LINE Webhook 入口
│   │   ├── test-models/   # 系統自我檢測 API
│   │   └── debug-gemini/  # Gemini 模型除錯 API
│   └── admin/             # 後台管理介面
├── lib/
│   ├── ai.ts              # AI 邏輯（Gemini / Groq 雙模型切換）
│   ├── notion.ts          # Notion 讀取、快取管理
│   └── line.ts            # LINE Client 初始化
```

## 📝 授權

MIT License
