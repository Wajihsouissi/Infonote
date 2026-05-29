// ============================================================
// AI Service — powered by Puter.js (free, no API keys needed)
// Text: GPT-4o-mini via puter.ai.chat()
// Image: puter.ai.txt2img()
// ============================================================
import { z } from 'zod';

/**
 * Generate text using Puter's free GPT-4o-mini model.
 */
export async function generateText(prompt: string): Promise<string> {
    const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });

    // puter.ai.chat can return a string or an object
    if (typeof response === 'string') return response;
    const resObj = response as any;
    if (resObj?.message?.content) return resObj.message.content;
    return String(response);
}

export async function generateImage(prompt: string): Promise<string> {
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), 20000)
        );
        const imgElement: any = await Promise.race([
            puter.ai.txt2img(prompt),
            timeoutPromise
        ]);

        if (imgElement instanceof HTMLImageElement || imgElement.tagName === 'IMG') {
            // Ensure the image is fully loaded before drawing
            await new Promise((resolve, reject) => {
                if (imgElement.complete) {
                    resolve(null);
                } else {
                    imgElement.onload = resolve;
                    imgElement.onerror = reject;
                }
            });

            // Draw to canvas to extract base64 data URL
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || imgElement.width || 512;
            canvas.height = imgElement.naturalHeight || imgElement.height || 512;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(imgElement, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                if (dataUrl && dataUrl.length > 50) {
                    return dataUrl;
                }
            }
            return imgElement.src;
        }

        if (typeof imgElement === 'string') return imgElement;
        if (imgElement && imgElement.src) return imgElement.src;
        if (imgElement && imgElement.url) return imgElement.url;

        throw new Error("Puter returned an invalid image response");
    } catch (e) {
        console.warn("Puter image generation failed:", e);
        // Fallback to pollinations but with different domain format
        const encodedPrompt = encodeURIComponent(prompt);
        const seed = Math.floor(Math.random() * 1000000);
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
    }
}

/**
 * Stream text generation via Puter.js.
 * Yields text chunks as they arrive so the UI can update character-by-character.
 */
export async function* streamText(prompt: string): AsyncGenerator<string, void, unknown> {
    const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini', stream: true });

    // Check if response is async iterable (streaming mode)
    if (response != null && typeof (response as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        const asyncIterable = response as AsyncIterable<{
            text?: string;
            delta?: { content?: string };
            choices?: Array<{ delta?: { content?: string } }>;
        }>;
        for await (const chunk of asyncIterable) {
            const text =
                chunk?.text ??
                chunk?.delta?.content ??
                chunk?.choices?.[0]?.delta?.content ??
                '';
            if (text) yield text;
        }
    } else {
        // Non-streaming fallback: yield full response as single chunk
        const text =
            typeof response === 'string'
                ? response
                : (response as { message?: { content?: string } })?.message?.content ?? '';
        if (text) yield text;
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
