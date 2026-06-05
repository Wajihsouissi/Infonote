// ============================================================
// AI Service - powered by Vercel AI Gateway.
// Text: OpenAI-compatible chat completions.
// Image: OpenAI-compatible image generations.
// ============================================================
import { z } from 'zod';

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
const TEXT_MODEL = import.meta.env.VITE_AI_GATEWAY_TEXT_MODEL || 'openai/gpt-4o-mini';
const IMAGE_MODEL = import.meta.env.VITE_AI_GATEWAY_IMAGE_MODEL || 'bfl/flux-2-pro';

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
    error?: { message?: string };
};

type ImageGenerationResponse = {
    data?: Array<{
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
    }>;
    error?: { message?: string };
};

function getGatewayKey(): string {
    const key = import.meta.env.VITE_AI_GATEWAY_API_KEY;
    if (!key || key.trim() === '') {
        throw new Error('AI Gateway is not configured. Set VITE_AI_GATEWAY_API_KEY in your environment.');
    }
    return key.trim();
}

async function gatewayFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${AI_GATEWAY_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getGatewayKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            `AI Gateway request failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    return data as T;
}

/**
 * Generate text using Vercel AI Gateway.
 */
export async function generateText(prompt: string): Promise<string> {
    const response = await gatewayFetch<ChatCompletionResponse>('/chat/completions', {
        model: TEXT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => part.text || '').join('');
    }
    throw new Error(response.error?.message || 'AI Gateway returned no text content.');
}

export async function generateImage(prompt: string): Promise<string> {
    const response = await gatewayFetch<ImageGenerationResponse>('/images/generations', {
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        response_format: 'b64_json',
    });

    const image = response.data?.[0];
    if (image?.b64_json) {
        return `data:image/png;base64,${image.b64_json}`;
    }
    if (image?.url && image.url.trim() !== '') {
        return image.url;
    }

    throw new Error(response.error?.message || 'AI Gateway returned no image data.');
}

/**
 * Stream text generation via Vercel AI Gateway.
 * Yields text chunks as they arrive so the UI can update character-by-character.
 */
export async function* streamText(prompt: string): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getGatewayKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: TEXT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            stream: true,
        }),
    });

    if (!response.ok || !response.body) {
        const message = await response.text();
        throw new Error(message || `AI Gateway stream failed with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                error?: { message?: string };
            };
            if (parsed.error?.message) throw new Error(parsed.error.message);

            const text = parsed.choices?.[0]?.delta?.content || '';
            if (text) yield text;
        }
    }
}

// ============================================================
// Structured Canvas Card Generation
// ============================================================

const CanvasCardSchema = z.object({
    title: z.string(),
    content: z.string(),
    x: z.number(),
    y: z.number(),
    color: z.string().optional().default('#1a1a2e'),
});

export type AICanvasCard = z.infer<typeof CanvasCardSchema>;

/**
 * Robustly extract JSON from a string that might contain markdown wrappers.
 */
export function extractJsonFromString(text: string, type: 'array' | 'object' = 'array'): string | null {
    // First, try to remove markdown blocks
    let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
    
    if (type === 'array') {
        const match = cleaned.match(/\[[\s\S]*\]/);
        return match ? match[0] : null;
    } else {
        const match = cleaned.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
    }
}

/**
 * Generate structured canvas cards from a natural language prompt.
 * e.g., "create 5 red cards about space exploration"
 */
export async function generateCanvasCards(
    prompt: string,
    baseX: number = 100,
    baseY: number = 100
): Promise<AICanvasCard[]> {
    const structuredPrompt = `${prompt}

Respond ONLY with a valid JSON array. Each item must have:
- "title": short card title (max 6 words)
- "content": Detailed, rich, and highly comprehensive body content based on the request (at least 3-4 structural sections, use markdown headings '##', bullet lists, or todo checks to structure it beautifully).
- "x": x position (start at ${baseX}, increment by 340 per column, max 4 columns)
- "y": y position (start at ${baseY}, increment by 260 per row)
- "color": CSS hex color for background. You MUST choose ONLY from this exact premium preset palette: #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #06b6d4, #6366f1

Return exactly the number of cards requested. No markdown, no explanation — only the JSON array.`;

    const text = await generateText(structuredPrompt);
    const jsonStr = extractJsonFromString(text, 'array');
    if (!jsonStr) throw new Error('AI did not return valid JSON card array');

    const raw = JSON.parse(jsonStr) as unknown[];
    return raw.map((card: unknown, i: number) => {
        const parsed = CanvasCardSchema.safeParse(card);
        if (parsed.success) return parsed.data;
        // Fallback positioning if AI gives bad coords
        return {
            title: (card as Record<string, string>).title || `Card ${i + 1}`,
            content: (card as Record<string, string>).content || '',
            x: baseX + (i % 4) * 340,
            y: baseY + Math.floor(i / 4) * 260,
            color: '#8b5cf6', // Default to preset Violet
        };
    });
}

/**
 * Parse a prompt for multi-card generation intent.
 * Detects: "create 5 cards about dogs", "make 10 notes on history", etc.
 */
export function parseMultiCardIntent(prompt: string): { count: number; topic: string } | null {
    const match = prompt.match(
        /(?:create|make|generate|write|build)\s+(\d+)\s+(?:cards?|notes?|blocks?|items?)\s+(?:about|on|for|regarding|covering)\s+(.+)/i
    );
    if (!match) return null;
    const count = Math.min(parseInt(match[1], 10), 20);
    const topic = match[2].trim();
    return { count, topic };
}

/**
 * Generate content for multiple cards about a topic.
 */
export async function generateMultipleCardContents(
    topic: string,
    count: number
): Promise<Array<{ title: string; content: string }>> {
    const prompt = `Generate ${count} distinct, highly detailed, and deep notes about "${topic}". 
Each note must be comprehensive, explaining the aspect in-depth.
Use rich markdown tags extensively inside the content: headings (##), bullet points (-), todo checkboxes, and quotes (>) to organize the content.
Respond ONLY with a valid JSON array like:
[{"title":"Title 1","content":"detailed structured content..."},{"title":"Title 2","content":"..."}]
Return exactly ${count} items. No explanations outside the JSON array.`;

    const text = await generateText(prompt);

    // Extract JSON array from response
    const jsonStr = extractJsonFromString(text, 'array');
    if (!jsonStr) throw new Error('AI did not return valid card list JSON');

    const cards = JSON.parse(jsonStr);
    return Array.isArray(cards) ? cards.slice(0, count) : [];
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
  - "content": In-depth, highly detailed, and comprehensive body content. Use markdown extensively (headers, bullet lists, quote blocks, and task lists like '- [ ] Task'). Make "fused-note" content especially long and structured.
  - "color": Optional background hex color. MUST choose ONLY from: #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #06b6d4, #6366f1
- If type is "kanban":
  - "viewMode": "board" | "table" | "calendar" | "timeline"
  - "columns": Array of objects: {"id": "slug", "label": "Name", "statusValue": "slug", "color": "#hex"}
- If type is "mindmap":
  - "nodes": Array of objects representing the mindmap graph: {"id": "unique-string", "label": "Short Title", "parentId": "id-of-parent-node-if-any"} (Do not include parentId for the root node)

Example JSON response:
[
  {"type": "note", "title": "The Milky Way", "content": "The Milky Way galaxy is...", "color": "#8b5cf6"},
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
            let retryResponse = await generateText(retryPrompt);
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
            color: '#1a1a2e'
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
            color: '#1a1a2e'
        }];
    }
}
