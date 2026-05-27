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

/**
 * Generate an image using Puter's free image generation.
 * Returns a blob URL usable as an img src.
 */
export async function generateImage(prompt: string): Promise<string> {
    try {
        const imgElement = await puter.ai.txt2img(prompt);
        const rawImg: any = imgElement;

        // If it's already a string URL
        if (typeof rawImg === 'string' && rawImg.trim() !== '') {
            return rawImg;
        }

        // Safely extract src from the element/object, avoiding prototype/context issues
        if (rawImg && typeof rawImg === 'object') {
            const src = rawImg.src || rawImg.url || rawImg.href;
            if (typeof src === 'string' && src.trim() !== '' && !src.startsWith('[object')) {
                return src;
            }
        }

        throw new Error("Puter returned an invalid or empty image response");
    } catch (e) {
        console.warn("Puter image generation failed, falling back to Pollinations AI:", e);
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
    type: 'note' | 'kanban';
    title: string;
    content?: string;
    viewMode?: 'board' | 'table' | 'calendar' | 'timeline';
    columns?: Array<{ id: string; label: string; statusValue: string; color: string }>;
    color?: string;
}

/**
 * Parse structured action instructions from user's natural language prompts.
 * Understands intents to create multiple note cards, kanban boards, timelines, calendars, and tables.
 */
export async function parseStructuredAction(prompt: string): Promise<AIStructuredAction[]> {
    const systemPrompt = `You are a structured intent parser for Infonote, an infinite canvas note-taking app.
Analyze the user's request and parse it into an array of actions.
The request might ask to:
- Create several note cards: e.g. "create 3 cards with productivity tips", "notes on dogs"
- Create a kanban board: e.g. "create a kanban board for project launch with columns backlog, writing, review, live"
- Create a table: e.g. "create a table for budget tracking"
- Create a timeline: e.g. "timeline for marketing campaign"
- Create a calendar: e.g. "calendar of events for may"

Respond ONLY with a valid JSON array of action objects. Do not include markdown, code blocks, or text outside the JSON.
Each action object must have:
- "type": "note" | "kanban"
- "title": Title of the card/board (e.g. short, descriptive name)
- If type is "note":
  - "content": In-depth, highly detailed, and comprehensive body content based on the user's topic/request. 
    Use markdown extensively to structure it: headers (##, ###), bullet lists, code blocks, quote/callout blocks, and todo lists. 
    Make the response rich and comprehensive (at least 3-4 detailed paragraphs or equivalent modular sections).
  - "color": Optional background hex color. If provided, you MUST choose ONLY from this exact premium preset palette: #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #06b6d4, #6366f1
- If type is "kanban":
  - "viewMode": "board" | "table" | "calendar" | "timeline" (based on what they requested, e.g. "board" for standard kanban, "table" for table, etc. Default is "board")
  - "columns": An array of column objects, each having:
    - "id": a unique string slug (e.g. "todo", "in-progress", "done")
    - "label": human-readable name (e.g. "To Do", "In Progress", "Done")
    - "statusValue": match the id (e.g. "todo", "in-progress", "done")
    - "color": hex color for column indicator (e.g. "#ef4444", "#f59e0b", "#22c55e")

Example request: "create 3 cards with space facts and a kanban board for research"
Example response:
[
  {"type": "note", "title": "The Milky Way", "content": "The Milky Way galaxy is about 100,000 light-years across and contains billions of stars.", "color": "#8b5cf6"},
  {"type": "note", "title": "Black Holes", "content": "Black holes are regions of space where gravity is so strong that not even light can escape.", "color": "#ec4899"},
  {"type": "note", "title": "Mars Exploration", "content": "Mars is a primary target for space exploration due to evidence of past liquid water.", "color": "#10b981"},
  {
    "type": "kanban",
    "title": "Space Research Board",
    "viewMode": "board",
    "columns": [
      {"id": "todo", "label": "To Do", "statusValue": "todo", "color": "#ef4444"},
      {"id": "in-progress", "label": "In Progress", "statusValue": "in-progress", "color": "#f59e0b"},
      {"id": "done", "label": "Done", "statusValue": "done", "color": "#22c55e"}
    ]
  }
]

User request: "${prompt}"`;

    const responseText = await generateText(systemPrompt);
    const jsonStr = extractJsonFromString(responseText, 'array');
    if (!jsonStr) {
        // Fallback: If no structured JSON, parse as a single note card using the text directly as content
        return [
            {
                type: 'note',
                title: prompt.length > 20 ? prompt.substring(0, 17) + '...' : prompt,
                content: responseText,
                color: '#1a1a2e'
            }
        ];
    }

    try {
        const parsed = JSON.parse(jsonStr) as AIStructuredAction[];
        return parsed;
    } catch (e) {
        console.error("Failed to parse structured actions:", e);
        return [
            {
                type: 'note',
                title: 'AI Generated Card',
                content: responseText,
                color: '#1a1a2e'
            }
        ];
    }
}
