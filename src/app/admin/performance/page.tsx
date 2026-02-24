'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RealtimeMetrics {
    notionMs: number;
    isFromCache: boolean;
    totalMs: number;
    pageCount: number;
    pageTitles: string[];
    lastFetched: string;
}

interface PerformanceRecord {
    timestamp: number;
    totalMs: number;
    notionMs: number;
    notionCacheHit: boolean;
    aiMs: number;
    aiProvider: string;
    aiModel: string;
}

interface MetricsResponse {
    realtime: RealtimeMetrics;
    historical: {
        totalRequests: number;
        cacheHitCount: number;
        cacheMissCount: number;
        cacheHitRate: number;
        avgNotionMs: number;
        avgAiMs: number;
        avgTotalMs: number;
        recentRecords: PerformanceRecord[];
    };
}

function formatMs(ms: number) {
    if (ms === 0 || ms === undefined) return '—';
    return `${ms.toLocaleString()} ms`;
}

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false });
}

export default function PerformancePage() {
    const [data, setData] = useState<MetricsResponse | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/metrics');
            if (res.ok) {
                const json = await res.json();
                setData(json);
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
        const timer = setInterval(fetchMetrics, 30000);
        return () => clearInterval(timer);
    }, [fetchMetrics]);

    const rt = data?.realtime;
    const hist = data?.historical;
    const hitRate = hist ? Math.round(hist.cacheHitRate * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">執行效率監控</h2>
                    <p className="text-muted-foreground">
                        Notion 讀取、快取狀態、AI 回應即時分析
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

            {/* 即時測量（每次刷新都有資料）*/}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    即時測量
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Notion 讀取時間</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{formatMs(rt?.notionMs ?? 0)}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {rt ? (
                                    <Badge variant={rt.isFromCache ? 'default' : 'secondary'}
                                        className={rt.isFromCache ? 'bg-green-500 text-white text-xs' : 'text-xs'}>
                                        {rt.isFromCache ? '✓ 快取命中' : '↓ 直接拉取'}
                                    </Badge>
                                ) : '—'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">此次總耗時</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{formatMs(rt?.totalMs ?? 0)}</div>
                            <p className="text-xs text-muted-foreground mt-1">含讀取/解析時間</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">知識庫頁數</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{rt?.pageCount ?? '—'}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {rt?.pageTitles?.slice(0, 2).join('、') ?? '—'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">資料更新時間</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-base font-semibold truncate">
                                {rt?.lastFetched
                                    ? new Date(rt.lastFetched).toLocaleTimeString('zh-TW', { hour12: false })
                                    : '—'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {rt?.lastFetched
                                    ? new Date(rt.lastFetched).toLocaleDateString('zh-TW')
                                    : '—'}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* LINE 請求歷史（同一 Instance 才有） */}
            <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    LINE 請求紀錄
                    <span className="ml-2 font-normal normal-case text-xs">（同一 Serverless Instance 才顯示）</span>
                </h3>

                {hist && hist.totalRequests > 0 ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-3 mb-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">總請求數</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">{hist.totalRequests}</div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        命中 {hist.cacheHitCount} / 未命中 {hist.cacheMissCount}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">快取命中率</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">{hitRate}%</div>
                                    <p className="text-xs text-muted-foreground mt-1">平均 Notion 耗時：{formatMs(hist.avgNotionMs)}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">平均 AI 回應</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">{formatMs(hist.avgAiMs)}</div>
                                    <p className="text-xs text-muted-foreground mt-1">平均總耗時：{formatMs(hist.avgTotalMs)}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>最近請求紀錄</CardTitle>
                            </CardHeader>
                            <CardContent>
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
                                            {hist.recentRecords.map((r, i) => (
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
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <Card>
                        <CardContent className="py-8 text-center text-muted-foreground text-sm">
                            此 Serverless Instance 尚未處理 LINE 訊息。<br />
                            有 LINE 訊息進來後，若由同一個 Instance 處理才會顯示。
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
