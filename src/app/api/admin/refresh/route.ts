import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { fetchNotionDataDirect } from '@/lib/notion';

/**
 * POST /api/admin/refresh
 * 強制更新 Notion 知識庫快取
 *
 * 使用 Route Handler（而非 Server Action）的原因：
 * - Server Action 的 revalidateTag 是 deferred（Response 送出後才生效）
 * - Route Handler 的 revalidateTag 在 Response 前即同步生效
 * - 因此可以確保「清除 → 重新拉取 → 回傳最新資料」的正確順序
 */
export async function POST(req: NextRequest) {
    try {
        const start = Date.now();

        // 1. 清除 Vercel Data Cache（在 Route Handler 中同步生效）
        // @ts-ignore - Next.js version specific signature
        revalidateTag('notion-data');

        // 2. 直接從 Notion API 拉取最新資料（繞過快取）
        const data = await fetchNotionDataDirect();

        const elapsed = Date.now() - start;

        console.log(`[Admin Refresh] Notion data refreshed in ${elapsed}ms. Pages: ${data.pages.length}`);

        return NextResponse.json({
            success: true,
            pageCount: data.pages.length,
            pageTitles: data.pages.map(p => p.title),
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
