import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// Initialize the API client
const apiKey = process.env.GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// Models
const MODEL_PRIMARY = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash'; // 2.5-flash not standard yet? Prompt says 2.5-flash.
// *Note*: As of my knowledge cutoff, 2.5 is very new or hypothetical in prompts.
// If the user specific asked for 'gemini-2.5-flash', we use it string-literally.
// If it fails, fallback.

const MODEL_FALLBACK = 'gemini-1.5-flash';

interface GeiminiResponse {
    text: string;
    modelUsed: string;
}

/**
 * Generates an answer using Google Gemini.
 * Implements fallback logic from Primary (2.5) to Fallback (1.5).
 */
export async function generateAnswer(query: string, context: string): Promise<GeiminiResponse> {
    if (!apiKey) {
        return { text: 'Error: Google API Key is missing.', modelUsed: 'none' };
    }

    const systemPrompt = `
You are a helpful and intelligent AI assistant dealing with student questions.
Your knowledge comes from the following Notion context:

<NotionContext>
${context}
</NotionContext>

Instructions:
1. Answer the user's question based *primarily* on the Notion Context provided.
2. If the answer is not in the context, use your general knowledge but mention that this specific info might not be in the school's Notion documents.
3. Be polite, concise, and helpful.
4. Use Traditional Chinese (繁體中文) for all responses.
`;

    try {
        // Attempt 1: Primary Model
        const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash';
        // Use 'gemini-2.0-flash-exp' or similar if 2.5 is not available, but let's try 2.5 as requested.
        console.log(`[Gemini] Attempting generation with ${modelName}...`);

        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([systemPrompt, query]);
        const response = await result.response;

        return {
            text: response.text(),
            modelUsed: modelName,
        };

    } catch (error: any) {
        console.warn(`[Gemini] Primary model failed: ${error.message}. Switching to fallback...`);

        try {
            // Attempt 2: Fallback Model
            console.log(`[Gemini] Attempting generation with ${MODEL_FALLBACK}...`);
            const fallbackModel = genAI.getGenerativeModel({ model: MODEL_FALLBACK });
            const result = await fallbackModel.generateContent([systemPrompt, query]);
            const response = await result.response;

            return {
                text: response.text(),
                modelUsed: MODEL_FALLBACK,
            };
        } catch (fallbackError: any) {
            console.error(`[Gemini] Fallback model also failed: ${fallbackError.message}`);
            return {
                text: '抱歉，系統目前忙碌中，請稍後再試。 (AI Service Unavailable)',
                modelUsed: 'none',
            };
        }
    }
}
