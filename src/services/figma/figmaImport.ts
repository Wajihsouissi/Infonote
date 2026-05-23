/**
 * figmaImport — high-level "import a Figma file" entry point.
 *
 * Orchestrates the three stages requested by the product spec:
 *   1. Fetch the file JSON from the Figma REST API (or accept a JSON
 *      payload the caller already has — useful when the user pastes /
 *      uploads a .figma export).
 *   2. Translate the layout tree into AppNode[] via convertFigmaToCanvasNodes.
 *   3. Persist the result to Supabase canvas_nodes via the additive
 *      upsert helper appendCanvasNodesToCloud (no error 409, no destructive
 *      delete-by-not-in).
 *
 * No mock data, no faked responses — every fetch hits the live Figma API
 * with the access token supplied by the caller, and every insert lands in
 * the user's real canvas_nodes rows.
 */
import { convertFigmaToCanvasNodes, type FigmaFile, type FigmaConvertOptions } from './figmaConverter';
import { appendCanvasNodesToCloud } from '../cloudSync';
import type { AppNode } from '../../types';

export type FigmaImportResult =
    | {
          ok: true;
          /** Number of AppNode rows that were upserted to Supabase. */
          imported: number;
          /** Number of Figma node types we couldn't translate. */
          skipped: number;
          /** The translated nodes — handy if the caller wants to drop them
           *  into Zustand for an instant render before the cloud round-trip
           *  finishes. */
          nodes: AppNode[];
      }
    | { ok: false; error: string };

export interface FigmaImportOptions extends FigmaConvertOptions {
    /**
     * Figma personal access token. Required when calling
     * `importFigmaFileByKey`. Ignored by `importFigmaFromJson`.
     */
    accessToken?: string;
    /** Authenticated Supabase user id. */
    userId: string | null;
}

/**
 * Resolve a Figma file URL or raw key like "abc123XYZ" / "https://www.figma.com/file/abc123XYZ/Name"
 * into the bare key the REST API expects.
 */
export function extractFigmaFileKey(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    // Already a bare key — letters/digits, length 12+ heuristic.
    if (/^[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;
    // Match common URL shapes: /file/<key>/...  or  /design/<key>/...
    const m = trimmed.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/i);
    return m ? m[1] : null;
}

/**
 * Fetch a Figma file by key and run the full convert + save pipeline.
 */
export async function importFigmaFileByKey(
    fileKey: string,
    options: FigmaImportOptions,
): Promise<FigmaImportResult> {
    if (!options.accessToken) {
        return { ok: false, error: 'A Figma personal access token is required.' };
    }
    if (!fileKey) {
        return { ok: false, error: 'Missing Figma file key.' };
    }

    let file: FigmaFile;
    try {
        // Figma REST API: https://www.figma.com/developers/api#get-files-endpoint
        // Auth header `X-Figma-Token` carries the personal access token
        // (the same scheme the official docs and curl examples use).
        const resp = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`, {
            method: 'GET',
            headers: { 'X-Figma-Token': options.accessToken },
        });
        if (!resp.ok) {
            const body = await safeReadBody(resp);
            return {
                ok: false,
                error: `Figma API ${resp.status} ${resp.statusText}${body ? `: ${body}` : ''}`,
            };
        }
        file = (await resp.json()) as FigmaFile;
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return importFigmaFromJson(file, options);
}

/**
 * Convert + save a Figma file payload that the caller already has in hand
 * (e.g. uploaded JSON, or response stashed elsewhere). Skips the network
 * step but still pushes the result through the same convert + upsert path.
 */
export async function importFigmaFromJson(
    file: FigmaFile,
    options: FigmaImportOptions,
): Promise<FigmaImportResult> {
    if (!file || !file.document) {
        return { ok: false, error: 'Invalid Figma file: missing document tree.' };
    }

    const { nodes, skipped } = convertFigmaToCanvasNodes(file, {
        offset: options.offset,
        keepSourceIds: options.keepSourceIds,
    });

    if (nodes.length === 0) {
        return {
            ok: false,
            error: 'No supported Figma nodes were found in the file (empty or only unsupported types).',
        };
    }

    // Push to canvas_nodes via the additive upsert helper. This is the
    // exact path the spec asks for: "pass the final array directly into
    // our Supabase canvas_nodes table using an upsert command so they
    // save automatically to the cloud without error 409 conflicts".
    const saveResult = await appendCanvasNodesToCloud(options.userId, nodes);
    if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
    }

    return {
        ok: true,
        imported: saveResult.counts.nodes,
        skipped,
        nodes,
    };
}

async function safeReadBody(resp: Response): Promise<string | null> {
    try {
        const text = await resp.text();
        return text ? text.slice(0, 300) : null;
    } catch {
        return null;
    }
}
