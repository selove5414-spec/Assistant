import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateConfigAction, refreshNotionData } from "@/app/admin/actions"
import { getSystemConfig } from "@/lib/notion"
import RefreshButton from "./refresh-button"

export default async function SettingsPage() {
    const config = await getSystemConfig();

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">系統設定</h2>
                <p className="text-muted-foreground">調整 AI 模型參數與系統指令</p>
            </div>

            <form action={updateConfigAction} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>AI 核心設定</CardTitle>
                        <CardDescription>
                            控制 AI 的行為模式與回應策略
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
                            <div className="space-y-0.5">
                                <Label htmlFor="ai_enabled" className="text-base">啟用 AI 自動回覆</Label>
                                <p className="text-sm text-muted-foreground">開啟後，系統將自動回應收到的 LINE 訊息</p>
                            </div>
                            <Switch name="ai_enabled" id="ai_enabled" defaultChecked={config?.AI_ENABLED ?? true} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="model_name">模型名稱 (Model Name)</Label>
                            <Input id="model_name" name="model_name" defaultValue={config?.MODEL_NAME || "gemini-2.5-flash"} placeholder="gemini-2.5-flash" />
                            <p className="text-xs text-muted-foreground">目前支援: gemini-2.5-flash, gemini-1.5-pro</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>AI 指令與知識庫</CardTitle>
                        <CardDescription>
                            定義 AI 的角色與回應風格
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="system_prompt">系統指令 (System Prompt)</Label>
                            <Textarea
                                id="system_prompt"
                                name="system_prompt"
                                className="min-h-[200px]"
                                defaultValue={config?.SYSTEM_PROMPT ||
                                    `# Role
你是一位專業、親切且富有耐心的導師小助手，代表「海青工商導師室」。你的目標是協助老師解決疑問，提升行政效率。

# Tone & Style
- 語氣：禮貌、專業、溫暖。
- 格式：使用條列式重點，讓資訊易於閱讀。
- 語言：繁體中文 (台灣用語)。`}
                            />
                        </div>
                    </CardContent>
                </Card>



                <Card>
                    <CardHeader>
                        <CardTitle>真人接管設定 (Handover)</CardTitle>
                        <CardDescription>
                            設定觸發真人客服的條件
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="handover_keywords">觸發關鍵字 (以逗號分隔)</Label>
                            <Input
                                id="handover_keywords"
                                name="handover_keywords"
                                defaultValue={config?.HANDOVER_KEYWORDS?.join(', ') || "轉真人, 人工客服, 找老師"}
                                placeholder="轉真人, 人工客服, 找老師"
                            />
                            <p className="text-xs text-muted-foreground">當使用者輸入包含這些關鍵字時，系統將暫停 AI 並通知管理員。</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="auto_switch_minutes">自動切回 AI 模式 (分鐘)</Label>
                                <Input
                                    type="number"
                                    id="auto_switch_minutes"
                                    name="auto_switch_minutes"
                                    defaultValue={config?.AUTO_SWITCH_MINUTES || "1"}
                                    placeholder="1"
                                />
                                <p className="text-xs text-muted-foreground">真人模式閒置超過此時間後，自動切回 AI (測試預設: 1分鐘)。</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin_line_id">管理員 LINE ID (通知對象)</Label>
                                <Input
                                    id="admin_line_id"
                                    name="admin_line_id"
                                    defaultValue={config?.ADMIN_LINE_ID || ""}
                                    placeholder="Uxxxxxxxx..."
                                />
                                <p className="text-xs text-muted-foreground">請填寫您的 LINE User ID 以接收轉真人通知。</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" size="lg">儲存變更</Button>
                </div>
            </form>

            <Card>
                <CardHeader>
                    <CardTitle>知識庫維護</CardTitle>
                    <CardDescription>
                        管理 Notion 資料同步狀態
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
                        <div className="space-y-0.5">
                            <Label className="text-base">手動更新知識庫</Label>
                            <p className="text-sm text-muted-foreground">立即清除快取，重新抓取 Notion 最新資料 (預設每 24 小時自動更新)</p>
                        </div>
                        <RefreshButton />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
