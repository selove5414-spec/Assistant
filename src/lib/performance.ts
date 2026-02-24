/**
 * 效能監控模組
 * - withTiming()：計時包裝函式，記錄各環節耗時
 * - Ring Buffer：最近 50 筆請求紀錄（In-Memory，同 Instance）
 * - getMetricsSummary()：回傳摘要供儀表板顯示
 */

export interface PerformanceRecord {
    timestamp: number;         // Unix ms
    totalMs: number;           // 整體處理時間
    notionMs: number;          // Notion 讀取耗時
    notionCacheHit: boolean;   // 是否快取命中
    aiMs: number;              // AI 生成耗時
    aiProvider: string;        // 'Gemini' | 'Groq' | 'none'
    aiModel: string;           // 使用的模型名稱
}

const RING_BUFFER_SIZE = 50;
const records: PerformanceRecord[] = [];

/**
 * 計時包裝函式
 * @param fn   要計時的非同步函式
 * @returns    [結果, 耗時 ms]
 */
export async function withTiming<T>(fn: () => Promise<T>): Promise<[T, number]> {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    return [result, elapsed];
}

/**
 * 紀錄一筆效能資料到 Ring Buffer
 */
export function recordPerformance(record: PerformanceRecord): void {
    if (records.length >= RING_BUFFER_SIZE) {
        records.shift(); // 移除最舊的紀錄
    }
    records.push(record);
}

export interface MetricsSummary {
    totalRequests: number;
    cacheHitCount: number;
    cacheMissCount: number;
    cacheHitRate: number;          // 0~1
    avgNotionMs: number;           // 快取未命中時的平均 Notion 讀取時間
    avgAiMs: number;               // 平均 AI 生成時間
    avgTotalMs: number;            // 平均整體請求時間
    recentRecords: PerformanceRecord[];
}

/**
 * 取得效能摘要
 */
export function getMetricsSummary(): MetricsSummary {
    const total = records.length;
    if (total === 0) {
        return {
            totalRequests: 0,
            cacheHitCount: 0,
            cacheMissCount: 0,
            cacheHitRate: 0,
            avgNotionMs: 0,
            avgAiMs: 0,
            avgTotalMs: 0,
            recentRecords: [],
        };
    }

    const cacheHits = records.filter(r => r.notionCacheHit);
    const cacheMisses = records.filter(r => !r.notionCacheHit);

    const avg = (arr: number[]) =>
        arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    return {
        totalRequests: total,
        cacheHitCount: cacheHits.length,
        cacheMissCount: cacheMisses.length,
        cacheHitRate: cacheHits.length / total,
        avgNotionMs: avg(cacheMisses.map(r => r.notionMs)),  // 只計算實際拉取時的耗時
        avgAiMs: avg(records.map(r => r.aiMs)),
        avgTotalMs: avg(records.map(r => r.totalMs)),
        recentRecords: [...records].reverse().slice(0, 20),  // 最近 20 筆，最新在前
    };
}
