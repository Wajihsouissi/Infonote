/**
 * Types for aiUpstream.js.
 *
 * api/ is plain JS (Vercel functions), but vite.config.ts imports this module
 * so the dev server and the deployed routes share one upstream implementation.
 * That import is what needs the declaration.
 */

export type AIThinking = 'off' | 'light' | 'deep';

export type UpstreamResult =
    | { ok: true; response: Response; model: string; reasoning: string | null; release: () => void; abort: () => void }
    | { ok: false; status: number; message: string; model: string };

export declare const THINKING_HEADROOM_TOKENS: number;
export declare const DEEP_THINKING_HEADROOM_TOKENS: number;
export declare const DEFAULT_FALLBACK_MODELS: string[];

export declare function resetLearnedReasoningLevels(): void;
export declare function normalizeThinking(value: unknown): AIThinking;
export declare function normalizeTemperature(value: unknown): number;
export declare function reasoningLevels(model: string, thinking: AIThinking): Array<string | null>;
export declare function isReasoningRejection(status: number, errorText: unknown): boolean;
export declare function modelChain(primary: string, allowlist: string[], configuredFallbacks?: string[]): string[];
export declare function ceilingFor(maxTokens: number, level: string | null): number;
export declare function postChatCompletion(options: {
    baseUrl: string;
    apiKey: string;
    models: string[];
    payload: Record<string, unknown>;
    maxTokens: number;
    thinking?: AIThinking;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    now?: () => number;
}): Promise<UpstreamResult>;
