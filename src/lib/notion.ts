import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';

// 初始化 Notion 官方 Client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// 初始化 Markdown 轉換器
const n2m = new NotionToMarkdown({ notionClient: notion });

export interface NotionContext {
  pageId: string;
  content: string; // Markdown 內容
  title?: string;
  lastUpdated: number;
}

// Database IDs（來自 .env）
const NOTION_CONFIG_DB_ID = process.env.NOTION_CONFIG_DB_ID || '';
const NOTION_SESSION_DB_ID = process.env.NOTION_SESSION_DB_ID || '';

/**
 * 從環境變數取得 Notion Page IDs
 */
export function getNotionPageIds(): string[] {
  const ids = process.env.NOTION_PAGE_IDS;
  if (!ids) return [];
  return ids.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}

// ============================================================
// In-Memory Cache 定義
// 利用 Serverless Module 層的生命週期，同一個 Instance 內免重複請求
// ============================================================

interface MemCacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Notion 知識庫快取（TTL: 1小時） */
let notionDataCache: MemCacheEntry<{
  combinedContext: string;
  pages: NotionContext[];
  fetchedAt: number;
}> | null = null;
const NOTION_DATA_TTL_MS = 60 * 60 * 1000; // 1 小時

/** 系統設定快取（TTL: 5分鐘） */
let systemConfigCache: MemCacheEntry<SystemConfig | null> | null = null;
const SYSTEM_CONFIG_TTL_MS = 5 * 60 * 1000; // 5 分鐘

/** 對話 Session 快取 Map（TTL: 2分鐘） */
const sessionCache = new Map<string, MemCacheEntry<ChatSession | null>>();
const SESSION_TTL_MS = 2 * 60 * 1000; // 2 分鐘

// ============================================================

/**
 * 從單一 Notion 頁面讀取資料，轉成 Markdown
 */
async function fetchNotionPage(pageId: string): Promise<NotionContext | null> {
  try {
    // 1. 取得頁面 metadata（標題）
    const page: any = await notion.pages.retrieve({ page_id: pageId });

    let title = 'Untitled';
    if (page.properties) {
      const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any;
      if (titleProp && titleProp.title && titleProp.title.length > 0) {
        title = titleProp.title.map((t: any) => t.plain_text).join('');
      } else if (page.icon?.emoji) {
        title = `${page.icon.emoji} Page`;
      }
    }

    // 2. 取得頁面內容（Blocks → Markdown）
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const mdString = n2m.toMarkdownString(mdBlocks);

    return {
      pageId,
      content: mdString.parent,
      title,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`[Notion] Error fetching page ${pageId}:`, error);
    return null;
  }
}

/**
 * 取得 Notion 知識庫資料（含 In-Memory Cache）
 *
 * Cache 策略：
 * - 同一個 Serverless Instance 生命週期內，TTL（1小時）內直接從記憶體回傳
 * - TTL 過期或首次呼叫才重新拉 Notion API
 */
export async function getCachedNotionData() {
  const now = Date.now();

  // ✅ 快取命中：直接從記憶體回傳，不打任何外部 API
  if (notionDataCache && now < notionDataCache.expiresAt) {
    console.log('[Notion] Cache HIT - Returning from in-memory cache');
    return notionDataCache.data;
  }

  // ❌ 快取未命中：重新拉 Notion
  console.log('[Notion] Cache MISS - Fetching fresh data from Notion API...');
  const pageIds = getNotionPageIds();

  if (pageIds.length === 0) {
    const emptyResult = {
      combinedContext: 'No Notion pages configured.',
      pages: [] as NotionContext[],
      fetchedAt: now,
    };
    notionDataCache = { data: emptyResult, expiresAt: now + NOTION_DATA_TTL_MS };
    return emptyResult;
  }

  const promises = pageIds.map((id) => fetchNotionPage(id));
  const pages = (await Promise.all(promises)).filter((p): p is NotionContext => p !== null);

  const combinedContext =
    pages.map((p) => `--- Page: ${p.title} ---\n${p.content}`).join('\n\n') +
    `\n\n[System Info] Data Fetched At: ${new Date().toISOString()}`;

  const result = { combinedContext, pages, fetchedAt: now };

  // 寫入記憶體快取
  notionDataCache = { data: result, expiresAt: now + NOTION_DATA_TTL_MS };
  console.log(`[Notion] Cached ${pages.length} page(s). Expires in ${NOTION_DATA_TTL_MS / 60000} minutes.`);

  return result;
}

/**
 * 手動清除 Notion 資料快取（供管理介面的「更新知識庫」按鈕使用）
 */
export function invalidateNotionCache() {
  notionDataCache = null;
  console.log('[Notion] In-memory cache invalidated manually.');
}

// --- 系統設定（Notion DB）---

export interface SystemConfig {
  AI_ENABLED: boolean;
  MODEL_NAME: string;
  SYSTEM_PROMPT?: string;
  HANDOVER_KEYWORDS?: string[];
  AUTO_SWITCH_MINUTES?: number;
  ADMIN_LINE_ID?: string;
}

/**
 * 取得系統設定（含 In-Memory Cache，TTL 5分鐘）
 */
export async function getSystemConfig(): Promise<SystemConfig | null> {
  if (!NOTION_CONFIG_DB_ID) return null;

  const now = Date.now();

  // ✅ 快取命中
  if (systemConfigCache && now < systemConfigCache.expiresAt) {
    console.log('[Config] Cache HIT - Returning from in-memory cache');
    return systemConfigCache.data;
  }

  console.log('[Config] Cache MISS - Fetching from Notion DB...');

  try {
    const response = await (notion.databases as any).query({
      database_id: NOTION_CONFIG_DB_ID,
    });

    const config: any = {};

    response.results.forEach((page: any) => {
      const props = page.properties;
      let key = '';
      let value: any = '';

      if (props.Key && props.Key.title && props.Key.title.length > 0) {
        key = props.Key.title[0].plain_text;
      }

      if (props.Value && props.Value.rich_text && props.Value.rich_text.length > 0) {
        value = props.Value.rich_text[0].plain_text;
      }

      if (key) {
        if (value === 'true') config[key] = true;
        else if (value === 'false') config[key] = false;
        else if (!isNaN(Number(value)) && key === 'AUTO_SWITCH_MINUTES') config[key] = Number(value);
        else config[key] = value;
      }
    });

    if (typeof config.HANDOVER_KEYWORDS === 'string') {
      config.HANDOVER_KEYWORDS = config.HANDOVER_KEYWORDS.split(',').map((k: string) => k.trim());
    }

    const result = config as SystemConfig;

    // 寫入快取
    systemConfigCache = { data: result, expiresAt: now + SYSTEM_CONFIG_TTL_MS };
    return result;

  } catch (error) {
    console.error('[Config] Error fetching system config:', error);
    // 快取錯誤結果（短暫，避免一直重試）
    systemConfigCache = { data: null, expiresAt: now + 30_000 }; // 30 秒後再試
    return null;
  }
}

export async function updateSystemConfig(key: string, value: string | boolean) {
  if (!NOTION_CONFIG_DB_ID) return;

  const response = await (notion.databases as any).query({
    database_id: NOTION_CONFIG_DB_ID,
    filter: {
      property: 'Key',
      title: { equals: key }
    }
  });

  const strValue = String(value);

  if (response.results.length > 0) {
    const pageId = response.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Value: { rich_text: [{ text: { content: strValue } }] }
      }
    });
  } else {
    await notion.pages.create({
      parent: { database_id: NOTION_CONFIG_DB_ID },
      properties: {
        Key: { title: [{ text: { content: key } }] },
        Value: { rich_text: [{ text: { content: strValue } }] }
      }
    });
  }

  // 清除設定快取，讓下次讀取拿到最新值
  systemConfigCache = null;
}

// --- 對話 Session 管理（Notion DB）---

export interface ChatSession {
  lineUserId: string;
  mode: 'AI' | 'Human';
  lastActive: string;
  pageId?: string;
}

/** 本地 Memory Fallback（當 DB ID 未設定時使用） */
const localSessionStore = new Map<string, ChatSession>();

/**
 * 取得對話 Session（含 In-Memory Cache，TTL 2分鐘）
 */
export async function getChatSession(lineUserId: string): Promise<ChatSession | null> {
  const now = Date.now();

  // ✅ 快取命中
  const cached = sessionCache.get(lineUserId);
  if (cached && now < cached.expiresAt) {
    console.log(`[Session] Cache HIT for ${lineUserId}`);
    return cached.data;
  }

  // ❌ 快取未命中：查 Notion DB
  if (NOTION_SESSION_DB_ID) {
    try {
      const response = await (notion.databases as any).query({
        database_id: NOTION_SESSION_DB_ID,
        filter: {
          property: 'LineUserID',
          title: { equals: lineUserId }
        }
      });

      if (response.results.length === 0) {
        sessionCache.set(lineUserId, { data: null, expiresAt: now + SESSION_TTL_MS });
        return null;
      }

      const page: any = response.results[0];
      const props = page.properties;

      const session: ChatSession = {
        lineUserId,
        mode: props.Mode?.select?.name || 'AI',
        lastActive: props.LastActive?.date?.start || new Date().toISOString(),
        pageId: page.id
      };

      // 寫入快取
      sessionCache.set(lineUserId, { data: session, expiresAt: now + SESSION_TTL_MS });
      return session;

    } catch (error) {
      console.error('[Session] Error fetching chat session from Notion:', error);
      // Fallback 到本地
    }
  }

  return localSessionStore.get(lineUserId) || null;
}

export async function getActiveHumanSessions(): Promise<ChatSession[]> {
  const sessions: ChatSession[] = [];

  if (NOTION_SESSION_DB_ID) {
    try {
      const response = await (notion.databases as any).query({
        database_id: NOTION_SESSION_DB_ID,
        filter: {
          property: 'Mode',
          select: { equals: 'Human' }
        }
      });
      const notionSessions = response.results.map((page: any) => ({
        lineUserId: page.properties.LineUserID.title[0]?.plain_text || 'Unknown',
        mode: 'Human',
        lastActive: page.properties.LastActive?.date?.start || new Date().toISOString(),
        pageId: page.id
      })) as ChatSession[];
      sessions.push(...notionSessions);
    } catch (error) {
      console.error('[Session] Error fetching human sessions from Notion:', error);
    }
  }

  // Local fallback
  for (const session of localSessionStore.values()) {
    if (session.mode === 'Human') {
      if (!sessions.find(s => s.lineUserId === session.lineUserId)) {
        sessions.push(session);
      }
    }
  }

  return sessions;
}

export async function updateChatSession(lineUserId: string, mode: 'AI' | 'Human') {
  const now = new Date().toISOString();

  if (NOTION_SESSION_DB_ID) {
    try {
      const existingSession = await getChatSession(lineUserId);

      if (existingSession && existingSession.pageId) {
        await notion.pages.update({
          page_id: existingSession.pageId,
          properties: {
            Mode: { select: { name: mode } },
            LastActive: { date: { start: now } }
          }
        });
      } else {
        await notion.pages.create({
          parent: { database_id: NOTION_SESSION_DB_ID },
          properties: {
            LineUserID: { title: [{ text: { content: lineUserId } }] },
            Mode: { select: { name: mode } },
            LastActive: { date: { start: now } }
          }
        });
      }

      // 更新後清除該用戶的 Session 快取，讓下次讀最新
      sessionCache.delete(lineUserId);
      return;

    } catch (e) {
      console.error('[Session] Failed to update Notion session DB', e);
    }
  }

  // Fallback: 本地記憶體
  localSessionStore.set(lineUserId, { lineUserId, mode, lastActive: now });
}
