import { NextRequest, NextResponse } from 'next/server';
import { validateSignature, WebhookEvent } from '@line/bot-sdk';
import { lineClient, lineConfig } from '@/lib/line';
import { getCachedNotionData, getChatSession, updateChatSession } from '@/lib/notion';
import { generateAnswer } from '@/lib/ai';

// --- Configuration from Env ---
const AI_ENABLED = process.env.AI_ENABLED !== 'false'; // Default true
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';
const HANDOVER_KEYWORDS = (process.env.HANDOVER_KEYWORDS || '轉真人,人工客服').split(',').map(k => k.trim());
const AUTO_SWITCH_MINUTES = parseInt(process.env.AUTO_SWITCH_MINUTES || '5', 10);
const ADMIN_LINE_ID = process.env.ADMIN_LINE_ID || '';

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
            if (!userId) return;

            const userMessage = event.message.text;
            const replyToken = event.replyToken;

            // 0a. Handle "ID" command
            if (userMessage.toLowerCase() === 'id' || userMessage.toLowerCase() === 'myid') {
                await lineClient.replyMessage({
                    replyToken: replyToken,
                    messages: [{ type: 'text', text: `Your User ID: ${userId}` }]
                });
                return;
            }

            // 0b. Handle "Debug" command (Check Cache Status)
            if (userMessage.toLowerCase() === 'debug' || userMessage.toLowerCase() === 'status') {
                const notionData = await getCachedNotionData();
                const fetchedAt = notionData.fetchedAt || Date.now();
                const fetchedTime = new Date(fetchedAt).toLocaleString();
                const pageTitles = notionData.pages.map(p => `• ${p.title}`).join('\n');

                await lineClient.replyMessage({
                    replyToken: replyToken,
                    messages: [{
                        type: 'text',
                        text: `[System Debug]\n\n🕒 Cache Time:\n${fetchedTime}\n\n📚 Loaded Pages:\n${pageTitles || '(No pages loaded)'}`
                    }]
                });
                return;
            }

            // --- 0. Check Session Mode ---
            // Fetch session
            const chatSession = await getChatSession(userId);

            // 1. Check AI Switch (Env)
            if (!AI_ENABLED) {
                console.log(`[LINE] AI is disabled globally. Ignoring message from ${userId}.`);
                return;
            }

            // 2. Check Chat Mode
            if (chatSession && chatSession.mode === 'Human') {
                console.log(`[LINE] User ${userId} is in Human mode.`);

                // Check Auto Switch Timeout
                const lastActive = new Date(chatSession.lastActive).getTime();
                const now = Date.now();
                const timeoutMs = AUTO_SWITCH_MINUTES * 60 * 1000;

                if (now - lastActive > timeoutMs) {
                    console.log(`[LINE] User ${userId} session timed out. Switching back to AI.`);
                    await updateChatSession(userId, 'AI');
                    // Proceed to AI flow...
                } else {
                    // Update last active time and ignore (waiting for admin)
                    await updateChatSession(userId, 'Human');
                    return;
                }
            }

            // 3. Check Handover Keywords (Env)
            // If user says "轉真人", switch to Human mode
            const hitKeyword = HANDOVER_KEYWORDS.some(keyword => userMessage.includes(keyword));
            if (hitKeyword) {
                console.log(`[LINE] User ${userId} triggered handover with message: ${userMessage}`);
                await updateChatSession(userId, 'Human');

                await lineClient.replyMessage({
                    replyToken: replyToken,
                    messages: [{
                        type: 'text',
                        text: '已為您轉接專人客服，請稍候，我們將盡快回覆您。'
                    }]
                });

                // Notify Admin (Env)
                if (ADMIN_LINE_ID) {
                    await lineClient.pushMessage({
                        to: ADMIN_LINE_ID,
                        messages: [{
                            type: 'text',
                            text: `[系統通知] 用戶觸發真人客服請求！\n\n用戶ID: ${userId}\n訊息內容: ${userMessage}`
                        }]
                    }).catch(e => console.error("Failed to notify admin", e));
                }

                return;
            }

            // --- AI Processing (Normal Flow) ---

            // 4. Update Session (Keep/Set as AI mode)
            // Fire and forget update (don't await to block reply)
            updateChatSession(userId, 'AI').catch(err => console.error("Failed to update session", err));

            // 5. Retrieve Context & Generate Answer
            const notionData = await getCachedNotionData();
            const context = notionData.combinedContext;

            let finalContext = context;
            if (SYSTEM_PROMPT) {
                finalContext = `[System Instruction]\n${SYSTEM_PROMPT}\n\n${context}`;
            }

            const aiResponse = await generateAnswer(userMessage, finalContext);

            // 6. Reply to LINE
            try {
                await lineClient.replyMessage({
                    replyToken: replyToken,
                    messages: [
                        {
                            type: 'text',
                            text: aiResponse.text,
                        },
                    ],
                });
            } catch (replyError: any) {
                console.error(`[LINE Reply Error] Failed to reply to ${userId}: ${replyError.message}`);
            }

            console.log(`[LINE] Replied to ${userId}. Model: ${aiResponse.modelUsed} (${aiResponse.provider})`);
        }));

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('[LINE Webhook Error]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

