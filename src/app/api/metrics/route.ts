import { NextResponse } from 'next/server';
import { getMetricsSummary } from '@/lib/performance';

/**
 * GET /api/metrics
 * 回傳效能摘要資料，供管理後台儀表板使用
 */
export async function GET() {
    const summary = getMetricsSummary();
    return NextResponse.json(summary);
}
