import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';
import { getCachedNotionData } from '@/lib/notion';

export const dynamic = 'force-dynamic';

export async function GET() {
    const results: any = {
        notion: { status: 'pending', length: 0 },
        gemini: { status: 'pending', response: null, error: null },
        groq: { status: 'pending', response: null, error: null },
    };

    try {
        // 1. Fetch Notion Data
        const notionData = await getCachedNotionData();
        const context = notionData.combinedContext;
        results.notion = { status: 'success', length: context.length, pageCount: notionData.pages.length };

        const prompt = "請用繁體中文簡短總結這段 Notion 資料的內容 (50字以內)。";
        const fullPrompt = `Context:\n${context}\n\nQuestion: ${prompt}`;

        // 2. Test Gemini
        try {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("GOOGLE_API_KEY not set");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash' });

            const start = Date.now();
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            results.gemini = {
                status: 'success',
                response: text,
                latency: Date.now() - start,
                model: process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash'
            };
        } catch (e: any) {
            results.gemini = { status: 'error', error: e.message };
        }

        // 3. Test Groq
        try {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) throw new Error("GROQ_API_KEY not set");

            const groq = new Groq({ apiKey });
            const modelName = process.env.GROQ_MODEL_NAME || 'gemma2-9b-it';

            const start = Date.now();
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: fullPrompt }
                ],
                model: modelName,
            });

            results.groq = {
                status: 'success',
                response: completion.choices[0]?.message?.content,
                latency: Date.now() - start,
                model: modelName
            };
        } catch (e: any) {
            results.groq = { status: 'error', error: e.message };
        }

        return NextResponse.json(results);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
