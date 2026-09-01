import { generateText } from '../../services/aiService';
import type { TranscriptSegment } from './youtubeStudy';

const CHUNK_CHARACTERS = 12_000;

function spokenContent(segments: TranscriptSegment[]): string {
    return segments.map((segment) => segment.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function timestampedTranscriptText(segments: TranscriptSegment[]): string {
    return segments.map((segment) => `[${Math.floor(segment.startMs / 1000)}s] ${segment.text}`).join('\n');
}

function splitIntoVideoSections(content: string): string[] {
    const sections: string[] = [];
    let current = '';
    for (const line of content.split('\n')) {
        const next = current ? `${current}\n${line}` : line;
        if (current && next.length > CHUNK_CHARACTERS) {
            sections.push(current);
            current = line;
        } else {
            current = next;
        }
    }
    if (current) sections.push(current);
    return sections;
}

export async function rewriteStudySelection(segments: TranscriptSegment[], instruction = 'Rewrite this clearly while preserving its meaning.'): Promise<string> {
    if (segments.length === 0) throw new Error('Select transcript lines first.');
    return generateText(`${instruction}\n\n${timestampedTranscriptText(segments)}`, {
        system: 'Rewrite only the supplied transcript passage. Preserve factual meaning and return only the revised passage.',
        effort: 'fast',
    });
}

/** Creates an AI-written study summary of the video's spoken content, never an extractive caption list. */
export async function summarizeVideo(segments: TranscriptSegment[], videoTitle?: string): Promise<string> {
    if (segments.length === 0) throw new Error('There is no video content to summarize yet.');
    const sections = splitIntoVideoSections(spokenContent(segments));
    if (sections.length === 0) throw new Error('There is no video content to summarize yet.');

    const title = videoTitle ? `“${videoTitle}”` : 'this video';
    const summarySystem = `You write accurate, compact video summaries for study notes. Use only the supplied spoken content; do not invent details. Do not mention captions, transcripts, timestamps, or the summarization process.`;
    const finalPrompt = (source: string) => `Create a useful bullet-point summary of ${title}.

Return Markdown in exactly this shape:
## Video summary
- 4 to 8 concise, standalone bullets covering the central ideas, explanations, examples, and conclusions
### Main takeaway
- one concise synthesis of what the viewer should retain

Do not include timestamps, a preamble, or any text outside those sections.

${source}`;

    if (sections.length === 1) {
        return generateText(finalPrompt(`Video content:\n${sections[0]}`), {
            system: summarySystem,
            // A concise study summary should not compete with a long canvas
            // generation for provider credits or in-flight capacity.
            maxTokensOverride: 650,
        });
    }

    const sectionSummaries: string[] = [];
    for (const section of sections) {
        sectionSummaries.push(await generateText(`Summarize this section of ${title} into 3 to 5 factual bullets. Preserve important explanations, examples, and conclusions so another writer can combine the sections. Do not use timestamps or mention captions/transcripts.\n\nVideo content:\n${section}`, {
            system: summarySystem,
            maxTokensOverride: 400,
        }));
    }

    return generateText(finalPrompt(`Section notes:\n${sectionSummaries.join('\n\n---\n\n')}`), {
        system: summarySystem,
        maxTokensOverride: 650,
    });
}
