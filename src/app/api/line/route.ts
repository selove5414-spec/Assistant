import { NextRequest, NextResponse } from 'next/server';
import { validateSignature, WebhookEvent } from '@line/bot-sdk';
import { lineClient, lineConfig } from '@/lib/line';
import { getCachedNotionData } from '@/lib/notion';
import { generateAnswer } from '@/lib/gemini';

export async function POST(req: NextRequest) {
    try {
        const body = await req.text();
        const signature = req.headers.get('x-line-signature') as string;

        if (!lineConfig.channelSecret) {
            console.error('LINE_CHANNEL_SECRET is not set');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!validateSignature(body, lineConfig.channelSecret, signature)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const events: WebhookEvent[] = JSON.parse(body).events;

        // Process events in parallel
        await Promise.all(events.map(async (event) => {
            if (event.type !== 'message' || event.message.type !== 'text') {
                return;
            }

            const userId = event.source.userId;
            const userMessage = event.message.text;
            const replyToken = event.replyToken;

            // 1. Retrieve Cached Context from Notion
            // This will use the in-memory cache if available (TTL 24h)
            // "unstable_cache" handles the caching logic.
            const notionData = await getCachedNotionData();
            const context = notionData.combinedContext;

            // 2. Generate Answer using Gemini 2.5 Flash
            // Pass the retrieved context + user message
            const aiResponse = await generateAnswer(userMessage, context);

            // 3. Reply to LINE
            await lineClient.replyMessage({
                replyToken: replyToken,
                messages: [
                    {
                        type: 'text',
                        text: aiResponse.text,
                    },
                ],
            });

            console.log(`[LINE] Replied to ${userId}. Model: ${aiResponse.modelUsed}`);
        }));

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('[LINE Webhook Error]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
