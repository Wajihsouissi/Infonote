import { v4 as uuidv4 } from 'uuid';
import { formatBytes, resolveMediaTypeFromFile } from '../editor/mediaTypes';

/**
 * Files attached to an AI turn.
 *
 * What the model can actually receive decides the shape here, not what the OS
 * file picker will hand us:
 *  - images go up as data URLs in the multimodal `image_url` part, which is the
 *    only attachment the gateway's chat models genuinely look at;
 *  - text-ish documents are read and inlined into the prompt, which is both
 *    cheaper and more reliable than any upload path;
 *  - everything else — video above all — is declined with the reason, because
 *    silently attaching a file the model cannot open is worse than refusing it.
 *    A video belongs on the canvas as a media block, where it plays.
 */

export type AttachmentKind = 'image' | 'document';

export interface AIAttachment {
    id: string;
    kind: AttachmentKind;
    name: string;
    size: number;
    /** Images: a data URL. Documents: their text. */
    payload: string;
}

/** Images ride the wire as base64 (~+33%), so the ceiling is well under the
 *  editor's 10MB media cap. Four of these already make a heavy request. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;
const MAX_DOCUMENT_CHARS = 20_000;

const DOCUMENT_EXT = /\.(md|markdown|txt|csv|tsv|json|ya?ml|html?|xml|log|ts|tsx|js|jsx|py|rb|go|rs|java|c|h|cpp|css|scss|sql)$/i;

/** What the file picker offers. Kept in step with `readAttachment` below. */
export const ATTACHMENT_ACCEPT = 'image/*,text/*,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.log';

function isDocument(file: File): boolean {
    return file.type.startsWith('text/')
        || file.type === 'application/json'
        || DOCUMENT_EXT.test(file.name);
}

/** Thrown reasons are shown to the user verbatim, so they say what to do next. */
export async function readAttachment(file: File): Promise<AIAttachment> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${file.name} is ${formatBytes(file.size)} — attachments are capped at ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    }

    const media = resolveMediaTypeFromFile(file);

    if (media === 'video') {
        throw new Error(`${file.name} is a video, and the text models can't watch it. Drop it on the canvas to keep it as a media card.`);
    }

    if (media === 'image') {
        const payload = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = e.target?.result;
                if (typeof url === 'string') resolve(url);
                else reject(new Error(`Could not read ${file.name}.`));
            };
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
            reader.readAsDataURL(file);
        });
        return { id: uuidv4(), kind: 'image', name: file.name, size: file.size, payload };
    }

    if (isDocument(file)) {
        const text = await file.text();
        const trimmed = text.length > MAX_DOCUMENT_CHARS
            ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n…[truncated]`
            : text;
        return { id: uuidv4(), kind: 'document', name: file.name, size: file.size, payload: trimmed };
    }

    throw new Error(`${file.name} isn't something the model can read. Images and text documents work.`);
}

/** The documents, folded into the prompt. Images travel separately. */
export function attachmentPreamble(attachments: AIAttachment[]): string {
    const documents = attachments.filter((a) => a.kind === 'document');
    if (documents.length === 0) return '';
    return `${documents
        .map((doc) => `[ATTACHED FILE — ${doc.name}]\n${doc.payload}`)
        .join('\n\n')}\n\n`;
}

export const attachmentImages = (attachments: AIAttachment[]): string[] =>
    attachments.filter((a) => a.kind === 'image').map((a) => a.payload);
