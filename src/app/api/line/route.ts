import { NextRequest, NextResponse } from 'next/server';
import { validateSignature, WebhookEvent } from '@line/bot-sdk';
import { lineClient, lineConfig } from '@/lib/line';
import { getCachedNotionData, getSystemConfig, getChatSession, updateChatSession } from '@/lib/notion';
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

            if (event.type !== 'message' || event.message.type !== 'text') {
                return;
            }

            const userId = event.source.userId;
            if (!userId) return;

            const userMessage = event.message.text;
            const replyToken = event.replyToken;

            // --- 0. Check System Config & Session Mode ---
            // Fetch config and session in parallel to save time
            const [systemConfig, chatSession] = await Promise.all([
                getSystemConfig(),
                getChatSession(userId)
            ]);

            // Default config if fetch fails
            const isAiEnabled = systemConfig?.AI_ENABLED ?? true;
            const handoverKeywords = systemConfig?.HANDOVER_KEYWORDS ?? ['轉真人', '人工客服'];

            // 1. Check AI Switch
            if (!isAiEnabled) {
                console.log(`[LINE] AI is disabled globally. Ignoring message from ${userId}.`);
                return;
            }

            // 2. Check Chat Mode
            if (chatSession && chatSession.mode === 'Human') {
                console.log(`[LINE] User ${userId} is in Human mode.`);

                // Check Auto Switch Timeout
                const lastActive = new Date(chatSession.lastActive).getTime();
                const now = Date.now();
                const timeoutMinutes = systemConfig?.AUTO_SWITCH_MINUTES || 1;
                const timeoutMs = timeoutMinutes * 60 * 1000;

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

            // 3. Check Handover Keywords
            // If user says "轉真人", switch to Human mode
            const hitKeyword = handoverKeywords.some(keyword => userMessage.includes(keyword));
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

                // Notify Admin
                const adminLineId = systemConfig?.ADMIN_LINE_ID;
                if (adminLineId) {
                    await lineClient.pushMessage({
                        to: adminLineId,
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

            // Pass system prompt if configured
            const systemPrompt = systemConfig?.SYSTEM_PROMPT;
            // Note: generateAnswer function might need update to accept system prompt if we want to dynamic it. 
            // For now, we will rely on its internal prompt or update it later. 
            // Let's assume generateAnswer uses default if not passed, but we need to pass it?
            // Checking generateAnswer signature... it currently takes (question, context).
            // We can append custom system prompt to context or update generateAnswer.
            // For MVP, let's prepend system prompt to context string if it exists.

            let finalContext = context;
            if (systemPrompt) {
                finalContext = `[System Instruction]\n${systemConfig.SYSTEM_PROMPT}\n\n${context}`;
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

            console.log(`[LINE] Replied to ${userId}. Model: ${aiResponse.modelUsed}`);
        }));

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('[LINE Webhook Error]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
