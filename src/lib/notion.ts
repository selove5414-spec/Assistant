import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { unstable_cache } from 'next/cache';

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
// Cache 定義
// - Notion 知識庫：使用 Next.js unstable_cache（Vercel Data Cache，跨 Instance 共享）
// - 系統設定、Session：使用 In-Memory Cache（同一 Instance 內快速存取）
// ============================================================

interface MemCacheEntry<T> {
  data: T;
  expiresAt: number;
}

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
 * 實際從 Notion 拉取知識庫資料的內部函式
 * 由 unstable_cache 包裹後對外提供（TTL: 1小時，tag: 'notion-data'）
 */
async function _fetchNotionData() {
  const now = Date.now();
  console.log('[Notion] Fetching fresh data from Notion API...');
  const pageIds = getNotionPageIds();

  if (pageIds.length === 0) {
    return {
      combinedContext: 'No Notion pages configured.',
      pages: [] as NotionContext[],
      fetchedAt: now,
    };
  }

  const promises = pageIds.map((id) => fetchNotionPage(id));
  const pages = (await Promise.all(promises)).filter((p): p is NotionContext => p !== null);

  const combinedContext =
    pages.map((p) => `--- Page: ${p.title} ---\n${p.content}`).join('\n\n') +
    `\n\n[System Info] Data Fetched At: ${new Date().toISOString()}`;

  console.log(`[Notion] Fetched ${pages.length} page(s).`);
  return { combinedContext, pages, fetchedAt: now };
}

/**
 * 取得 Notion 知識庫資料（使用 Next.js Data Cache，跨 Vercel Instance 共享）
 *
 * Cache 策略：
 * - TTL 1 小時，tag: 'notion-data'
 * - 呼叫 revalidateTag('notion-data') 可跨所有 Instance 即時清除
 */
export const getCachedNotionData = unstable_cache(
  _fetchNotionData,
  ['notion-data'],
  {
    revalidate: 3600, // 1 小時
    tags: ['notion-data'],
  }
);

/**
 * 手動清除 Notion 資料快取（保留此函式以相容舊呼叫方）
 * 實際清除操作由 Server Action（actions.ts）使用 revalidateTag 處理
 */
export function invalidateNotionCache() {
  // 實際清除已移至 actions.ts 中用 revalidateTag 處理
  console.log('[Notion] invalidateNotionCache called (no-op; use revalidateTag in Server Actions).');
}

/**
 * 直接從 Notion API 拉取最新資料，完全繞過快取
 * 供 API Route Handler 使用，用於強制更新知識庫
 */
export async function fetchNotionDataDirect() {
  return _fetchNotionData();
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
