/**
 * Types for geminiSearch.js.
 *
 * api/ is plain JS (Vercel functions), but vite.config.ts imports this module
 * directly so the dev server and the deployed route run one implementation
 * instead of hand-maintained twins. That import is what needs the declaration.
 */

export interface GroundingCitation {
    title: string;
    url: string;
    source: string;
}

export interface GroundedAnswer {
    text: string;
    /** Pages the answer actually leaned on, in citation order. */
    citations: GroundingCitation[];
    /** The searches Gemini chose to run. */
    queries: string[];
}

export declare function getGeminiKey(): string;
export declare function getGroundingModel(): string;
export declare function isQuotaError(status: number, body?: unknown): boolean;
export declare function groundedAnswer(
    prompt: string,
    options?: { model?: string; system?: string; maxTokens?: number }
): Promise<GroundedAnswer>;
