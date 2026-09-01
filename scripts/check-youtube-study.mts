import assert from 'node:assert/strict';
import {
    applyTranscriptEdits,
    decodeVideoStudyDragPayload,
    normalizeTranscriptSegments,
    parseTimedTextFile,
    parseYouTubeUrl,
    selectionRange,
    stableSegmentId,
    validateClipRange,
} from '../src/features/youtube/youtubeStudy.ts';
import transcriptHandler, {
    canonicalYouTubeUrl,
    normalizeProviderResponse,
    safeProviderError,
} from '../api/youtube/transcript.js';
import { extractGatewayText } from '../api/ai/text.js';
import { isAppNodeType } from '../src/types.ts';

const urls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=4',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
];
for (const url of urls) assert.equal(parseYouTubeUrl(url)?.videoId, 'dQw4w9WgXcQ');
assert.equal(parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
assert.equal(parseYouTubeUrl('https://youtube.com/watch?v=short'), null);
assert.equal(isAppNodeType('youtube'), true, 'storage loads must retain YouTube nodes');

assert.equal(
    stableSegmentId(1200, 800, 'Hello world', 0),
    stableSegmentId(1200, 800, 'Hello world', 0),
    'segment IDs must be deterministic',
);

const normalized = normalizeTranscriptSegments([
    { text: 'First line', offset: 1000, duration: 900, lang: 'en' },
    { text: 'Second line', offset: 2000, duration: 700, lang: 'en' },
]);
assert.equal(normalized.length, 2);
assert.deepEqual(selectionRange(normalized), { startMs: 1000, endMs: 3000 });

const edited = applyTranscriptEdits(normalized, {
    hiddenSegmentIds: [normalized[1].id],
    correctedText: { [normalized[0].id]: 'Corrected line' },
});
assert.equal(edited[0].displayText, 'Corrected line');
assert.equal(edited[1].hidden, true);
const original = applyTranscriptEdits(normalized, {
    hiddenSegmentIds: [normalized[1].id],
    correctedText: { [normalized[0].id]: 'Corrected line' },
}, 'original');
assert.equal(original[0].displayText, 'First line');
assert.equal(original[1].hidden, false);

const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.250
Welcome to the lesson.

00:03.250 --> 00:00:05.000
This is <b>important</b>.`;
assert.equal(parseTimedTextFile(vtt, 'en').length, 2);

const srt = `1
00:00:01,000 --> 00:00:02,000
One

2
00:00:02,000 --> 00:00:04,000
Two`;
assert.equal(parseTimedTextFile(srt).at(-1)?.startMs, 2000);
assert.throws(() => parseTimedTextFile('not captions'), /No valid timestamped cues/);
assert.deepEqual(validateClipRange(-100, 200), { startMs: 0, endMs: 1000 });
assert.deepEqual(validateClipRange(Number.NaN, Number.NaN), { startMs: 0, endMs: 1000 });

const dragPayload = {
    version: 1 as const,
    sourceNodeId: 'source',
    video: {
        videoId: 'dQw4w9WgXcQ',
        url: urls[0],
        title: 'Study video',
        channel: 'Channel',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    },
    segments: normalized,
    cleanedText: 'First line Second line',
    startMs: 1000,
    endMs: 3000,
    kind: 'quote' as const,
};
assert.deepEqual(decodeVideoStudyDragPayload(JSON.stringify(dragPayload)), dragPayload);
assert.equal(decodeVideoStudyDragPayload('{"version":1}'), null);

assert.equal(canonicalYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), urls[0]);
assert.equal(canonicalYouTubeUrl('https://example.com/dQw4w9WgXcQ'), '');
assert.deepEqual(normalizeProviderResponse({ jobId: 'job_123' }, 202), { status: 'queued', jobId: 'job_123' });
assert.equal(normalizeProviderResponse({ content: [{ text: 'line', offset: 0, duration: 500 }] }, 200).status, 'ready');
assert.match(safeProviderError(500, { error: 'provider internals' }), /temporarily unavailable/);

let apiStatus = 0;
let apiPayload = '';
await transcriptHandler(
    { method: 'POST', headers: {}, body: { url: urls[0] } },
    {
        setHeader() {},
        end(value: string) { apiPayload = value; },
        set statusCode(value: number) { apiStatus = value; },
        get statusCode() { return apiStatus; },
    },
);
assert.equal(apiStatus, 401, 'automatic transcripts require authentication');
assert.match(apiPayload, /Sign in/);

assert.equal(extractGatewayText({ choices: [{ message: { content: 'Plain response' } }] }), 'Plain response');
assert.equal(extractGatewayText({ choices: [{ message: { content: { type: 'text', text: 'Structured response' } } }] }), 'Structured response');
assert.equal(extractGatewayText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Responses output' }] }] }), 'Responses output');
assert.equal(extractGatewayText({ candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }] }), 'Gemini response');
assert.equal(extractGatewayText({ choices: [{ message: { reasoning: 'Do not expose this' } }] }), '');

console.log('YouTube study checks passed.');
