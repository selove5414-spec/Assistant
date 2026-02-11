'use server';

import { generateAnswer } from '@/lib/gemini';
import { getCachedNotionData } from '@/lib/notion';

export interface TestBotResult {
    response: string;
    context: string;
    model: string;
    notionPages: string[];
    latency: number;
}

export async function testBotAction(message: string): Promise<TestBotResult> {
    const start = Date.now();

    // 1. Get Context
    const notionData = await getCachedNotionData();

    // 2. Generate Answer
    const aiResponse = await generateAnswer(message, notionData.combinedContext);

    const end = Date.now();

    return {
        response: aiResponse.text,
        context: notionData.combinedContext,
        model: aiResponse.modelUsed,
        notionPages: notionData.pages.map(p => p.title || p.pageId),
        latency: end - start,
    };
}
