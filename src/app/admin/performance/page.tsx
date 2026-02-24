'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PerformanceRecord {
    timestamp: number;
    totalMs: number;
    notionMs: number;
    notionCacheHit: boolean;
    aiMs: number;
    aiProvider: string;
    aiModel: string;
}

interface MetricsSummary {
    totalRequests: number;
    cacheHitCount: number;
    cacheMissCount: number;
    cacheHitRate: number;
    avgNotionMs: number;
    avgAiMs: number;
    avgTotalMs: number;
    recentRecords: PerformanceRecord[];
}

function formatMs(ms: number) {
    if (ms === 0) return '—';
    return `${ms.toLocaleString()} ms`;
}

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false });
}

export default function PerformancePage() {
    const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/metrics');
            if (res.ok) {
                const data = await res.json();
                setMetrics(data);
                setLastUpdated(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
            }
        } catch (e) {
            console.error('Failed to fetch metrics', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        const timer = setInterval(fetchMetrics, 30000); // 每 30 秒自動刷新
        return () => clearInterval(timer);
    }, [fetchMetrics]);

    const hitRate = metrics ? Math.round(metrics.cacheHitRate * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">執行效率監控</h2>
                    <p className="text-muted-foreground">
                        Notion 讀取、AI 回應、快取命中率即時分析
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-xs text-muted-foreground">最後更新：{lastUpdated}</span>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
                        {loading ? '更新中…' : '立即刷新'}
                    </Button>
                </div>
            </div>

            {/* 摘要卡片 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">總請求數</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{metrics?.totalRequests ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">本 Instance 啟動後累計</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">快取命中率</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{metrics ? `${hitRate}%` : '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            命中 {metrics?.cacheHitCount ?? 0} / 未命中 {metrics?.cacheMissCount ?? 0}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">平均 Notion 讀取</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{formatMs(metrics?.avgNotionMs ?? 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">快取未命中時的平均時間</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">平均 AI 回應</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{formatMs(metrics?.avgAiMs ?? 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            平均總耗時：{formatMs(metrics?.avgTotalMs ?? 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* 最近請求紀錄 */}
            <Card>
                <CardHeader>
                    <CardTitle>最近請求紀錄</CardTitle>
                </CardHeader>
                <CardContent>
                    {!metrics || metrics.recentRecords.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            尚無資料。有 LINE 訊息進來後才會顯示。
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left py-2 pr-4 font-medium">時間</th>
                                        <th className="text-right py-2 pr-4 font-medium">Notion</th>
                                        <th className="text-center py-2 pr-4 font-medium">快取</th>
                                        <th className="text-right py-2 pr-4 font-medium">AI</th>
                                        <th className="text-right py-2 pr-4 font-medium">總計</th>
                                        <th className="text-left py-2 font-medium">模型</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metrics.recentRecords.map((r, i) => (
                                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                            <td className="py-2 pr-4 font-mono text-xs">{formatTime(r.timestamp)}</td>
                                            <td className="py-2 pr-4 text-right font-mono">{formatMs(r.notionMs)}</td>
                                            <td className="py-2 pr-4 text-center">
                                                <Badge variant={r.notionCacheHit ? 'default' : 'secondary'}
                                                    className={r.notionCacheHit ? 'bg-green-500 text-white' : ''}>
                                                    {r.notionCacheHit ? 'HIT' : 'MISS'}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4 text-right font-mono">{formatMs(r.aiMs)}</td>
                                            <td className="py-2 pr-4 text-right font-mono font-semibold">{formatMs(r.totalMs)}</td>
                                            <td className="py-2 text-xs text-muted-foreground">{r.aiModel}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
