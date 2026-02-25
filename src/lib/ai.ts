import { GoogleGenerativeAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

// --- Configuration ---
// 支援多組 GOOGLE_API_KEY，以逗號分隔
const GOOGLE_API_KEYS = (process.env.GOOGLE_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash';
const SCHOOL_NAME = process.env.SCHOOL_NAME || '導師室';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL_NAME = process.env.GROQ_MODEL_NAME || 'gemma2-9b-it';

// Default temperature (can be overriden by env)
// 0.0 is best for consistent, factual answers.
const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || '0.0');

// --- Clients ---
const groq = new Groq({ apiKey: GROQ_API_KEY });

// 追蹤目前使用的 Gemini Key 索引 (簡易的 Round-robin 或直接從 0 開始嘗試)
let currentGeminiKeyIndex = 0;

export interface AiResponse {
    text: string;
    modelUsed: string;
    provider: 'Gemini' | 'Groq';
}

/**
 * Generates an answer using the dual-model architecture.
 * Priority: 
 * 1. Gemini (Primary)
 * 2. Groq (Fallback)
 */
export async function generateAnswer(query: string, context: string): Promise<AiResponse> {
    const systemPrompt = `
你是${SCHOOL_NAME}的 AI 小助手，專門回答學生與家長的問題。
你的知識來源是以下 Notion 頁面內容：

<NotionContext>
${context}
</NotionContext>

回覆格式規則（非常重要）：
- 因為你的回覆會顯示在 LINE 聊天室，請【絕對不要】使用任何 Markdown 語法
- 禁止使用：** ** (粗體)、# (標題)、* 或 - (條列符號)、_ _ (斜體)
- 改用 emoji 來區分段落，例如：📌 📋 🗓️ ✅ ➡️
- 條列項目改用「・」或數字「1.」來表示
- 段落之間空一行

回答原則：
1. 優先根據 Notion 資料回答，資料中沒有的才用一般知識補充
2. 言簡意賅，不要過長
3. 全程使用繁體中文
`;

    // 1. Try Gemini (多把 Key 輪詢嘗試)
    if (GOOGLE_API_KEYS.length === 0) {
        console.warn('[AI] No Google API Keys found. Skipping Gemini.');
    } else {
        // 嘗試所有的 Gemini Keys，最多試 GOOGLE_API_KEYS.length 次
        let attempts = 0;
        let lastGeminiError: any = null;

        while (attempts < GOOGLE_API_KEYS.length) {
            const apiKeyToUse = GOOGLE_API_KEYS[currentGeminiKeyIndex];
            const genAI = new GoogleGenerativeAI(apiKeyToUse);

            try {
                console.log(`[AI] Attempting Primary (Gemini) with Key Index [${currentGeminiKeyIndex}]: ${GEMINI_MODEL_NAME}`);
                const model = genAI.getGenerativeModel({
                    model: GEMINI_MODEL_NAME,
                    generationConfig: {
                        temperature: AI_TEMPERATURE,
                    }
                });

                const result = await model.generateContent([systemPrompt, query]);
                const response = await result.response;
                const text = response.text();

                return {
                    text,
                    modelUsed: `${GEMINI_MODEL_NAME} (Key ${currentGeminiKeyIndex + 1})`,
                    provider: 'Gemini'
                };
            } catch (err: any) {
                lastGeminiError = err;
                console.warn(`[AI] Gemini Key Index [${currentGeminiKeyIndex}] failed: ${err.message}.`);

                // 切換到下一把 Key
                currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % GOOGLE_API_KEYS.length;
                attempts++;
            }
        }

        console.warn(`[AI] All Gemini keys failed. Last error: ${lastGeminiError?.message}. Switching to Fallback (Groq)...`);
    }

    // 2. Try Groq (Fallback)
    try {
        if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing');

        console.log(`[AI] Attempting Fallback (Groq): ${GROQ_MODEL_NAME}`);

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: query
                }
            ],
            model: GROQ_MODEL_NAME,
            temperature: AI_TEMPERATURE,
        });

        const text = completion.choices[0]?.message?.content || '';

        return {
            text,
            modelUsed: GROQ_MODEL_NAME,
            provider: 'Groq'
        };

    } catch (groqError: any) {
        console.error(`[AI] Groq also failed: ${groqError.message}`);

        return {
            text: `抱歉，系統目前忙碌中 (AI Service Unavailable)。\n\n[Primary Error]: All Gemini keys failed\n\n[Fallback Error]: ${groqError.message}`,
            modelUsed: 'none',
            provider: 'Gemini' // technically failed both, but keep type safe
        };
    }
}
