import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../../types';
import type { Block } from '../../../features/editor/types';

/**
 * What a first-time visitor finds on the canvas instead of an empty grid.
 *
 * Three ordinary cards — nothing here is special-cased, so deleting them is
 * just deleting cards. They teach by being the thing: the middle card is
 * written so that opening it draws a mind map, which is the one feature nobody
 * discovers from a blank page.
 *
 * Shown once per browser. The marker lives in localStorage rather than being
 * inferred from an empty workspace, so someone who clears their canvas is not
 * greeted again as a stranger.
 */

const WELCOMED_KEY = 'chnk-it-welcomed';

export function hasBeenWelcomed(): boolean {
    try {
        return localStorage.getItem(WELCOMED_KEY) !== null;
    } catch {
        // Storage blocked: the workspace cannot be kept either, so a demo
        // canvas that vanishes on reload would only mislead.
        return true;
    }
}

export function markWelcomed(): void {
    try {
        localStorage.setItem(WELCOMED_KEY, String(Date.now()));
    } catch {
        /* nothing to remember it in */
    }
}

const block = (type: Block['type'], content: string, extra: Partial<Block> = {}): Block =>
    ({ id: uuidv4(), type, content, ...extra }) as Block;

function card(label: string, icon: string, x: number, height: number, content: Block[]): AppNode {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        type: 'note',
        position: { x, y: 0 },
        style: { width: 432, height },
        data: { label, icon, viewMode: 'expanded', content, createdAt: now, updatedAt: now },
    } as AppNode;
}

export function welcomeCanvas(): { nodes: AppNode[]; edges: Edge[] } {
    const start = card('Start here', 'Home', 0, 488, [
        block('text', 'This is a canvas of cards. Every card is a full document.'),
        block('bullet', 'Press Ctrl+N for a new card.'),
        block('bullet', 'Click a card to write in it. Open it for the full page.'),
        block('bullet', 'Drag one card onto another to put it inside.'),
        block('bullet', 'Drag a line from a card’s edge to connect two ideas.'),
        block('callout', 'Your work is saved in this browser only. Keep a backup file from the person icon at the top right.'),
    ]);

    const map = card('Open me: a note that maps itself', 'Network', 504, 488, [
        block('heading2', 'A weekend in Lisbon'),
        block('heading3', 'Where to stay'),
        block('bullet', 'Alfama, for the old streets'),
        block('bullet', 'Príncipe Real, for quiet'),
        block('heading3', 'What to eat'),
        block('bullet', 'Pastéis de nata in Belém'),
        block('bullet', 'Grilled sardines'),
        block('heading3', 'What to see'),
        block('bullet', 'Tram 28 at sunrise'),
        block('bullet', 'The view from Senhora do Monte'),
    ]);

    const tryIt = card('Things to try', 'CheckSquare', 1008, 432, [
        block('todo', 'Open the Lisbon card and watch its mind map appear'),
        block('todo', 'Change a heading in the map — the note follows'),
        block('todo', 'Type / in a card to add a table, code or an image'),
        block('todo', 'Drag a photo from your computer onto the canvas'),
        block('todo', 'Sign in and press Ctrl+J to ask the assistant'),
    ]);

    const edges: Edge[] = [{
        id: uuidv4(),
        source: start.id,
        target: map.id,
        type: 'centered',
        data: { parentId: null },
    }];

    return { nodes: [start, map, tryIt], edges };
}
