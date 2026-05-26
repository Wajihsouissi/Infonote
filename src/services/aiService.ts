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
    if (response?.message?.content) return response.message.content;
    return String(response);
}

/**
 * Generate an image using Puter's free image generation.
 * Returns a blob URL usable as an img src.
 */
export async function generateImage(prompt: string): Promise<string> {
    const imgElement = await puter.ai.txt2img(prompt);

    // puter returns an HTMLImageElement — extract its src
    if (imgElement instanceof HTMLImageElement) {
        return imgElement.src;
    }
    // Fallback: if it's already a string URL
    return String(imgElement);
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
- "content": 2-3 sentences of content
- "x": x position (start at ${baseX}, increment by 340 per column, max 4 columns)
- "y": y position (start at ${baseY}, increment by 260 per row)
- "color": CSS hex color for background (use dark variants like #1a1a2e, #1e3a2f, #2d1b3d, #1a2e3a, #2e1a1a)

Return exactly the number of cards requested. No markdown, no explanation — only the JSON array.`;

    const text = await generateText(structuredPrompt);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI did not return valid JSON card array');

    const raw = JSON.parse(jsonMatch[0]) as unknown[];
    return raw.map((card: unknown, i: number) => {
        const parsed = CanvasCardSchema.safeParse(card);
        if (parsed.success) return parsed.data;
        // Fallback positioning if AI gives bad coords
        return {
            title: (card as Record<string, string>).title || `Card ${i + 1}`,
            content: (card as Record<string, string>).content || '',
            x: baseX + (i % 4) * 340,
            y: baseY + Math.floor(i / 4) * 260,
            color: '#1a1a2e',
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
    const prompt = `Generate ${count} distinct, informative mini-notes about "${topic}". 
Each note should cover a unique aspect or fact. 
Respond ONLY with a valid JSON array like:
[{"title":"Title 1","content":"2-3 sentence content"},{"title":"Title 2","content":"..."}]
Return exactly ${count} items. No markdown, no explanation, only the JSON array.`;

    const text = await generateText(prompt);

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI did not return valid card list JSON');

    const cards = JSON.parse(jsonMatch[0]);
    return Array.isArray(cards) ? cards.slice(0, count) : [];
}
