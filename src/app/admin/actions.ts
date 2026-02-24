'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { updateChatSession, getCachedNotionData } from '@/lib/notion';

export async function toggleAiModeAction(lineUserId: string, currentMode: 'AI' | 'Human') {
    const newMode = currentMode === 'AI' ? 'Human' : 'AI';
    await updateChatSession(lineUserId, newMode);
    revalidatePath('/admin/agent');
}

/**
 * 手動更新 Notion 知識庫快取
 * 使用 revalidateTag 跨所有 Vercel Instance 清除 Data Cache，
 * 清除後立即重新拉取一次（預熱快取），確保新資料即時生效。
 */
export async function refreshNotionData() {
    console.log('[Admin Action] Manually refreshing Notion data cache...');

    // @ts-ignore - Next.js version specific signature
    revalidateTag('notion-data');

    // 預熱：立即重新拉取 Notion 資料，讓快取恢復最新內容
    try {
        await getCachedNotionData();
        console.log('[Admin Action] Notion cache refreshed and pre-warmed successfully.');
    } catch (error) {
        console.error('[Admin Action] Failed to pre-warm Notion cache:', error);
    }

    revalidatePath('/admin/settings');
}
