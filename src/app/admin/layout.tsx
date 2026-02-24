import Link from "next/link"
import { LayoutDashboard, Settings, MessageSquare, Bot, Menu, BarChart2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full">
                <AppSidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50">
                    <header className="flex h-16 items-center gap-4 border-b bg-white px-6">
                        <SidebarTrigger />
                        <h1 className="text-lg font-semibold">AI 客服後台管理</h1>
                    </header>
                    <div className="p-6">
                        {children}
                    </div>
                </main>
            </div>
        </SidebarProvider>
    )
}

function AppSidebar() {
    return (
        <Sidebar>
            <SidebarHeader className="p-4">
                <h2 className="text-xl font-bold px-2">導師小助 Admin</h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarMenu className="px-2">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/admin/dashboard">
                                <LayoutDashboard />
                                <span>系統主控台</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/admin/settings">
                                <Settings />
                                <span>系統設定</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/admin/agent">
                                <Bot />
                                <span>真人客服</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/admin/performance">
                                <BarChart2 />
                                <span>執行效率</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarContent>
        </Sidebar>
    )
}
