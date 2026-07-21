import { v4 as uuidv4 } from 'uuid';
import type { AppNode, BlockNode, KanbanColumn, KanbanNode, NoteNode } from '../../types';
import type { Edge } from '@xyflow/react';
import {
    BrainCircuit, Network, Library,
    GitMerge, Layers, Calendar,
    FileText, Map
} from 'lucide-react';
import React from 'react';

export type TemplateDefinition = {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    /** True when the template depends on the (beta-deferred) Kanban surface. */
    requiresKanban?: boolean;
    getPreviewData: () => { nodes: AppNode[], edges: Edge[] };
    generateNodes: (flowPos: { x: number, y: number }, parentId: string | null) => { nodes: AppNode[], edges: Edge[] };
};

/**
 * Card fill tints, warmed toward the "Paper & Ink" direction so a freshly
 * dropped template reads as one cohesive board instead of a cold rainbow.
 * These are decorative card backgrounds (NoteCard derives readable text by
 * darkening them), so they stay literal here — .ts can't consume var().
 */
const TINT = {
    paper: '#f3efe6',     // neutral warm paper
    persimmon: '#fbe7dc', // accent tint
    amber: '#f9edd6',     // secondary tint
    sage: '#e9f0e3',      // "done" / active green
    sky: '#e8eef4',       // muted reference blue
    blush: '#f7e6e0',     // soft rose
    plain: '#ffffff',
} as const;

// Helper for Edges
const createEdge = (source: string, target: string, parentId?: string | null) => ({
    id: uuidv4(),
    source,
    target,
    type: 'centered',
    data: { parentId: parentId || null }
});

// Unified note builder — preview and generate share it so the hover preview is
// exactly what gets dropped on the canvas (WYSIWYG). `parentId` is null for the
// isolated preview flow and the real container id on generate.
const makeNote = (
    label: string,
    contentStr: string,
    pos: { x: number, y: number },
    parentId: string | null,
    width = 432,
    height = 432,
    icon?: string,
    color?: string
): NoteNode => ({
    id: uuidv4(),
    type: 'note',
    position: pos,
    data: {
        label,
        content: [{ id: uuidv4(), type: 'text', content: contentStr }],
        viewMode: 'expanded',
        showMetadata: false,
        icon,
        color
    },
    style: { width, height },
    ...(parentId ? { parentId } : {})
} as NoteNode);

const makeBlock = (
    contentStr: string,
    type: 'heading2' | 'text' | 'heading1',
    pos: { x: number, y: number },
    parentId: string | null,
    width = 260,
    height = 80
): BlockNode => ({
    id: uuidv4(),
    type: 'block',
    position: pos,
    data: { content: [{ id: uuidv4(), type, content: contentStr }], isStandaloneBlock: true },
    style: { width, height },
    ...(parentId ? { parentId } : {})
} as BlockNode);

const makeKanban = (
    label: string,
    columns: KanbanColumn[],
    pos: { x: number, y: number },
    parentId: string | null,
    width = 900,
    height = 600
): KanbanNode => ({
    id: uuidv4(),
    type: 'kanban',
    position: pos,
    data: { label, columns, viewMode: 'board' },
    style: { width, height },
    ...(parentId ? { parentId } : {})
} as KanbanNode);

/**
 * Each template is expressed once as a pure `build(origin, parentId)` function.
 * Preview calls it at the origin with no parent; generate calls it at the drop
 * position with the current container. This removes the old preview/generate
 * duplication and guarantees the two never drift apart.
 */
type Builder = (o: { x: number, y: number }, parentId: string | null) => { nodes: AppNode[], edges: Edge[] };

const fromBuilder = (build: Builder): Pick<TemplateDefinition, 'getPreviewData' | 'generateNodes'> => ({
    getPreviewData: () => build({ x: 0, y: 0 }, null),
    generateNodes: (pos, parentId) => build(pos, parentId),
});

export const TEMPLATES: TemplateDefinition[] = [
    {
        id: 'zettelkasten',
        name: 'Zettelkasten',
        description: 'Interconnected notes for organic knowledge growth.',
        icon: Network,
        ...fromBuilder((o, p) => {
            const index = makeNote(
                'Index / Hub',
                'Your map of contents. As ideas accumulate, link out to the permanent notes that matter most.\n\n- \n- ',
                { x: o.x, y: o.y }, p, 400, 400, 'Share2', TINT.amber
            );
            const ref1 = makeNote(
                'Literature Note',
                '**Source:**\n**Author:**\n\nKey takeaways in your own words:\n- ',
                { x: o.x - 350, y: o.y + 450 }, p, 300, 300, 'BookOpen', TINT.sky
            );
            const ref2 = makeNote(
                'Literature Note',
                '**Source:**\n**Author:**\n\nKey takeaways in your own words:\n- ',
                { x: o.x + 350, y: o.y + 450 }, p, 300, 300, 'BookOpen', TINT.sky
            );
            const per1 = makeNote(
                'Permanent Note',
                'One idea, fully developed and self-contained. Connect it to the notes it speaks to.\n\n**Links:** ',
                { x: o.x, y: o.y + 800 }, p, 400, 400, 'Star', TINT.paper
            );
            return {
                nodes: [index, ref1, ref2, per1],
                edges: [
                    createEdge(index.id, ref1.id, p),
                    createEdge(index.id, ref2.id, p),
                    createEdge(ref1.id, per1.id, p),
                    createEdge(ref2.id, per1.id, p),
                ]
            };
        })
    },
    {
        id: 'mindmap',
        name: 'Mindmap',
        description: 'Brainstorm and visually organize ideas from a central node.',
        icon: BrainCircuit,
        ...fromBuilder((o, p) => {
            const root = makeBlock('Central Idea', 'heading1', { x: o.x, y: o.y }, p, 320, 100);
            const child1 = makeBlock('Branch 1', 'heading2', { x: o.x - 250, y: o.y + 200 }, p, 220, 80);
            const child2 = makeBlock('Branch 2', 'heading2', { x: o.x + 250, y: o.y + 200 }, p, 220, 80);
            const sub1 = makeBlock('Detail A', 'text', { x: o.x - 350, y: o.y + 350 }, p, 180, 60);
            const sub2 = makeBlock('Detail B', 'text', { x: o.x - 150, y: o.y + 350 }, p, 180, 60);
            return {
                nodes: [root, child1, child2, sub1, sub2],
                edges: [
                    createEdge(root.id, child1.id, p),
                    createEdge(root.id, child2.id, p),
                    createEdge(child1.id, sub1.id, p),
                    createEdge(child1.id, sub2.id, p),
                ]
            };
        })
    },
    {
        id: 'second-brain',
        name: 'Second Brain',
        description: 'A comprehensive setup for capturing and organizing knowledge.',
        icon: Library,
        ...fromBuilder((o, p) => {
            const inbox = makeNote(
                'Inbox',
                'Capture anything here, then sort it into Projects, Areas, or Resources.\n\n- ',
                { x: o.x, y: o.y }, p, 300, 400, 'Inbox', TINT.sky
            );
            const projects = makeNote(
                'Active Projects',
                'Short-term efforts with a clear finish line.\n\n1. \n2. ',
                { x: o.x + 400, y: o.y }, p, 300, 400, 'Folder', TINT.sage
            );
            const areas = makeNote(
                'Areas',
                'Ongoing responsibilities to maintain over time.\n\n- ',
                { x: o.x + 400, y: o.y + 450 }, p, 300, 400, 'PieChart', TINT.persimmon
            );
            return {
                nodes: [inbox, projects, areas],
                edges: [
                    createEdge(inbox.id, projects.id, p),
                    createEdge(inbox.id, areas.id, p),
                ]
            };
        })
    },
    {
        id: 'agile-workflows',
        name: 'Agile Workflows',
        description: 'Track sprints, standups, and backlog using a native Kanban board.',
        icon: GitMerge,
        requiresKanban: true,
        ...fromBuilder((o, p) => {
            const columns: KanbanColumn[] = [
                { id: uuidv4(), label: 'Backlog', statusValue: 'todo', color: '#e2e8f0' },
                { id: uuidv4(), label: 'In Progress', statusValue: 'in-progress', color: '#fef08a' },
                { id: uuidv4(), label: 'Done', statusValue: 'done', color: '#bbf7d0' },
            ];
            const board = makeKanban('Sprint Board', columns, { x: o.x, y: o.y }, p, 900, 600);

            const task1 = makeNote('Task 1', 'Design UI', { x: 50, y: 100 }, board.id, 200, 150, 'CheckSquare', TINT.plain);
            task1.data.status = 'todo';
            task1.data.viewMode = 'icon';

            const task2 = makeNote('Task 2', 'Implement logic', { x: 350, y: 100 }, board.id, 200, 150, 'Code', TINT.plain);
            task2.data.status = 'in-progress';
            task2.data.viewMode = 'icon';

            return { nodes: [board, task1, task2], edges: [] };
        })
    },
    {
        id: 'para-method',
        name: 'PARA Method',
        description: 'Projects, Areas, Resources, Archives.',
        icon: Layers,
        ...fromBuilder((o, p) => {
            const proj = makeNote('Projects', 'Active, short-term efforts with a clear outcome.\n\n- ', { x: o.x, y: o.y }, p, 300, 300, 'Target', TINT.sage);
            const area = makeNote('Areas', 'Ongoing spheres of responsibility to sustain.\n\n- ', { x: o.x + 350, y: o.y }, p, 300, 300, 'Activity', TINT.sky);
            const res = makeNote('Resources', 'Topics and references worth keeping around.\n\n- ', { x: o.x, y: o.y + 350 }, p, 300, 300, 'Book', TINT.amber);
            const arch = makeNote('Archives', 'Completed or inactive items from the other three.', { x: o.x + 350, y: o.y + 350 }, p, 300, 300, 'HardDrive', TINT.paper);
            return { nodes: [proj, area, res, arch], edges: [] };
        })
    },
    {
        id: 'daily-planner',
        name: 'Daily Planner',
        description: 'Structure your day, tasks, and habits.',
        icon: Calendar,
        ...fromBuilder((o, p) => {
            const schedule = makeNote(
                'Schedule',
                '**Morning**\n- \n\n**Afternoon**\n- \n\n**Evening**\n- ',
                { x: o.x, y: o.y }, p, 400, 500, 'Calendar', TINT.sky
            );
            const notes = makeNote('Scratchpad', 'Quick notes and stray thoughts for today.', { x: o.x + 450, y: o.y + 250 }, p, 350, 400, 'Edit', TINT.amber);
            const priorities = makeBlock('Top 3 Priorities\n1. \n2. \n3. ', 'text', { x: o.x + 450, y: o.y }, p, 350, 200);
            return { nodes: [schedule, notes, priorities], edges: [] };
        })
    },
    {
        id: 'meeting-notes',
        name: 'Meeting Notes',
        description: 'Capture attendees, agenda, notes, and action items.',
        icon: FileText,
        ...fromBuilder((o, p) => {
            const details = makeNote('Meeting Details', '**Date:** \n**Attendees:** \n**Agenda:**\n- ', { x: o.x, y: o.y }, p, 300, 300, 'Users', TINT.sky);
            const notes = makeNote('Notes', '## Discussion\n- ', { x: o.x + 350, y: o.y }, p, 500, 600, 'FileText', TINT.plain);
            const actionItems = makeNote('Action Items', '- [ ] \n- [ ] ', { x: o.x, y: o.y + 350 }, p, 300, 250, 'CheckSquare', TINT.amber);
            return { nodes: [details, notes, actionItems], edges: [] };
        })
    },
    {
        id: 'user-story-mapping',
        name: 'User Story Mapping',
        description: 'Map out the user journey and slice releases.',
        icon: Map,
        ...fromBuilder((o, p) => {
            const persona = makeBlock('User Persona', 'heading2', { x: o.x, y: o.y }, p, 250, 80);
            const step1 = makeBlock('Step 1: Discover', 'text', { x: o.x + 300, y: o.y }, p, 250, 80);
            const step2 = makeBlock('Step 2: Engage', 'text', { x: o.x + 600, y: o.y }, p, 250, 80);
            const release1 = makeNote('Release 1 (MVP)', 'The core slice that delivers value first.\n\n- ', { x: o.x + 300, y: o.y + 150 }, p, 550, 250, 'Star', TINT.sage);
            return {
                nodes: [persona, step1, step2, release1],
                edges: [
                    createEdge(persona.id, step1.id, p),
                    createEdge(step1.id, step2.id, p),
                ]
            };
        })
    }
];
