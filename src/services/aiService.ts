// ============================================================
// AI Service - powered by Vercel AI Gateway.
// Text: OpenAI-compatible chat completions.
// Image: OpenAI-compatible image generations.
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase/client';

const TEXT_MODEL = import.meta.env.VITE_AI_GATEWAY_TEXT_MODEL || 'openai/gpt-4o-mini';
const IMAGE_MODEL = import.meta.env.VITE_AI_GATEWAY_IMAGE_MODEL || 'bfl/flux-2-pro';

/**
 * The /api/ai/* routes require a signed-in Supabase user (they proxy a paid
 * gateway). Resolve the current access token or fail fast with a friendly
 * message instead of a bare 401.
 */
async function getAiAuthHeader(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error('Sign in to use AI features.');
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
        throw new Error('Sign in to use AI features.');
    }
    return { Authorization: `Bearer ${token}` };
}

/**
 * System prompt for free-form text generation (single notes, inline writing,
 * card editing). Steers the model toward ChatGPT/Claude-quality answers whose
 * LENGTH ADAPTS TO THE ASK — concise for simple questions, richly structured
 * only when the topic warrants it. This is intentionally NOT used for the
 * structured (JSON) generators, whose strict output contracts must stay clean.
 */
export const FREEFORM_SYSTEM_PROMPT = `You are a knowledgeable, articulate writing assistant inside Infonote, an infinite-canvas note app.

Match the depth and length of your answer to what is actually asked:
- Simple or factual question → answer directly in 1–3 sentences. Do not pad or add headings.
- "Explain", "compare", "how do I…" → a focused answer with light structure where it helps.
- "Guide", "deep dive", "comprehensive", "everything about…" → fully structured with clear sections.

Formatting (clean Markdown that renders beautifully):
- **Bold** for key terms, *italic* for nuance, \`inline code\` for code, commands, or identifiers.
- Use ##/### headings, "- " bullets, "1." numbered steps, "> " quotes, and tables ONLY when they add clarity.
- Use fenced \`\`\` code blocks for multi-line code.

Lead with the answer — no preamble, no "Certainly!", no restating the question. Never over-structure a short answer.`;

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
    error?: { message?: string };
};

type ImageGenerationResponse = {
    imageUrl?: string;
    error?: { message?: string };
};

async function gatewayFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await getAiAuthHeader()),
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            `AI request failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    return data as T;
}

/**
 * Generate text using Vercel AI Gateway.
 * Pass `system` for free-form generation to control persona/formatting/length.
 * Omit it for structured (JSON) calls that carry their own strict instructions.
 */
export async function generateText(prompt: string, system?: string): Promise<string> {
    const response = await gatewayFetch<ChatCompletionResponse>('/api/ai/text', {
        model: TEXT_MODEL,
        prompt,
        ...(system ? { system } : {}),
    });

    const content = (response as ChatCompletionResponse & { text?: string }).text ?? response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => part.text || '').join('');
    }
    throw new Error(response.error?.message || 'AI Gateway returned no text content.');
}

export async function generateImage(prompt: string): Promise<string> {
    const response = await gatewayFetch<ImageGenerationResponse>('/api/ai/image', {
        model: IMAGE_MODEL,
        prompt,
    });

    if (response.imageUrl && response.imageUrl.trim() !== '') {
        return response.imageUrl;
    }

    throw new Error(response.error?.message || 'AI Gateway returned no image data.');
}

// ============================================================
// Structured Canvas Card Generation
// ============================================================

/**
 * Robustly extract JSON from a string that might contain markdown wrappers.
 */
export function extractJsonFromString(text: string, type: 'array' | 'object' = 'array'): string | null {
    // First, try to remove markdown blocks
    const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
    
    if (type === 'array') {
        const match = cleaned.match(/\[[\s\S]*\]/);
        return match ? match[0] : null;
    } else {
        const match = cleaned.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
    }
}

export interface AIStructuredAction {
    type: 'note' | 'kanban' | 'fused-note' | 'mindmap';
    title: string;
    content?: string;
    viewMode?: 'board' | 'table' | 'calendar' | 'timeline';
    columns?: Array<{ id: string; label: string; statusValue: string; color: string }>;
    color?: string;
    nodes?: Array<{ id: string; label: string; parentId?: string }>;
}

/**
 * Parse structured action instructions from user's natural language prompts.
 * Understands intents to create multiple note cards, kanban boards, timelines, calendars, tables, fused notes, and mindmaps.
 */
export async function parseStructuredAction(prompt: string, context?: string): Promise<AIStructuredAction[]> {
    const systemPrompt = `You are a structured intent parser for Infonote, an infinite canvas note-taking app.
Analyze the user's request and parse it into an array of actions.
The user might ask to:
- Create note cards: e.g. "create 3 cards with productivity tips"
- Create a kanban board, table, or timeline: e.g. "kanban board for project launch"
- Create a fused note or document: e.g. "create a fusednote with a to do list"
- Create a mindmap: e.g. "mindmap of artificial intelligence"

${context ? `[CURRENT CANVAS CONTEXT]\n${context}\nUse this context to inform your response if the user refers to existing topics.\n` : ''}
First, briefly outline your plan for the content in <think> tags.
Then, respond ONLY with a valid JSON array of action objects. Do not include markdown, code blocks, or text outside the JSON (except for the <think> tags at the beginning).
Each action object must have:
- "type": "note" | "kanban" | "fused-note" | "mindmap"
- "title": Title of the card/board/doc/mindmap
- If type is "note" or "fused-note":
  - "content": Body content whose length and depth MATCH the user's request — concise for simple asks, richly structured only when the topic warrants it. Use markdown where it helps (headers, bullet lists, quote blocks, '- [ ] Task' lists, and **bold** for key terms). A "fused-note" is a document, so it can go deeper, but still avoid padding.
  - "color": Optional background hex color. MUST choose ONLY from: #f95d2e, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #e3a24f, #6366f1
- If type is "kanban":
  - "viewMode": "board" | "table" | "calendar" | "timeline"
  - "columns": Array of objects: {"id": "slug", "label": "Name", "statusValue": "slug", "color": "#hex"}
- If type is "mindmap":
  - "nodes": Array of objects representing the mindmap graph: {"id": "unique-string", "label": "Short Title", "parentId": "id-of-parent-node-if-any"} (Do not include parentId for the root node)

Example JSON response:
[
  {"type": "note", "title": "The Milky Way", "content": "The Milky Way galaxy is...", "color": "#f95d2e"},
  {"type": "fused-note", "title": "Project Launch Doc", "content": "## Goals\\n- [ ] Task 1\\n- [ ] Task 2", "color": "#10b981"},
  {
    "type": "mindmap",
    "title": "AI Concepts",
    "nodes": [
      {"id": "root", "label": "AI Concepts"},
      {"id": "ml", "label": "Machine Learning", "parentId": "root"},
      {"id": "dl", "label": "Deep Learning", "parentId": "ml"}
    ]
  },
  {
    "type": "kanban",
    "title": "Space Research",
    "viewMode": "board",
    "columns": [{"id": "todo", "label": "To Do", "statusValue": "todo", "color": "#ef4444"}]
  }
]`;

    // We use clear XML-style tags to separate system instructions from user prompt
    const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n<user>\n${prompt}\n</user>`;

    let responseText = await generateText(fullPrompt);
    let jsonStr = extractJsonFromString(responseText, 'array');
    
    // Retry logic if no valid JSON array was found
    if (!jsonStr) {
        try {
            const retryPrompt = `${fullPrompt}\n\n<assistant>\n${responseText}\n</assistant>\n\n<user>\nThis JSON was invalid or missing. Please fix the syntax errors and return ONLY the valid JSON array without any markdown wrappers or text.\n</user>`;
            const retryResponse = await generateText(retryPrompt);
            jsonStr = extractJsonFromString(retryResponse, 'array');
            if (jsonStr) {
                responseText = retryResponse;
            }
        } catch (retryErr) {
            console.error("Retry failed:", retryErr);
        }
    }

    const cleanResponseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if (!jsonStr) {
        // Fallback: If still no structured JSON, parse as a single note card
        return [{
            type: 'note',
            title: prompt.length > 20 ? prompt.substring(0, 17) + '...' : prompt,
            content: cleanResponseText,
            color: '#1a191d'
        }];
    }

    try {
        const parsed = JSON.parse(jsonStr) as AIStructuredAction[];
        return parsed;
    } catch (e) {
        console.error("Failed to parse structured actions:", e);
        return [{
            type: 'note',
            title: 'AI Generated Card',
            content: cleanResponseText,
            color: '#1a191d'
        }];
    }
}
