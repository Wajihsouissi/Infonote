/**
 * Getting a request to /api/ai/* and back.
 *
 * Nothing here knows what an answer means — it handles the four ways a network
 * call goes wrong (timeout, transient failure, an error body that is sometimes
 * JSON and sometimes not, a user pressing Stop) so that everything above can
 * assume a response either arrived or threw something readable.
 */

import { getAiAuthHeader } from '../aiAuthHeader';

/** Mirrors STREAM_TRAILER_MARK in api/_lib/aiGuard.js — U+001E RECORD SEPARATOR. */
export const STREAM_TRAILER_MARK = '';

/**
 * Hint only — the server owns the final model choice and ignores anything that
 * is not on its own allow-list.
 */
export const TEXT_MODEL = import.meta.env.VITE_AI_GATEWAY_TEXT_MODEL || 'gemini-3.7-flash';

/* Above the server's 55s deadline (api/_lib/chatRoute.js), so the client never
   gives up on an answer the server is still allowed to finish. A non-streaming
   body only returns headers once it is fully written. For streams this is the
   between-chunks guard, and the server's own 30s stall guard fires first. */
const AI_REQUEST_TIMEOUT_MS = 65_000;
const AI_RETRY_DELAY_MS = 500;

export class AIRequestError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'AIRequestError';
        this.status = status;
    }
}

function abortSignalWithTimeout(userSignal?: AbortSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const abortForUser = () => controller.abort(userSignal?.reason);
    if (userSignal?.aborted) abortForUser();
    else userSignal?.addEventListener('abort', abortForUser, { once: true });
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('AI request timed out.', 'TimeoutError'));
    }, AI_REQUEST_TIMEOUT_MS);
    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        dispose: () => {
            window.clearTimeout(timeout);
            userSignal?.removeEventListener('abort', abortForUser);
        },
    };
}

function canRetry(error: unknown, userSignal?: AbortSignal): boolean {
    if (userSignal?.aborted) return false;
    // A provider can package a credit/concurrency rejection as a 5xx. Sending
    // the automatic retry in that case only reserves more capacity and makes
    // the next attempt less likely to start once the current work settles.
    if (error instanceof AIRequestError && /(?:available credits|in-flight requests|insufficient credits|credit limit|quota (?:is )?exceeded|payment required)/i.test(error.message)) return false;
    if (error instanceof AIRequestError) return error.status === 408 || error.status === 425 || (error.status != null && error.status >= 500);
    return error instanceof TypeError;
}

/** One request, with a deadline and a single retry for the failures worth retrying. */
export async function requestAI(path: string, init: RequestInit, userSignal?: AbortSignal): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const request = abortSignalWithTimeout(userSignal);
        try {
            const response = await fetch(path, { ...init, signal: request.signal });
            if (!response.ok) {
                const text = await response.text();
                let message = `AI request failed with HTTP ${response.status}`;
                try {
                    const data = text ? JSON.parse(text) : {};
                    message = (typeof data?.error === 'string' ? data.error : data?.error?.message) || data?.message || message;
                } catch {
                    if (text) message = text;
                }
                throw new AIRequestError(message, response.status);
            }
            return response;
        } catch (error) {
            lastError = request.didTimeout()
                ? new AIRequestError('The AI took too long to respond. Please try again.', 408)
                : error;
            if (attempt === 0 && canRetry(lastError, userSignal)) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, AI_RETRY_DELAY_MS));
                continue;
            }
            throw lastError;
        } finally {
            request.dispose();
        }
    }
    throw lastError instanceof Error ? lastError : new Error('AI request failed.');
}

/** The run-stage header the server buckets on. Omitted = strictest bucket. */
export const phaseHeader = (phase?: string): Record<string, string> =>
    phase ? { 'X-AI-Phase': phase } : {};

/** Headers every AI request carries: content type, run stage, bearer token. */
export async function aiHeaders(phase?: string): Promise<Record<string, string>> {
    return {
        'Content-Type': 'application/json',
        ...phaseHeader(phase),
        ...(await getAiAuthHeader()),
    };
}

/** POST a JSON body and read a JSON answer. */
export async function gatewayFetch<T>(path: string, body: Record<string, unknown>, phase?: string): Promise<T> {
    const response = await requestAI(path, {
        method: 'POST',
        headers: await aiHeaders(phase),
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return data as T;
}
