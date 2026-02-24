'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function RefreshButton() {
    const [isPending, setIsPending] = useState(false);
    const [result, setResult] = useState<{
        success: boolean;
        pageCount?: number;
        pageTitles?: string[];
        elapsedMs?: number;
        error?: string;
        time?: string;
    } | null>(null);

    const handleRefresh = async () => {
        setIsPending(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/refresh', { method: 'POST' });
            const data = await res.json();
            setResult({
                ...data,
                time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
            });
        } catch (e: any) {
            setResult({ success: false, error: e.message, time: new Date().toLocaleTimeString('zh-TW', { hour12: false }) });
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="space-y-3">
            <Button
                onClick={handleRefresh}
                disabled={isPending}
                variant="outline"
            >
                {isPending ? '更新中...' : '立即更新'}
            </Button>

            {result && (
                <div className={`text-sm rounded-lg p-3 border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {result.success ? (
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge className="bg-green-500 text-white">✓ 更新成功</Badge>
                                <span className="text-xs text-muted-foreground">
                                    {result.time}（{result.elapsedMs}ms）
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                已載入 {result.pageCount} 個頁面：
                                {result.pageTitles?.map((t, i) => (
                                    <span key={i} className="ml-1 font-medium text-foreground">「{t}」</span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-red-700">
                            ✗ 更新失敗：{result.error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
