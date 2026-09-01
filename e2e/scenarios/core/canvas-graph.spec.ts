import { test, expect } from '../../support/fixtures';
import {
    addNote, clickEmptyCanvas, confirmNodeDeletion, deleteNode, fitView, focusNode, nodeById, nodeId,
    openCanvas, PANE, selectNode,
} from '../../support/canvas';
import { nodeByLabel, nodesOnCanvas, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * QA scenarios B7 / B8 / B9 — the canvas as a graph.
 *
 * Cards are only half the product; the other half is how they relate. These
 * cover selecting several at once, wiring them together, and drilling into a
 * card's own nested canvas without losing the way back.
 */

/** Drags from one card's source handle to another's target handle. */
async function connect(page: Parameters<typeof openCanvas>[0], from: ReturnType<typeof nodeById>, to: ReturnType<typeof nodeById>) {
    const source = from.locator('.react-flow__handle.source').first();
    const target = to.locator('.react-flow__handle.target').first();
    await expect(source).toBeAttached();
    await expect(target).toBeAttached();

    const a = (await source.boundingBox())!;
    const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // React Flow needs intermediate moves to register a connection drag; a
    // single jump from source to target is treated as a click.
    await page.mouse.move(a.x + (b.x - a.x) / 2, a.y + (b.y - a.y) / 2, { steps: 8 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
}

/** Generated layouts use the node's persisted footprint before React Flow has
 * measured every off-screen card. This checks the same rectangles the layout
 * engine was given, rather than relying on a particular browser zoom. */
function overlappingPairs(nodes: ReturnType<typeof nodesOnCanvas>): string[] {
    const footprint = (node: typeof nodes[number]) => ({
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
        width: node.style?.width ?? node.measured?.width ?? 320,
        height: node.style?.height ?? node.measured?.height ?? 160,
    });
    const collisions: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = footprint(nodes[i]);
            const b = footprint(nodes[j]);
            if (a.x < b.x + b.width && a.x + a.width > b.x
                && a.y < b.y + b.height && a.y + a.height > b.y) {
                collisions.push(`${nodes[i].id} overlaps ${nodes[j].id}`);
            }
        }
    }
    return collisions;
}

test.describe('core: canvas graph (B)', () => {
    test('B8 cards can be connected and the edge is retained in the canvas graph', async ({ page }) => {
        await openCanvas(page);
        const a = await addNote(page, 'Source card');
        const b = await addNote(page, 'Target card');
        await fitView(page);
        await clickEmptyCanvas(page);

        const before = (await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Target card'), 'both cards')).edges.length;
        await connect(page, a, b);

        const snap = await waitForCanvasState(page, (s) => s.edges.length === before + 1, 'a new edge');
        const edge = snap.edges[snap.edges.length - 1];
        expect(edge.source).toBe(await nodeId(a));
        expect(edge.target).toBe(await nodeId(b));

        const after = await waitForCanvasState(page, (s) => s.edges.some((candidate) => candidate.id === edge.id), 'the live canvas graph');
        expect(
            after.edges.some((e) => e.source === edge.source && e.target === edge.target),
            'the connection was not retained in the canvas graph',
        ).toBe(true);
    });

    test('B8b deleting a card takes its edges with it', async ({ page }) => {
        await openCanvas(page);
        const a = await addNote(page, 'Keeps existing');
        const b = await addNote(page, 'Gets deleted');
        await fitView(page);
        await clickEmptyCanvas(page);

        await connect(page, a, b);
        const withEdge = await waitForCanvasState(page, (s) => s.edges.length > 0, 'the connection');
        const bId = await nodeId(b);
        expect(withEdge.edges.some((e) => e.source === bId || e.target === bId)).toBe(true);

        await focusNode(page, b);
        await deleteNode(page, b);

        const after = await waitForCanvasState(page, (s) => !s.nodes.some((n) => n.id === bId), 'the card to be deleted');
        expect(
            after.edges.filter((e) => e.source === bId || e.target === bId),
            'an orphan edge was left pointing at a deleted card',
        ).toEqual([]);
    });

    test('B8c a card cannot be connected to itself', async ({ page }) => {
        await openCanvas(page);
        const a = await addNote(page, 'Self loop attempt');
        await fitView(page);
        await clickEmptyCanvas(page);

        const before = (await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Self loop attempt'), 'the card')).edges.length;
        await connect(page, a, a);
        await page.waitForTimeout(1500);

        const after = await waitForCanvasState(page, () => true, 'the board after the self-connect attempt');
        const id = await nodeId(a);
        expect(
            after.edges.filter((e) => e.source === id && e.target === id),
            'a self-loop edge was created',
        ).toEqual([]);
        expect(after.edges.length).toBe(before);
    });

    test('B8d releasing a dense note keeps every resulting card in its own lane', async ({ page }) => {
        await openCanvas(page);
        const sourceId = 'release-layout-source';
        await seedCanvasState(page, [{
            id: sourceId,
            type: 'fused-note',
            position: { x: 112, y: 112 },
            style: { width: 432, height: 260 },
            data: {
                content: [
                    { id: 'release-heading-one', type: 'heading1', content: 'Preparation' },
                    { id: 'release-long-text', type: 'text', content: 'A long instruction card with enough writing to use the largest normal text footprint and expose any collision in the released branch.' },
                    { id: 'release-code', type: 'code', content: 'const rule = "place the verb second";' },
                    { id: 'release-heading-two', type: 'heading1', content: 'Practice' },
                    { id: 'release-table', type: 'table', content: '', metadata: { rows: [['Prompt', 'Answer'], ['Where does the verb go?', 'Second position']] } },
                    { id: 'release-example', type: 'text', content: 'Write several examples and identify the subject, verb, and remaining phrase.' },
                ],
                isStandaloneBlock: false,
            },
        }]);

        await page.evaluate((id) => {
            const store = (window as unknown as { __appStore?: { getState: () => {
                releaseNodeContentToBlocks: (nodeId: string, position: { x: number; y: number }, skipConfirm: boolean) => void;
            } } }).__appStore;
            store?.getState().releaseNodeContentToBlocks(id, { x: 112, y: 112 }, true);
        }, sourceId);

        const state = await waitForCanvasState(
            page,
            (canvas) => !canvas.nodes.some((node) => node.id === sourceId) && nodesOnCanvas(canvas).length === 6,
            'the released content cards',
        );
        expect(overlappingPairs(nodesOnCanvas(state)), 'released cards must never overlap').toEqual([]);
        expect(state.edges, 'peer sections should not gain a connector through one another').toHaveLength(4);
    });

    test('B7 several cards can be selected at once and deleted together', async ({ page }) => {
        await openCanvas(page);
        const a = await addNote(page, 'Bulk one');
        const b = await addNote(page, 'Bulk two');
        await fitView(page);
        await clickEmptyCanvas(page);

        // No Escape between the two clicks: Escape clears the canvas selection,
        // so blurring the first card's editor that way would also drop it from
        // the selection and the shift-click would look like a fresh single pick.
        // A multi-selection is a manipulation mode and mounts no editor, so
        // there is nothing to blur before Delete anyway.
        await selectNode(a);
        await selectNode(b, ['Shift']);
        await page.waitForTimeout(600);

        // The multi-selection toolbar is the product's own confirmation that
        // more than one card is selected.
        // The count sits in its own badge element next to the words, so read
        // the whole toolbar rather than matching one text node.
        const selectionToolbar = page
            .getByText(/items? selected/)
            .locator('xpath=..');
        await expect(
            selectionToolbar,
            'no multi-selection toolbar after shift-clicking a second card',
        ).toBeVisible({ timeout: 10_000 });
        await expect(
            selectionToolbar,
            'shift-click replaced the selection instead of adding to it',
        ).toHaveText(/2\s*items selected/);

        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        const after = await waitForCanvasState(
            page,
            (s) => !nodeByLabel(s, 'Bulk one') && !nodeByLabel(s, 'Bulk two'),
            'both selected cards to be deleted',
        );
        // The rest of the board must be untouched.
        expect(after.nodes.length).toBeGreaterThan(0);
    });

    test('B9 opening a card drills into its own canvas and breadcrumbs lead back', async ({ page }) => {
        await openCanvas(page);
        const parent = await addNote(page, 'Parent page');
        const parentId = await nodeId(parent);
        await focusNode(page, parent);
        await parent.hover({ force: true }).catch(() => { /* toolbar may be pinned */ });

        const rootCount = nodesOnCanvas(
            await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Parent page'), 'the parent card'),
            null,
        ).length;

        await parent.getByTitle('Open Card', { exact: true }).first().click();
        await page.waitForTimeout(1200);

        // We are now inside the card's own canvas: the breadcrumb names it.
        await expect(
            page.getByText('Parent page').first(),
            'no breadcrumb naming the card after opening it',
        ).toBeVisible();

        // A card made here belongs to the parent, not to the root canvas.
        const child = await addNote(page, 'Child card');
        await expect(child).toBeVisible();
        const nested = await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Child card'), 'the nested card');
        expect(
            nodeByLabel(nested, 'Child card')!.parentId,
            'a card created inside a page was filed on the root canvas instead',
        ).toBe(parentId);

        // Breadcrumb home returns to the root canvas, with the root unchanged.
        // The home crumb is an icon-only button with no accessible name (see
        // B9b), so it has to be reached structurally: first button in the
        // breadcrumb strip that also holds the current page's crumb.
        const crumbStrip = page
            .getByRole('button', { name: 'Parent page' })
            .locator('xpath=ancestor::div[contains(@class,"_container_")][1]');
        await crumbStrip.getByRole('button').first().click();
        await page.waitForTimeout(1500);
        await expect(page.locator(PANE)).toBeVisible();

        const back = await waitForCanvasState(page, (s) => !!nodeByLabel(s, 'Child card'), 'the document after navigating back');
        expect(
            nodesOnCanvas(back, null).length,
            'the nested card leaked onto the root canvas',
        ).toBe(rootCount);
    });

    test('B9b deleting a card removes its entire nested branch', async ({ page }) => {
        await openCanvas(page);
        const parent = await addNote(page, 'Branch parent');
        const parentId = await nodeId(parent);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const child = await addNote(page, 'Branch child');
        const childId = await nodeId(child);
        await page.getByRole('button', { name: 'Canvas home' }).click();
        await expect(nodeById(page, parentId)).toBeVisible({ timeout: 15_000 });
        await deleteNode(page, nodeById(page, parentId));

        const state = await waitForCanvasState(
            page,
            (canvas) => !canvas.nodes.some((node) => [parentId, childId].includes(node.id)),
            'the nested branch to be deleted',
        );
        expect(state.nodes.some((node) => [parentId, childId].includes(node.id))).toBe(false);
        expect(state.edges.some((edge) => [parentId, childId].includes(edge.source) || [parentId, childId].includes(edge.target))).toBe(false);
    });

    test('B9c duplicating a parent creates an independent nested branch', async ({ page }) => {
        await openCanvas(page);
        const parent = await addNote(page, 'Copy parent');
        const parentId = await nodeId(parent);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const child = await addNote(page, 'Copy child');
        const childId = await nodeId(child);
        await waitForCanvasState(
            page,
            (state) => nodesOnCanvas(state, parentId).some((node) => node.id === childId),
            'the nested child',
        );
        await waitForCanvasState(
            page,
            (state) => {
                const sourceParent = state.nodes.find((node) => node.id === parentId);
                const blocks = sourceParent?.data?.content;
                return Array.isArray(blocks) && blocks.some((block) =>
                    typeof block === 'object' &&
                    block !== null &&
                    (block as { type?: string; metadata?: { nodeId?: string } }).type === 'page' &&
                    (block as { metadata?: { nodeId?: string } }).metadata?.nodeId === childId,
                );
            },
            'the parent page link to its nested child',
        );

        await page.getByRole('button', { name: 'Canvas home' }).click();
        await focusNode(page, nodeById(page, parentId));
        const before = (await waitForCanvasState(page, (state) => !!nodeByLabel(state, 'Copy parent'), 'the original branch')).nodes.length;
        await page.keyboard.press('Control+d');

        const duplicated = await waitForCanvasState(
            page,
            (state) => state.nodes.length === before + 2,
            'the copied parent and child',
        );
        const copiedParent = nodesOnCanvas(duplicated, null).find(
            (node) => node.id !== parentId && node.data?.label === 'Copy parent',
        );
        expect(copiedParent, 'the parent card was not duplicated on the root canvas').toBeDefined();
        const copiedChild = nodesOnCanvas(duplicated, copiedParent!.id).find((node) => node.data?.label === 'Copy child');
        expect(copiedChild, 'the duplicate still points at the original nested child').toBeDefined();
        expect(copiedChild!.id).not.toBe(childId);

        const copiedPageBlock = (copiedParent!.data?.content as Array<{ type?: string; metadata?: { nodeId?: string } }> | undefined)
            ?.find((block) => block.type === 'page');
        expect(copiedPageBlock?.metadata?.nodeId, 'the copied parent retained the original page link').toBe(copiedChild!.id);
    });

    test('B9d an empty nested canvas explains where a new card will go', async ({ page }) => {
        await openCanvas(page);
        const parent = await addNote(page, 'Empty parent');
        const parentId = await nodeId(parent);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        await expect(page.getByRole('heading', { name: /ready for its first idea/i })).toBeVisible();
        await page.getByRole('button', { name: /Add a card/i }).click();
        await waitForCanvasState(
            page,
            (state) => nodesOnCanvas(state, parentId).length === 1,
            'a card created from the empty nested canvas state',
        );
    });

    test('B9e opening a card ignores blank blocks and dividers', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'composition-only-parent';
        await seedCanvasState(page, [{
            id: parentId,
            type: 'note',
            position: { x: 96, y: 96 },
            style: { width: 432, height: 260 },
            data: {
                label: 'Composition only',
                viewMode: 'expanded',
                content: [
                    { id: 'blank-before', type: 'text', content: '\u200B' },
                    { id: 'section-rule', type: 'divider', content: '' },
                    { id: 'blank-after', type: 'text', content: '  ' },
                ],
            },
        }]);

        const parent = nodeById(page, parentId);
        await expect(parent).toBeVisible();
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        await expect(page.getByRole('heading', { name: /ready for its first idea/i })).toBeVisible();
        const state = await waitForCanvasState(page, (canvas) => nodesOnCanvas(canvas, parentId).length === 0, 'a clean nested canvas');
        expect(state.nodes.find((node) => node.id === parentId)?.data?.content).toHaveLength(3);
    });

    test('B9f entering a written card creates a top-to-bottom document tree without an import prompt', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'automatic-topic-map-parent';
        await seedCanvasState(page, [{
            id: parentId,
            type: 'note',
            position: { x: 96, y: 96 },
            style: { width: 432, height: 260 },
            data: {
                label: 'Product strategy',
                viewMode: 'expanded',
                content: [
                    { id: 'research-heading', type: 'heading1', content: 'Research' },
                    { id: 'research-idea', type: 'text', content: 'Interview readers who struggle to organise long notes.' },
                    { id: 'editor-rule', type: 'divider', content: '' },
                    { id: 'build-heading', type: 'heading1', content: 'Build' },
                    { id: 'build-idea', type: 'text', content: 'Make the first canvas explain the note as a map.' },
                ],
            },
        }]);

        const parent = nodeById(page, parentId);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        await expect(page.getByRole('heading', { name: /Bring .*meaningful blocks/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Import .*blocks/i })).toHaveCount(0);
        await expect(page.getByText('Note + map synced', { exact: true })).toHaveCount(0);
        const state = await waitForCanvasState(
            page,
            (canvas) => {
                const nested = nodesOnCanvas(canvas, parentId);
                const chapters = nested.filter((node) => node.data?.mapRole === 'chapter');
                return !nested.some((node) => node.data?.mapRole === 'topic-root') && chapters.length === 2;
            },
            'the automatically generated document tree',
        );
        const nested = nodesOnCanvas(state, parentId);
        const chapters = nested.filter((node) => node.data?.mapRole === 'chapter');
        expect(nested.some((node) => node.data?.mapRole === 'topic-root')).toBe(false);
        expect(state.edges.filter((edge) => chapters.some((chapter) => edge.source === chapter.id || edge.target === chapter.id))).toHaveLength(0);

        const representedBlockIds = nested
            .flatMap((node) => Array.isArray(node.data?.content) ? node.data.content : [])
            .map((block) => (block as { id?: string }).id);
        expect(representedBlockIds).toEqual(expect.arrayContaining([
            'research-heading', 'research-idea', 'build-heading', 'build-idea',
        ]));
        expect(state.nodes.find((node) => node.id === parentId)?.data?.nestedCanvasSync).toBe('synced');
    });

    test('B9f0 an existing centre-topic map becomes a top-to-bottom document tree', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'legacy-topic-map-parent';
        const topicId = 'legacy-topic-root';
        const chapterId = 'legacy-topic-chapter';
        const sectionId = 'legacy-topic-section';
        await seedCanvasState(page, [
            {
                id: parentId,
                type: 'note',
                position: { x: 96, y: 96 },
                style: { width: 432, height: 260 },
                data: {
                    label: 'Existing lesson plan',
                    viewMode: 'expanded',
                    hasNestedCanvasSync: true,
                    nestedCanvasSync: 'synced',
                    content: [
                        { id: 'legacy-chapter-block', type: 'heading1', content: 'Verb position' },
                        { id: 'legacy-section-block', type: 'heading2', content: 'Main clauses' },
                    ],
                },
            },
            {
                id: topicId,
                type: 'fused-note',
                parentId,
                position: { x: 0, y: 0 },
                style: { width: 288, height: 128 },
                data: { label: 'Existing lesson plan', content: [], mapRole: 'topic-root', isStandaloneBlock: false },
            },
            {
                id: chapterId,
                type: 'fused-note',
                parentId,
                position: { x: 520, y: -220 },
                style: { width: 432, height: 160 },
                data: { content: [{ id: 'legacy-chapter-block', type: 'heading1', content: 'Verb position' }], mapRole: 'chapter', isStandaloneBlock: true },
            },
            {
                id: sectionId,
                type: 'fused-note',
                parentId,
                position: { x: 980, y: -220 },
                style: { width: 432, height: 160 },
                data: { content: [{ id: 'legacy-section-block', type: 'heading2', content: 'Main clauses' }], mapRole: 'section', isStandaloneBlock: true },
            },
        ], [
            { id: 'legacy-topic-edge', source: topicId, target: chapterId },
            { id: 'legacy-hierarchy-edge', source: chapterId, target: sectionId },
        ]);

        const parent = nodeById(page, parentId);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const state = await waitForCanvasState(
            page,
            (canvas) => !canvas.nodes.some((node) => node.id === topicId)
                && canvas.nodes.some((node) => node.id === chapterId)
                && canvas.nodes.some((node) => node.id === sectionId),
            'the legacy title node to be removed',
        );
        const chapter = state.nodes.find((node) => node.id === chapterId)!;
        const section = state.nodes.find((node) => node.id === sectionId)!;
        expect(section.position!.y).toBeGreaterThan(chapter.position!.y);
        expect(state.edges.some((edge) => edge.source === chapterId && edge.target === sectionId)).toBe(true);
        expect(state.edges.some((edge) => edge.source === topicId || edge.target === topicId)).toBe(false);
    });

    test('B9f1 a deeply structured note builds a clear top-to-bottom tree', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'dense-topic-map-parent';
        await seedCanvasState(page, [{
            id: parentId,
            type: 'note',
            position: { x: 96, y: 96 },
            style: { width: 432, height: 260 },
            data: {
                label: 'German grammar',
                viewMode: 'expanded',
                content: [
                    { id: 'main-1', type: 'heading1', content: 'Main clauses' },
                    { id: 'main-1-body', type: 'text', content: 'A long explanation of how the conjugated verb takes the second position in a declarative sentence, including enough detail to create a tall card.' },
                    { id: 'main-1a', type: 'heading2', content: 'Statement order' },
                    { id: 'main-1a-body', type: 'text', content: 'Place the subject first, then the verb, and place the remaining information after it. This deliberately makes a second substantial card.' },
                    { id: 'main-1b', type: 'heading3', content: 'Question pattern' },
                    { id: 'main-1b-body', type: 'text', content: 'Use a verb-first question when asking for a direct yes or no answer.' },
                    { id: 'main-1c', type: 'heading2', content: 'Time and place' },
                    { id: 'main-1c-body', type: 'text', content: 'Keep time, manner, and place details in their familiar order.' },
                    { id: 'main-2', type: 'heading1', content: 'Subordinate clauses' },
                    { id: 'main-2-body', type: 'text', content: 'Subordinate clauses move the conjugated verb to the end of the clause.' },
                    { id: 'main-2a', type: 'heading2', content: 'Conjunctions' },
                    { id: 'main-2a-body', type: 'text', content: 'Words such as weil, dass, wenn, and ob introduce useful patterns.' },
                    { id: 'main-2b', type: 'heading2', content: 'Modal verbs' },
                    { id: 'main-2b-body', type: 'text', content: 'Infinitives remain at the end even when a modal verb is present.' },
                ],
            },
        }]);

        const parent = nodeById(page, parentId);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const state = await waitForCanvasState(
            page,
            (canvas) => nodesOnCanvas(canvas, parentId).length >= 7,
            'the dense generated document tree',
        );
        const mapNodes = nodesOnCanvas(state, parentId);
        const chapters = mapNodes.filter((node) => node.data?.mapRole === 'chapter');
        expect(new Set(chapters.map((chapter) => chapter.position?.y)).size,
            'main sections should align across the top row on desktop').toBe(1);
        const hierarchyEdges = state.edges.filter((edge) => (
            mapNodes.some((node) => node.id === edge.source)
            && mapNodes.some((node) => node.id === edge.target)
        ));
        hierarchyEdges.forEach((edge) => {
            const parent = mapNodes.find((node) => node.id === edge.source)!;
            const child = mapNodes.find((node) => node.id === edge.target)!;
            expect(child.position!.y, `child ${child.id} must sit below ${parent.id}`).toBeGreaterThan(parent.position!.y);
        });
        expect(overlappingPairs(mapNodes), 'generated map cards must never overlap').toEqual([]);
    });

    test('B9f2 a narrow screen keeps the same top-to-bottom tree without overlap', async ({ page }) => {
        await page.setViewportSize({ width: 640, height: 800 });
        await openCanvas(page);
        const parentId = 'compact-topic-map-parent';
        await seedCanvasState(page, [{
            id: parentId,
            type: 'note',
            position: { x: 96, y: 96 },
            style: { width: 432, height: 260 },
            data: {
                label: 'Compact research plan',
                viewMode: 'expanded',
                content: [
                    { id: 'compact-one', type: 'heading1', content: 'Discover' },
                    { id: 'compact-one-body', type: 'text', content: 'Interview readers about the way they work with long notes.' },
                    { id: 'compact-one-child', type: 'heading2', content: 'Interview guide' },
                    { id: 'compact-one-child-body', type: 'text', content: 'Ask people to describe how they turn a long note into a usable plan.' },
                    { id: 'compact-two', type: 'heading1', content: 'Decide' },
                    { id: 'compact-two-body', type: 'text', content: 'Choose the clearest next improvement from their answers.' },
                    { id: 'compact-two-child', type: 'heading2', content: 'Decision rule' },
                    { id: 'compact-two-child-body', type: 'text', content: 'Prefer the change that makes the first map easier to understand.' },
                ],
            },
        }]);

        const parent = nodeById(page, parentId);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const state = await waitForCanvasState(
            page,
            (canvas) => {
                const nested = nodesOnCanvas(canvas, parentId);
                return !nested.some((node) => node.data?.mapRole === 'topic-root')
                    && nested.filter((node) => node.data?.mapRole === 'chapter').length === 2
                    && nested.filter((node) => node.data?.mapRole === 'section').length === 2;
            },
            'the compact document tree',
        );
        const mapNodes = nodesOnCanvas(state, parentId);
        const chapters = mapNodes.filter((node) => node.data?.mapRole === 'chapter');
        const sections = mapNodes.filter((node) => node.data?.mapRole === 'section');
        expect(sections.every((section) => chapters.some((chapter) => (
            (section.position?.y ?? 0) > (chapter.position?.y ?? 0)
        )))).toBe(true);
        expect(overlappingPairs(mapNodes), 'compact map cards must never overlap').toEqual([]);
    });

    test('B9g a new written idea joins the generated map without rearranging chapters', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'incremental-topic-map-parent';
        await seedCanvasState(page, [{
            id: parentId,
            type: 'note',
            position: { x: 96, y: 96 },
            style: { width: 432, height: 260 },
            data: {
                label: 'Research plan',
                viewMode: 'expanded',
                content: [
                    { id: 'discover-heading', type: 'heading1', content: 'Discover' },
                    { id: 'discover-note', type: 'text', content: 'Speak with five readers this week.' },
                    { id: 'decide-heading', type: 'heading1', content: 'Decide' },
                    { id: 'decide-note', type: 'text', content: 'Choose the first workflow to improve.' },
                ],
            },
        }]);

        const parent = nodeById(page, parentId);
        await focusNode(page, parent);
        await parent.getByTitle('Open Card', { exact: true }).first().click();

        const mapped = await waitForCanvasState(
            page,
            (canvas) => nodesOnCanvas(canvas, parentId).filter((node) => node.data?.mapRole === 'chapter').length === 2,
            'the generated chapters',
        );
        const chapter = nodesOnCanvas(mapped, parentId).find((node) => node.data?.mapRole === 'chapter')!;
        const chapterPosition = chapter.position;

        await page.evaluate((id) => {
            const store = (window as unknown as { __appStore?: { getState: () => {
                navigateToNode: (nodeId: string | null) => void;
                updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
                nodes: Array<{ id: string; data?: { content?: unknown[] } }>;
            } } }).__appStore;
            const state = store?.getState();
            const parentNode = state?.nodes.find((node) => node.id === id);
            const currentContent = Array.isArray(parentNode?.data?.content) ? parentNode.data.content : [];
            state?.navigateToNode(null);
            state?.updateNodeData(id, {
                content: [
                    ...currentContent,
                    { id: 'new-code', type: 'code', content: 'const study = "launch usability review";' },
                    { id: 'new-idea', type: 'text', content: 'Add a short usability study after launch.' },
                    { id: 'new-table', type: 'table', content: '', metadata: { rows: [['Owner', 'Date'], ['Research', 'Friday']] } },
                    { id: 'new-media', type: 'media', content: 'https://example.com/research.png' },
                ],
            });
        }, parentId);

        const updated = await waitForCanvasState(
            page,
            (canvas) => {
                const nested = nodesOnCanvas(canvas, parentId);
                const newIdea = nested.find((node) => Array.isArray(node.data?.content)
                    && node.data.content.some((block) => (block as { id?: string }).id === 'new-idea'));
                return Boolean(newIdea) && !nested.some((node) => node.data?.mapRole === 'topic-root');
            },
            'the new unclassified idea below the document tree',
        );
        const updatedChapter = nodesOnCanvas(updated, parentId).find((node) => node.id === chapter.id)!;
        expect(updatedChapter.position).toEqual(chapterPosition);
        expect(overlappingPairs(nodesOnCanvas(updated, parentId)), 'late map additions must not overlap tall cards').toEqual([]);
        expect(updated.nodes.find((node) => node.id === parentId)?.data?.nestedCanvasSync).toBe('needs-review');
    });

    test('B9h a mapped note reconciles editor and canvas content in both directions', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'two-way-parent';
        const firstBlock = { id: 'idea-a', type: 'text', content: 'Original first idea' };
        const secondBlock = { id: 'idea-b', type: 'text', content: 'Second idea to remove' };
        await seedCanvasState(page, [
            {
                id: parentId,
                type: 'note',
                position: { x: 96, y: 96 },
                style: { width: 432, height: 260 },
                data: {
                    label: 'Two-way note',
                    viewMode: 'expanded',
                    hasNestedCanvasSync: true,
                    nestedCanvasSync: 'synced',
                    content: [firstBlock, secondBlock],
                },
            },
            {
                id: 'idea-a-card',
                type: 'block',
                parentId,
                position: { x: 96, y: 96 },
                style: { width: 300, height: 120 },
                data: { content: [firstBlock, secondBlock], isStandaloneBlock: true },
            },
        ]);

        await page.evaluate(({ parent, original }) => {
            const store = (window as unknown as { __appStore?: { getState: () => { updateNodeData: (id: string, data: Record<string, unknown>) => void } } }).__appStore;
            store?.getState().updateNodeData(parent, {
                content: [
                    { ...original, content: 'Written version of the first idea' },
                    { id: 'idea-c', type: 'text', content: 'A newly written idea' },
                ],
            });
        }, { parent: parentId, original: firstBlock });

        const afterWriting = await waitForCanvasState(
            page,
            (state) => {
                const mapped = state.nodes.find((node) => node.id === 'idea-a-card');
                const mappedBlocks = mapped?.data?.content as Array<{ id?: string; content?: string }> | undefined;
                return mappedBlocks?.length === 1
                    && mappedBlocks[0]?.content === 'Written version of the first idea'
                    && nodesOnCanvas(state, parentId).some((node) =>
                        (node.data?.content as Array<{ id?: string }> | undefined)?.some((block) => block.id === 'idea-c'),
                    );
            },
            'the editor change to reach the map without retaining a stale block',
        );
        expect(nodesOnCanvas(afterWriting, parentId)).toHaveLength(2);

        await page.evaluate(({ parent, card }) => {
            const store = (window as unknown as { __appStore?: { getState: () => {
                navigateToNode: (id: string | null) => void;
                updateNodeData: (id: string, data: Record<string, unknown>) => void;
            } } }).__appStore;
            const state = store?.getState();
            state?.navigateToNode(parent);
            state?.updateNodeData(card, {
                content: [{ id: 'idea-a', type: 'text', content: 'Map version of the first idea' }],
            });
        }, { parent: parentId, card: 'idea-a-card' });

        const afterMapping = await waitForCanvasState(
            page,
            (state) => {
                const content = state.nodes.find((node) => node.id === parentId)?.data?.content as Array<{ id?: string; content?: string }> | undefined;
                return content?.[0]?.content === 'Map version of the first idea'
                    && content?.some((block) => block.id === 'idea-c');
            },
            'the map edit to return to the editor document',
        );
        expect((afterMapping.nodes.find((node) => node.id === parentId)?.data?.content as Array<{ id?: string }>).map((block) => block.id))
            .toEqual(['idea-a', 'idea-c']);
    });

    test('B9h1 a full canvas never drops an editor-only idea during a map edit', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'limited-two-way-parent';
        await seedCanvasState(page, [
            {
                id: parentId,
                type: 'note',
                position: { x: 96, y: 96 },
                style: { width: 432, height: 260 },
                data: {
                    label: 'Limited two-way note',
                    viewMode: 'expanded',
                    hasNestedCanvasSync: true,
                    nestedCanvasSync: 'needs-review',
                    content: [
                        { id: 'mapped-idea', type: 'text', content: 'Mapped idea' },
                        { id: 'editor-only-idea', type: 'text', content: 'Waiting for space on the canvas' },
                    ],
                },
            },
            {
                id: 'limited-map-card',
                type: 'block',
                parentId,
                position: { x: 96, y: 96 },
                style: { width: 300, height: 120 },
                data: { content: [{ id: 'mapped-idea', type: 'text', content: 'Mapped idea' }], isStandaloneBlock: true },
            },
        ]);

        await page.evaluate(({ parent, card }) => {
            const store = (window as unknown as { __appStore?: { getState: () => {
                navigateToNode: (id: string | null) => void;
                updateNodeData: (id: string, data: Record<string, unknown>) => void;
            } } }).__appStore;
            const state = store?.getState();
            state?.navigateToNode(parent);
            state?.updateNodeData(card, {
                content: [{ id: 'mapped-idea', type: 'text', content: 'Edited on the map' }],
            });
        }, { parent: parentId, card: 'limited-map-card' });

        const afterMapEdit = await waitForCanvasState(
            page,
            (state) => {
                const content = state.nodes.find((node) => node.id === parentId)?.data?.content as Array<{ id?: string; content?: string }> | undefined;
                return content?.some((block) => block.id === 'editor-only-idea')
                    && content?.some((block) => block.content === 'Edited on the map');
            },
            'the editor-only idea to survive a map edit while the canvas needs review',
        );
        const parent = afterMapEdit.nodes.find((node) => node.id === parentId)!;
        expect(parent.data?.nestedCanvasSync).toBe('needs-review');
    });

    test('B9i keyboard entry, exit, branch warning, and undo all preserve the card branch', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'keyboard-parent';
        const childId = 'keyboard-child';
        await seedCanvasState(page, [
            {
                id: parentId,
                type: 'note',
                position: { x: 96, y: 96 },
                style: { width: 432, height: 260 },
                data: { label: 'Keyboard parent', viewMode: 'expanded', content: [] },
            },
            {
                id: childId,
                type: 'note',
                parentId,
                position: { x: 96, y: 96 },
                style: { width: 432, height: 260 },
                data: { label: 'Nested child', viewMode: 'expanded', content: [] },
            },
        ]);

        const parent = nodeById(page, parentId);
        await expect(parent).toBeVisible();
        await parent.focus();
        await expect(parent).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Keyboard parent' })).toBeVisible();

        await page.keyboard.press('Alt+ArrowUp');
        await expect(parent).toBeVisible();

        await focusNode(page, parent);
        await page.keyboard.press('Delete');
        const dialog = page.getByRole('alertdialog', { name: 'Delete this knowledge branch?' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveText(/1 selected card and 1 nested card/i);
        await dialog.getByRole('button', { name: 'Keep cards' }).click();
        await waitForCanvasState(page, (state) => state.nodes.some((node) => node.id === parentId), 'the kept branch');

        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        await waitForCanvasState(page, (state) => !state.nodes.some((node) => node.id === parentId), 'the confirmed branch deletion');
        await expect(page.getByText(/Deleted 2 cards/i)).toBeVisible();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await waitForCanvasState(
            page,
            (state) => state.nodes.some((node) => node.id === parentId) && state.nodes.some((node) => node.id === childId),
            'the restored branch',
        );
    });
});
