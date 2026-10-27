import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import { matchMarkerShortcut } from './markdownShortcuts';
import { isTableDelimiterLine, normalizeTableRows, splitTableCells } from './markdownTables';

/**
 * Plain text to blocks.
 *
 * This is the one parser for typed markdown, pasted markdown and anything a
 * model wrote: the marker rules come from `markdownShortcuts`, so a shortcut
 * cannot mean one thing while typing and another while pasting.
 */

interface ExtractedLink {
    url: string;
    label?: string;
}

function parseExactLinkLine(trimmedLine: string): ExtractedLink | null {
    // Strips common markdown line prefixes: * , - , • , > , 1. etc.
    const cleanLine = trimmedLine.replace(/^([-*•>\s]|\d+\.\s)+/, '').trim();
    
    // Check 1: Exact Markdown Link: [Label](URL)
    const markdownMatch = cleanLine.match(/^\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s()<>]+)\)$/i);
    if (markdownMatch) {
        return {
            url: markdownMatch[2],
            label: markdownMatch[1]
        };
    }
    
    // Check 2: Exact Raw URL: http://... or www....
    const rawMatch = cleanLine.match(/^((?:https?:\/\/|www\.)[^\s()<>]+(?:\([\w\d]+\)|[^\s`!()[\]{};:'".,<>?«»“”‘’]))$/i);
    if (rawMatch) {
        return {
            url: rawMatch[1]
        };
    }
    
    return null;
}

export function parsePlainText(text: string): Block[] {
    // Keep inline markdown markers (**bold**, *italic*, `code`, ~~strike~~) intact —
    // renderContentWithLinks turns them into styled HTML at render time. Stripping
    // them here (as we used to with **) flattened all emphasis out of AI output.
    const cleanText = text;
    const blocks: Block[] = [];
    const lines = cleanText.split(/\r\n|\r|\n/);

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // --- Standalone Link block conversion ---
        const exactLink = parseExactLinkLine(trimmed);
        if (exactLink) {
            blocks.push({
                id: uuidv4(),
                type: 'link',
                content: exactLink.url.startsWith('http') ? exactLink.url : 'https://' + exactLink.url,
                metadata: {
                    displayMode: 'bookmark',
                    isLoading: true,
                    customTitle: exactLink.label
                }
            });
            i++;
            continue;
        }

        // --- Fenced Code Block (``` ... ```) ---
        if (trimmed.startsWith('```')) {
            const codeLines: string[] = [];
            i++; // skip opening fence
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++; // skip closing fence
            blocks.push({
                id: uuidv4(),
                type: 'code',
                content: codeLines.join('\n')
            });
            continue;
        }

        // --- Markdown Table ---
        /* Outer pipes are optional in GFM and models drop them often enough to
           matter, but a lone sentence containing " | " must not become a table.
           A bare header only counts when the very next line is a delimiter row
           of the same width \u2014 the pair GFM itself requires. */
        const pipedTable = trimmed.startsWith('|') && trimmed.endsWith('|');
        const bareTable = !pipedTable
            && trimmed.includes('|')
            && lines[i + 1] != null
            && isTableDelimiterLine(lines[i + 1])
            && splitTableCells(lines[i + 1]).length === splitTableCells(trimmed).length;

        if (pipedTable || bareTable) {
            const rawRows: string[][] = [];
            while (i < lines.length) {
                const tline = lines[i].trim();
                const isRow = pipedTable ? tline.startsWith('|') : tline.includes('|');
                if (!isRow) break;
                rawRows.push(splitTableCells(tline));
                i++;
            }

            // Delimiter rows, glued rows and ragged widths are all settled here.
            const tableRows = normalizeTableRows(rawRows);
            if (tableRows.length > 0) {
                blocks.push({
                    id: uuidv4(),
                    type: 'table',
                    content: '',
                    metadata: {
                        rows: tableRows
                    }
                });
            }
            continue;
        }

        /* --- Markdown markers (headings, divider, to-do, lists, quote) ---
           Shared with the typed shortcuts via one rule table, so the two can no
           longer disagree. They used to be written out separately here and in
           BlockEditor, which is how typing "- " came to make a checkbox while
           pasting "- " made a bullet. */
        const marker = matchMarkerShortcut(trimmed, 'paste');
        if (marker) {
            const previousBlock = blocks.at(-1);
            const sourceListNumber = marker.rule.type === 'numbered'
                ? Number.parseInt(trimmed.match(/^(\d+)\./)?.[1] || '1', 10)
                : undefined;
            // Markdown permits every item to be written as `1.`.  Preserve the
            // declared starting value, then turn each consecutive numbered
            // item into an actual sequence. The value travels with an AI-made
            // card when a create action splits the list across the canvas.
            const listNumber = marker.rule.type === 'numbered'
                ? previousBlock?.type === 'numbered'
                    ? (typeof previousBlock.metadata?.listNumber === 'number' ? previousBlock.metadata.listNumber + 1 : 2)
                    : sourceListNumber
                : undefined;
            const metadata = {
                ...marker.metadata,
                ...(typeof listNumber === 'number' ? { listNumber } : {}),
            };
            blocks.push({
                id: uuidv4(),
                type: marker.rule.type,
                content: marker.rest,
                ...(Object.keys(metadata).length > 0 ? { metadata } : {})
            });
            i++;
            continue;
        }

        // --- Empty Line ---
        if (trimmed.length === 0) {
            // Only add empty text blocks if there's content before and after
            // to avoid excessive empty blocks
            if (blocks.length > 0 && i < lines.length - 1 && lines[i + 1]?.trim()) {
                blocks.push({ id: uuidv4(), type: 'text', content: '' });
            }
            i++;
            continue;
        }

        // --- Default: Plain Text ---
        blocks.push({
            id: uuidv4(),
            type: 'text',
            content: line
        });
        i++;
    }

    return blocks;
}
