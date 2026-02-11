'use client';

import { useState } from 'react';
import { testBotAction, TestBotResult } from './actions';
import { Send, Database, Cpu, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export default function TestBotPage() {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TestBotResult | null>(null);
    const [showContext, setShowContext] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        setLoading(true);
        try {
            const data = await testBotAction(input);
            setResult(data);
        } catch (error) {
            console.error(error);
            alert('Error testing bot');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/20 blur-[120px] rounded-full" />
            </div>

            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-emerald-400">
                        LINE Bot Debugger
                    </h1>
                    <p className="text-slate-400">Gemini 2.5 Flash & Notion RAG Integration</p>
                </div>

                {/* Main Interface */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left: Input & Controls */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Test Message
                                    </label>
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Ask something..."
                                        className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all",
                                        loading
                                            ? "bg-slate-700/50 cursor-not-allowed text-slate-400"
                                            : "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                                    )}
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Send size={18} />
                                            Send Test
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Status Panel (Mock) */}
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400 flex items-center gap-2">
                                    <Database size={14} /> Notion Cache
                                </span>
                                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs">
                                    Active (TTL 24h)
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400 flex items-center gap-2">
                                    <Cpu size={14} /> Model
                                </span>
                                <span className="text-indigo-300 text-xs font-mono">
                                    gemini-2.5-flash
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Output */}
                    <div className="lg:col-span-2 space-y-6">
                        {result ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                                {/* AI Response Card */}
                                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-emerald-500" />

                                    <div className="flex justify-between items-start mb-4">
                                        <h2 className="text-lg font-semibold text-slate-200">AI Response</h2>
                                        <div className="flex items-center gap-3 text-xs text-slate-400 bg-black/20 px-3 py-1 rounded-full">
                                            <span className="flex items-center gap-1">
                                                <Cpu size={12} /> {result.model}
                                            </span>
                                            <span className="w-px h-3 bg-white/10" />
                                            <span className="flex items-center gap-1 text-emerald-400">
                                                <Clock size={12} /> {result.latency}ms
                                            </span>
                                        </div>
                                    </div>

                                    <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap">
                                        {result.response}
                                    </div>
                                </div>

                                {/* Context Accordion */}
                                <div className="rounded-xl border border-white/5 bg-black/10 overflow-hidden">
                                    <button
                                        onClick={() => setShowContext(!showContext)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                            <Database size={16} />
                                            Used Context ({result.notionPages.length} Pages)
                                        </span>
                                        {showContext ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>

                                    {showContext && (
                                        <div className="p-4 border-t border-white/5 bg-black/20 text-xs font-mono text-slate-500 overflow-x-auto">
                                            <pre className="whitespace-pre-wrap break-words">
                                                {result.context.slice(0, 2000)}
                                                {result.context.length > 2000 && `\n... (+${result.context.length - 2000} chars truncated)`}
                                            </pre>
                                        </div>
                                    )}
                                </div>

                            </div>
                        ) : (
                            // Empty State
                            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                                <div className="p-4 bg-white/5 rounded-full mb-4">
                                    <Cpu size={32} className="opacity-50" />
                                </div>
                                <p>Waiting for input...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
