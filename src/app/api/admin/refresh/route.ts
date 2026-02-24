import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getCachedNotionData } from '@/lib/notion';

/**
 * POST /api/admin/refresh
 * 強制更新 Notion 知識庫快取
 *
 * 執行順序（非常重要）：
 * 1. revalidateTag('notion-data') — 在 Route Handler 中同步清除 Vercel Data Cache
 * 2. 等待 500ms — 確保 Data Cache 清除已傳播
 * 3. getCachedNotionData() — 透過 unstable_cache 重新拉取並「存回」Data Cache
 *    ★ 必須用 getCachedNotionData（而非 fetchNotionDataDirect），
 *       這樣新資料才會被寫入 Vercel Data Cache，後續 LINE Bot 才能從快取命中。
 */
export async function POST(req: NextRequest) {
    try {
        const start = Date.now();

        // 1. 清除 Vercel Data Cache（Route Handler 中同步生效）
        // @ts-ignore - Next.js version specific signature
        revalidateTag('notion-data');

        // 2. 等待 500ms，確保 Data Cache 清除已完全生效
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. 透過 unstable_cache 接口重新拉取 Notion 資料
        //    → 新資料會被寫入 Vercel Data Cache，LINE Bot 後續請求可命中
        const data = await getCachedNotionData();

        const elapsed = Date.now() - start;

        console.log(`[Admin Refresh] Notion data refreshed in ${elapsed}ms. Pages: ${data.pages.length}`);

        return NextResponse.json({
            success: true,
            pageCount: data.pages.length,
            pageTitles: data.pages.map((p: any) => p.title),
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
