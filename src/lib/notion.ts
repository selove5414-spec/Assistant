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
