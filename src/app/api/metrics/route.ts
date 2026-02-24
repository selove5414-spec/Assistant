import { NextResponse } from 'next/server';
import { getCachedNotionData } from '@/lib/notion';
import { withTiming, getMetricsSummary } from '@/lib/performance';

/**
 * GET /api/metrics
 * 回傳效能資料：
 * - realtime: 此次請求直接測量的 Notion 讀取時間（確保一定有資料）
 * - historical: Ring Buffer 中的歷史請求紀錄（Serverless 多 Instance 下可能為空）
 */

// 確保每次請求都重新執行，不被 Next.js 靜態快取
export const dynamic = 'force-dynamic';

export async function GET() {
    const start = Date.now();

    // 即時測量：直接呼叫 getCachedNotionData 並計時
    const [notionData, notionMs] = await withTiming(() => getCachedNotionData());

    // 判斷快取命中（fetchedAt 超過 5 秒前表示從快取讀取，否則是剛拉取的）
    const isFromCache = (Date.now() - (notionData.fetchedAt || 0)) > 5000;
    const totalMs = Date.now() - start;

    // 歷史 Ring Buffer 資料（同一 Instance 才有，Serverless 多 Instance 下可能為空）
    const historical = getMetricsSummary();

    return NextResponse.json({
        // 即時測量（永遠有資料）
        realtime: {
            notionMs,
            isFromCache,
            totalMs,
            pageCount: notionData.pages.length,
            pageTitles: notionData.pages.map((p: any) => p.title),
            lastFetched: new Date(notionData.fetchedAt || Date.now()).toISOString(),
        },
        // 歷史 LINE 請求記錄（多 Instance 下可能為空）
        historical,
    });
}
