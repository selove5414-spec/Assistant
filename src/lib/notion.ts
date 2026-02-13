import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { unstable_cache } from 'next/cache';

// Initialize Official Notion Client
// Ensure NOTION_API_KEY (integration token) is set in .env
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Markdown Converter
const n2m = new NotionToMarkdown({ notionClient: notion });

export interface NotionContext {
  pageId: string;
  content: string; // Markdown representation
  title?: string;
  lastUpdated: number;
}

// Database IDs (Expected to be in .env)
const NOTION_CONFIG_DB_ID = process.env.NOTION_CONFIG_DB_ID || '';
const NOTION_SESSION_DB_ID = process.env.NOTION_SESSION_DB_ID || '';

/**
 * Validates Notion Page IDs from environment variable
 */
export function getNotionPageIds(): string[] {
  const ids = process.env.NOTION_PAGE_IDS;
  if (!ids) return [];
  return ids.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}

/**
 * Fetches data from a single Notion page using Official API.
 * Converts blocks to Markdown string.
 */
async function fetchNotionPage(pageId: string): Promise<NotionContext | null> {
  try {
    // 1. Get Page Metadata (Title)
    const page: any = await notion.pages.retrieve({ page_id: pageId });

    // Extract title safe check
    let title = 'Untitled';
    if (page.properties) {
      // Find the title property (usually named "Name" or "Title")
      const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any;
      if (titleProp && titleProp.title && titleProp.title.length > 0) {
        title = titleProp.title.map((t: any) => t.plain_text).join('');
      } else if (page.icon?.emoji) {
        title = `${page.icon.emoji} Page`;
      }
    }

    // 2. Get Page Content (Blocks) -> Markdown
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const mdString = n2m.toMarkdownString(mdBlocks);

    return {
      pageId,
      content: mdString.parent, // usage: .parent contains the markdown string
      title,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`Error fetching Notion page ${pageId}:`, error);
    return null;
  }
}

/**
 * Cached function to get all Notion data.
 * TTL: 24 hours (86400 seconds)
 * Tags: ['notion-data']
 */
export const getCachedNotionData = unstable_cache(
  async () => {
    console.log('[Notion] Cache MISS - Fetching fresh data with Official API...');
    const pageIds = getNotionPageIds();

    if (pageIds.length === 0) {
      return {
        combinedContext: 'No Notion pages configured.',
        pages: [],
      };
    }

    const promises = pageIds.map((id) => fetchNotionPage(id));
    // Filter out nulls
    const pages = (await Promise.all(promises)).filter((p): p is NotionContext => p !== null);

    const combinedContext = pages
      .map((p) => `--- Page: ${p.title} ---\n${p.content}`)
      .join('\n\n') + `\n\n[System Info] Data Fetched At: ${new Date().toISOString()}`;

    return {
      combinedContext,
      pages,
      fetchedAt: Date.now(),
    };
  },
  ['notion-data'],
  {
    revalidate: 86400, // Revert to 24 hours
    tags: ['notion-data'],
  }
);

// --- System Configuration Implementation (Notion DB) ---

export interface SystemConfig {
  AI_ENABLED: boolean;
  MODEL_NAME: string;
  SYSTEM_PROMPT?: string;
  HANDOVER_KEYWORDS?: string[];
  AUTO_SWITCH_MINUTES?: number;
  ADMIN_LINE_ID?: string;
}

export async function getSystemConfig(): Promise<SystemConfig | null> {
  if (!NOTION_CONFIG_DB_ID) return null;

  try {
    const response = await (notion.databases as any).query({
      database_id: NOTION_CONFIG_DB_ID,
    });

    const config: any = {};

    response.results.forEach((page: any) => {
      const props = page.properties;
      // Expecting "Key" (Title) and "Value" (RichText/Checkbox)

      let key = "";
      let value: any = "";

      if (props.Key && props.Key.title && props.Key.title.length > 0) {
        key = props.Key.title[0].plain_text;
      }

      if (props.Value && props.Value.rich_text && props.Value.rich_text.length > 0) {
        value = props.Value.rich_text[0].plain_text;
      }

      if (key) {
        // Type conversion
        if (value === 'true') config[key] = true;
        else if (value === 'false') config[key] = false;
        else if (!isNaN(Number(value)) && key === 'AUTO_SWITCH_MINUTES') config[key] = Number(value);
        else config[key] = value;
      }
    });

    // Split keywords if string
    if (typeof config.HANDOVER_KEYWORDS === 'string') {
      config.HANDOVER_KEYWORDS = config.HANDOVER_KEYWORDS.split(',').map((k: string) => k.trim());
    }

    return config as SystemConfig;

  } catch (error) {
    console.error("Error fetching system config:", error);
    return null;
  }
}

export async function updateSystemConfig(key: string, value: string | boolean) {
  if (!NOTION_CONFIG_DB_ID) return;

  // 1. Check if key exists
  const response = await (notion.databases as any).query({
    database_id: NOTION_CONFIG_DB_ID,
    filter: {
      property: 'Key',
      title: {
        equals: key
      }
    }
  });

  const strValue = String(value);

  if (response.results.length > 0) {
    // Update existing
    const pageId = response.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Value: {
          rich_text: [
            { text: { content: strValue } }
          ]
        }
      }
    });
  } else {
    // Create new
    await notion.pages.create({
      parent: { database_id: NOTION_CONFIG_DB_ID },
      properties: {
        Key: {
          title: [
            { text: { content: key } }
          ]
        },
        Value: {
          rich_text: [
            { text: { content: strValue } }
          ]
        }
      }
    });
  }
}

// --- Chat Session Management (Notion DB) ---

export interface ChatSession {
  lineUserId: string;
  mode: 'AI' | 'Human';
  lastActive: string;
  pageId?: string; // Notion Page ID representing this row
}


// --- In-Memory Fallback for Sessions (When DB ID is missing) ---
const localSessionStore = new Map<string, ChatSession>();

export async function getChatSession(lineUserId: string): Promise<ChatSession | null> {
  // 1. Try Notion DB if configured
  if (NOTION_SESSION_DB_ID) {
    try {
      const response = await (notion.databases as any).query({
        database_id: NOTION_SESSION_DB_ID,
        filter: {
          property: 'LineUserID',
          title: { equals: lineUserId }
        }
      });

      if (response.results.length === 0) return null;

      const page: any = response.results[0];
      const props = page.properties;

      return {
        lineUserId,
        mode: props.Mode?.select?.name || 'AI',
        lastActive: props.LastActive?.date?.start || new Date().toISOString(),
        pageId: page.id
      };
    } catch (error) {
      console.error("Error fetching chat session from Notion:", error);
      // Fallback to local if Notion fails? Or just return null?
      // Let's fallback to local to be safe during config issues
    }
  }

  // 2. Fallback to Local Memory
  return localSessionStore.get(lineUserId) || null;
}

export async function getActiveHumanSessions(): Promise<ChatSession[]> {
  const sessions: ChatSession[] = [];

  // 1. Notion
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
      console.error("Error fetching human sessions from Notion:", error);
    }
  }

  // 2. Local
  for (const session of localSessionStore.values()) {
    if (session.mode === 'Human') {
      // Avoid duplicates if both exist (rare case)
      if (!sessions.find(s => s.lineUserId === session.lineUserId)) {
        sessions.push(session);
      }
    }
  }

  return sessions;
}

export async function updateChatSession(lineUserId: string, mode: 'AI' | 'Human') {
  const now = new Date().toISOString();

  // 1. Try Notion
  if (NOTION_SESSION_DB_ID) {
    try {
      const existingSession = await getChatSession(lineUserId); // This might get local one if DB missing, handle carefully

      // We need to check if the *existingSession* actually has a pageId (meaning it came from Notion)
      if (existingSession && existingSession.pageId) {
        await notion.pages.update({
          page_id: existingSession.pageId,
          properties: {
            Mode: { select: { name: mode } },
            LastActive: { date: { start: now } }
          }
        });
        return; // Success update Notion
      } else {
        // Create in Notion
        await notion.pages.create({
          parent: { database_id: NOTION_SESSION_DB_ID },
          properties: {
            LineUserID: { title: [{ text: { content: lineUserId } }] },
            Mode: { select: { name: mode } },
            LastActive: { date: { start: now } }
          }
        });
        return; // Success create Notion
      }
    } catch (e) {
      console.error("Failed to update Notion session DB", e);
      // Continue to update local as backup
    }
  }

  // 2. Update Local Memory
  // Be careful not to overwrite a full object with partial info if we were doing more complex stuff, 
  // but here we just need mode and time.
  localSessionStore.set(lineUserId, {
    lineUserId,
    mode,
    lastActive: now
  });
}

