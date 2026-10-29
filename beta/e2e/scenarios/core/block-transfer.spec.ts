import { test, expect } from '../../support/fixtures';
import { openCanvas, nodeById, selectNode } from '../../support/canvas';
import { seedCanvasState, waitForCanvasState, type CanvasStateNode } from '../../support/canvasState';
import type { AppState } from '../../../src/store/types';
import type { Block } from '../../../src/features/editor/types';

type DragWindow = Window & {
    chnkItMultiDragCleanup?: () => void;
    chnkItGalleryItemTaken?: ((ids: string[]) => void) | null;
    chnkItRemoveDraggedBlocks?: ((ids: string[]) => void) | null;
    chnkItCrossEditorDropHandled?: boolean;
    chnkItBlockDragging?: boolean;
};

const cases = ['note-partial', 'note-empty-fused', 'editor-empty-block', 'canvas-empty-block',
    'canvas-target-partial', 'page-empty-fused', 'same-editor', 'gallery-canvas'] as const;

test.describe('core: block transfer ownership', () => {
    for (const scenario of cases) test(scenario, async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await openCanvas(page);
        const pageTransfer = scenario === 'page-empty-fused';
        const sameEditor = scenario === 'same-editor';
        const gallery = scenario === 'gallery-canvas';
        const partial = scenario === 'note-partial' || scenario === 'canvas-target-partial' || sameEditor;
        const moved: Block = { id: 'moved', type: pageTransfer ? 'page' : gallery ? 'image' : 'text',
            content: pageTransfer ? 'Extracted page' : gallery ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : 'Transferred evidence' };
        const source: CanvasStateNode = { id: 'source', type: scenario.includes('empty-block') ? 'block' : 'fused-note',
            position: { x: 100, y: 100 }, style: { width: 450, height: 300 }, data: { viewMode: 'expanded',
                content: partial ? [moved, { id: 'keep', type: 'text', content: 'Retained evidence' }] : [moved] } };
        if (sameEditor) source.type = 'note';
        const target: CanvasStateNode = { id: 'target', type: 'note', position: { x: 700, y: 100 },
            style: { width: 450, height: 300 }, data: { viewMode: 'expanded',
                content: [{ id: 'target-block', type: 'text', content: 'Destination evidence' }] } };
        await seedCanvasState(page, sameEditor ? [source] : [source, target]);
        await page.evaluate(ids => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids } })), sameEditor ? ['source'] : ['source', 'target']);
        const destination = nodeById(page, sameEditor ? 'source' : 'target');
        await expect(destination.locator('.infonote-scrollable').first()).toBeAttached();
        const editorTransfer = scenario === 'editor-empty-block' || sameEditor;
        if (editorTransfer) {
            await selectNode(destination);
            await expect(destination.locator('[data-chnk-it-block-editor]')).toBeAttached();
        }
        const result = await page.evaluate(async ({ scenario, moved, editorTransfer, sameEditor, gallery }) => {
            const path = '/src/features/editor/drag/blockDragLock.ts';
            const { beginBlockDrag } = await import(/* @vite-ignore */ path);
            const store = (window as unknown as { __appStore: { getState: () => AppState } }).__appStore;
            const pane = document.querySelector('.react-flow__pane')!;
            const target = document.querySelector(`[data-id="${sameEditor ? 'source' : 'target'}"]`)!;
            const bare = scenario === 'canvas-empty-block' || scenario === 'page-empty-fused' || gallery;
            const host = bare ? pane : scenario === 'canvas-target-partial' ? pane
                : target.querySelector(editorTransfer ? '[data-chnk-it-block-editor]' : '.infonote-scrollable')!;
            const box = target.getBoundingClientRect();
            const point = bare ? { clientX: 30, clientY: window.innerHeight - 50 }
                : { clientX: box.x + box.width / 2, clientY: box.y + 30 };
            let cleanup = 0, clears = 0;
            const claimed: string[] = [];
            const countClear = () => { clears++; };
            window.addEventListener('chnk-it-clear-selection', countClear);
            (window as DragWindow).chnkItMultiDragCleanup = () => { cleanup++; };
            if (gallery) (window as DragWindow).chnkItGalleryItemTaken = ids => { claimed.push(...ids); };
            beginBlockDrag();
            const data = new DataTransfer();
            data.setData('application/reactflow-block-type', moved.type);
            data.setData('application/chnk-it-block-id', moved.id);
            data.setData('application/chnk-it-block-data', JSON.stringify({ blocks: [moved], sourceNodeId: gallery ? null : 'source' }));
            host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, ...point }));
            window.removeEventListener('chnk-it-clear-selection', countClear);
            const source = store.getState().nodes.find(node => node.id === 'source');
            return { cleanup, clears, claimed, handled: (window as DragWindow).chnkItCrossEditorDropHandled,
                locked: (window as DragWindow).chnkItBlockDragging, sourceStillPresent: !!source,
                sourceIds: Array.isArray(source?.data.content) ? source.data.content.map(block => block.id) : [],
                galleryCallbackCleared: gallery ? (window as DragWindow).chnkItGalleryItemTaken === null : null };
        }, { scenario, moved, editorTransfer, sameEditor, gallery });
        const standard = !sameEditor;
        expect(result.cleanup).toBe(standard ? 1 : 0);
        expect(result.clears).toBe(standard ? 1 : 0);
        expect(result.handled).toBe(standard);
        expect(result.locked).toBe(pageTransfer || sameEditor);
        expect(result.sourceStillPresent).toBe(true); // empty-source deletion is deferred
        if (!sameEditor && !gallery) expect(result.sourceIds).toEqual(partial ? ['keep'] : []);
        if (gallery) {
            expect(result.claimed).toEqual(['moved']);
            expect(result.galleryCallbackCleared).toBe(true);
        }
        const deletesSource = scenario === 'note-empty-fused' || scenario === 'canvas-empty-block';
        await waitForCanvasState(page, state => {
            const source = state.nodes.find(node => node.id === 'source');
            if (deletesSource) return !source;
            if (!source) return false;
            if (sameEditor) return JSON.stringify(source.data!.content).includes('keep')
                && (source.data!.content as Block[])[0].id === 'keep';
            if (scenario.startsWith('note') || scenario.startsWith('editor') || scenario === 'canvas-target-partial') {
                return (state.nodes.find(node => node.id === 'target')?.data!.content as Block[] | undefined)?.some(block => block.id === 'moved') === true;
            }
            return state.nodes.length === 3;
        });
    });

    test('cross-editor completion releases the lock without consuming multi-drag cleanup', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [{ id: 'target', type: 'note', position: { x: 100, y: 100 },
            style: { width: 450, height: 300 }, data: { viewMode: 'expanded',
                content: [{ id: 'target-block', type: 'text', content: 'Destination evidence' }] } }]);
        const target = nodeById(page, 'target');
        await selectNode(target);
        await expect(target.locator('[data-chnk-it-block-editor]')).toBeAttached();
        const result = await page.evaluate(async () => {
            const path = '/src/features/editor/drag/blockDragLock.ts';
            const { beginBlockDrag } = await import(/* @vite-ignore */ path);
            let cleanup = 0, clears = 0;
            const removed: string[][] = [];
            const onClear = () => { clears++; };
            (window as DragWindow).chnkItMultiDragCleanup = () => { cleanup++; };
            (window as DragWindow).chnkItRemoveDraggedBlocks = ids => { removed.push(ids); };
            window.addEventListener('chnk-it-clear-selection', onClear);
            beginBlockDrag();
            const data = new DataTransfer();
            data.setData('application/reactflow-block-type', 'text');
            data.setData('application/chnk-it-block-id', 'external');
            data.setData('application/chnk-it-editor-id', 'external-editor');
            data.setData('application/chnk-it-block-data', JSON.stringify({ blocks: [{ id: 'external', type: 'text', content: 'External evidence' }] }));
            document.querySelector('[data-block-id="target-block"]')!.dispatchEvent(new DragEvent('drop', {
                bubbles: true, cancelable: true, dataTransfer: data,
            }));
            // The source callback belongs to the destination state updater.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            window.removeEventListener('chnk-it-clear-selection', onClear);
            return { cleanup, clears, removed, handled: (window as DragWindow).chnkItCrossEditorDropHandled,
                locked: (window as DragWindow).chnkItBlockDragging, callbackCleared: (window as DragWindow).chnkItRemoveDraggedBlocks === null };
        });
        expect(result).toEqual({ cleanup: 0, clears: 1, removed: [['external']], handled: true,
            locked: false, callbackCleared: true });
        await expect(target).toContainText('External evidence');
    });

    test('Escape cancels a drag without moving content or claiming a transfer', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, [{ id: 'untouched', type: 'note', position: { x: 100, y: 100 },
            data: { content: [{ id: 'kept', type: 'text', content: 'Keep this evidence' }] } }]);
        const result = await page.evaluate(async () => {
            const path = '/src/features/editor/drag/blockDragLock.ts';
            const { beginBlockDrag } = await import(/* @vite-ignore */ path);
            let cleanup = 0;
            (window as DragWindow).chnkItMultiDragCleanup = () => { cleanup++; };
            beginBlockDrag();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const store = (window as unknown as { __appStore: { getState: () => AppState } }).__appStore;
            return { cleanup, locked: (window as DragWindow).chnkItBlockDragging, handled: (window as DragWindow).chnkItCrossEditorDropHandled,
                content: store.getState().nodes[0].data.content };
        });
        expect(result).toEqual({ cleanup: 0, locked: false, handled: false,
            content: [{ id: 'kept', type: 'text', content: 'Keep this evidence' }] });
    });
});
