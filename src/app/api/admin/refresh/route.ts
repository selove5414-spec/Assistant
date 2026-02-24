import { NextRequest, NextResponse } from 'next/server';
import { fetchNotionDataDirect } from '@/lib/notion';

/**
 * POST /api/admin/refresh
 * 強制更新 Notion 知識庫（繞過快取直接拉取最新資料）
 *
 * 此版本直接使用 fetchNotionDataDirect，它會：
 * 1. 直接呼叫 Notion API 拉取最新資料
 * 2. 更新此 Instance 的 In-Memory 快取（包含最新的 notionLastEditedAt）
 *
 * 對於其他 Serverless Function Instance（如 /api/line）：
 * - 因為每個頁面都記錄了 last_edited_time，下次請求自動偵測 Notion 有更新就會清除快取
 * - 不需要 revalidateTag 或跨 Instance 通訊
 */
export async function POST(req: NextRequest) {
    try {
        const start = Date.now();

        // 直接從 Notion API 拉取最新資料（繞過快取並更新此 Instance 的快取）
        const data = await fetchNotionDataDirect();

        const elapsed = Date.now() - start;

        // 顯示最新的 notionLastEditedAt，供用戶確認資料時間
        const latestEdit = data.pages.length > 0
            ? data.pages
                .map((p: any) => p.notionLastEdited || '')
                .filter(Boolean)
                .sort()
                .reverse()[0]
            : null;

        console.log(`[Admin Refresh] Notion data refreshed in ${elapsed}ms. Pages: ${data.pages.length}`);

        return NextResponse.json({
            success: true,
            pageCount: data.pages.length,
            pageTitles: data.pages.map((p: any) => p.title),
            notionLastEdited: latestEdit, // Notion 頁面的實際最後修改時間
            fetchedAt: new Date(data.fetchedAt).toISOString(),
            elapsedMs: elapsed,
        });

    } catch (error: any) {
        console.error('[Admin Refresh] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
