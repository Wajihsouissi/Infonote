/**
 * The models the AI panel may ask for.
 *
 * The server picks the model and has always ignored whatever the client sent —
 * that rule is what stops a leaked endpoint being pointed at an expensive
 * model, and it stays. What changes is that the server now honours a request
 * that names a model on ITS OWN allow-list. So this list is a menu, not an
 * instruction: anything not on the server's list quietly falls back to the
 * configured default rather than failing.
 *
 * The ids must stay in step with `TEXT_MODEL_ALLOWLIST` in api/_lib/aiGuard.js
 * and its dev twin in vite.config.ts. Deployments can override both ends with
 * AI_GATEWAY_TEXT_MODELS without touching code.
 */

export interface AIModelOption {
    /** Gateway model id, or null for "let the server choose". */
    id: string | null;
    label: string;
    /** One line shown under the name in the picker. */
    hint: string;
}

export const AI_MODELS: AIModelOption[] = [
    { id: null, label: 'Auto', hint: 'Whatever the workspace is configured for' },
    { id: 'z-ai/glm-5.3', label: 'GLM 5.3', hint: 'Strong general-purpose reasoning' },
    { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', hint: 'Fast open-weight model' },
    { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash', hint: 'Fast multimodal all-rounder' },
    { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro', hint: 'Deep reasoning and coding' },
    { id: 'x-ai/grok-4.6', label: 'Grok 4.6', hint: 'Long-context reasoning' },
    { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5', hint: 'High-quality complex work' },
    { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Balanced quality and speed' },
    { id: 'google/gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Fast structured answers' },
    { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', hint: 'Fastest and cheapest drafts' },
    { id: 'openrouter/fusion', label: 'OpenRouter Fusion', hint: 'OpenRouter routed model' },
    { id: 'moonshotai/kimi-k3', label: 'Kimi K3', hint: 'Long-context open model' },
    { id: 'z-ai/glm-5.2:free', label: 'GLM 5.2 Free', hint: 'Free general-purpose model' },
    { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Free', hint: 'Free fast model' },
    { id: 'cohere/north-mini-code:free', label: 'Cohere North Mini Code', hint: 'Free coding-focused model' },
];

export const DEFAULT_AI_MODEL: string | null = null;

/** True for an id this build still offers — guards a stale saved preference. */
export const isKnownModel = (id: string | null): boolean =>
    AI_MODELS.some((m) => m.id === id);

export const modelLabel = (id: string | null): string =>
    AI_MODELS.find((m) => m.id === id)?.label ?? 'Auto';
