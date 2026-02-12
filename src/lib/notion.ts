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
      .join('\n\n');

    return {
      combinedContext,
      pages,
      fetchedAt: Date.now(),
    };
  },
  ['notion-data'],
  {
    revalidate: 86400,
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

export async function getChatSession(lineUserId: string): Promise<ChatSession | null> {
  if (!NOTION_SESSION_DB_ID) return null;

  try {
    const response = await (notion.databases as any).query({
      database_id: NOTION_SESSION_DB_ID,
      filter: {
        property: 'LineUserID',
        title: {
          equals: lineUserId
        }
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
    console.error("Error fetching chat session:", error);
    return null;
  }
}

export async function getActiveHumanSessions(): Promise<ChatSession[]> {
  if (!NOTION_SESSION_DB_ID) return [];

  try {
    const response = await (notion.databases as any).query({
      database_id: NOTION_SESSION_DB_ID,
      filter: {
        property: 'Mode',
        select: {
          equals: 'Human'
        }
      }
    });

    return response.results.map((page: any) => ({
      lineUserId: page.properties.LineUserID.title[0]?.plain_text || 'Unknown',
      mode: 'Human',
      lastActive: page.properties.LastActive?.date?.start || new Date().toISOString(),
      pageId: page.id
    }));

  } catch (error) {
    console.error("Error fetching human sessions:", error);
    return [];
  }
}

export async function updateChatSession(lineUserId: string, mode: 'AI' | 'Human') {
  if (!NOTION_SESSION_DB_ID) return;

  const existingSession = await getChatSession(lineUserId);

  if (existingSession && existingSession.pageId) {
    // Update
    await notion.pages.update({
      page_id: existingSession.pageId,
      properties: {
        Mode: {
          select: { name: mode }
        },
        LastActive: {
          date: { start: new Date().toISOString() }
        }
      }
    });
  } else {
    // Create
    await notion.pages.create({
      parent: { database_id: NOTION_SESSION_DB_ID },
      properties: {
        LineUserID: {
          title: [
            { text: { content: lineUserId } }
          ]
        },
        Mode: {
          select: { name: mode }
        },
        LastActive: {
          date: { start: new Date().toISOString() }
        }
      }
    });
  }
}
