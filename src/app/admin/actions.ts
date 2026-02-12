'use server';

import { revalidatePath } from 'next/cache';
import { updateSystemConfig, updateChatSession } from '@/lib/notion';

export async function updateConfigAction(formData: FormData) {
    const aiEnabled = formData.get('ai_enabled') === 'on';
    const modelName = formData.get('model_name') as string;
    const systemPrompt = formData.get('system_prompt') as string;
    const handoverKeywords = formData.get('handover_keywords') as string;
    const autoSwitchMinutes = formData.get('auto_switch_minutes');
    const adminLineId = formData.get('admin_line_id') as string;

    await updateSystemConfig('AI_ENABLED', aiEnabled);
    await updateSystemConfig('MODEL_NAME', modelName);
    await updateSystemConfig('SYSTEM_PROMPT', systemPrompt);
    await updateSystemConfig('HANDOVER_KEYWORDS', handoverKeywords);

    if (autoSwitchMinutes) {
        await updateSystemConfig('AUTO_SWITCH_MINUTES', autoSwitchMinutes.toString());
    }

    if (adminLineId) {
        await updateSystemConfig('ADMIN_LINE_ID', adminLineId);
    }

    revalidatePath('/admin/settings');
}

export async function toggleAiModeAction(lineUserId: string, currentMode: 'AI' | 'Human') {
    const newMode = currentMode === 'AI' ? 'Human' : 'AI';
    await updateChatSession(lineUserId, newMode);
    revalidatePath('/admin/agent');
}
