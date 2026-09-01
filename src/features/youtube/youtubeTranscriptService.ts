import { isSupabaseConfigured, supabase } from '../../services/supabase/client';
import { normalizeTranscriptSegments, type TranscriptSegment } from './youtubeStudy';

export type TranscriptResult =
    | { status: 'ready'; segments: TranscriptSegment[]; language?: string; availableLanguages?: string[] }
    | { status: 'queued'; jobId: string }
    | { status: 'failed'; error: string };

async function authHeaders(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Sign in to fetch an automatic transcript.');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in to fetch an automatic transcript.');
    return { Authorization: `Bearer ${token}` };
}

async function readResult(response: Response): Promise<TranscriptResult> {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
        const error = typeof data.error === 'string' ? data.error : `Transcript request failed with HTTP ${response.status}.`;
        throw new Error(error);
    }
    if (data.status === 'queued' && typeof data.jobId === 'string') return { status: 'queued', jobId: data.jobId };
    if (data.status === 'failed') return { status: 'failed', error: String(data.error || 'Transcript generation failed.') };
    const segments = normalizeTranscriptSegments(data.segments, typeof data.language === 'string' ? data.language : 'und');
    if (segments.length === 0) return { status: 'failed', error: 'No spoken transcript was found for this video.' };
    return {
        status: 'ready',
        segments,
        language: typeof data.language === 'string' ? data.language : undefined,
        availableLanguages: Array.isArray(data.availableLanguages)
            ? data.availableLanguages.filter((value): value is string => typeof value === 'string')
            : undefined,
    };
}

export async function requestYouTubeTranscript(url: string, language?: string): Promise<TranscriptResult> {
    const response = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ url, ...(language ? { language } : {}) }),
    });
    return readResult(response);
}

export async function pollYouTubeTranscript(jobId: string): Promise<TranscriptResult> {
    const response = await fetch(`/api/youtube/transcript?jobId=${encodeURIComponent(jobId)}`, {
        headers: await authHeaders(),
    });
    return readResult(response);
}
