import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });
    }

    const candidates = [
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-2.5-flash',
        'gemini-pro-latest'
    ];

    const results: any = {};

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Test each candidate
        for (const modelName of candidates) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                // Try a very simple generation with 1 token output to save quota/time
                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
                    generationConfig: { maxOutputTokens: 1 }
                });
                const response = await result.response;
                results[modelName] = { status: 'success', output: response.text() };
            } catch (e: any) {
                results[modelName] = { status: 'error', error: e.message };
            }
        }

        return NextResponse.json({
            summary: "Active Model Test Results",
            results
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
