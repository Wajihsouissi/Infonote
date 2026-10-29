import { test, expect } from '../../support/fixtures';
import { blurEditor, clickEmptyCanvas, confirmNodeDeletion, fitView, nodeById, openCanvas, reload, selectNode as selectCanvasNode, waitForLocalSave } from '../../support/canvas';
import { makeCards, readCanvasState, seedCanvasState, waitForCanvasState } from '../../support/canvasState';
import type { Locator, Page } from '@playwright/test';

async function selectNode(node: Locator, modifiers?: Array<'Shift' | 'Control'>) {
    const shield = node.locator('.interaction-overlay');
    if (await shield.count()) {
        // The shield is the intended user target. Wait for its moving canvas
        // transform and hit target rather than forcing a click mid-fit.
        await shield.click({ modifiers });
        return;
    }
    await selectCanvasNode(node, modifiers);
}

const selection = (page: Page) => page.evaluate(() => [...(window as unknown as {
    __appStore: { getState: () => { selectedCanvasNodeIds: Set<string> } };
}).__appStore.getState().selectedCanvasNodeIds].sort());

async function openMenu(page: Page) {
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 25, y: 200 }, force: true });
    return page.locator('[data-app-menu="canvas-context"]');
}

test.describe('SCRUM-23 bulk canvas workflows', () => {
    test.beforeAll(async ({ browser }, testInfo) => {
        console.info(`[SCRUM-23 browser] ${testInfo.project.name}: ${browser.version()}`);
    });
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            if (window.top !== window) return;
            const events: object[] = [];
            (window as unknown as { __qaClipboardEvents: object[] }).__qaClipboardEvents = events;
            for (const type of ['copy', 'cut', 'paste']) window.addEventListener(type, event => {
                const data = (event as ClipboardEvent).clipboardData;
                events.push({ type, target: (event.target as HTMLElement)?.tagName,
                    htmlChars: data?.getData('text/html').length ?? 0,
                    textChars: data?.getData('text/plain').length ?? 0 });
            });
            window.addEventListener('keydown', event => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') events.push({
                    type: 'paste-key', active: document.activeElement?.tagName,
                    destination: document.activeElement?.getAttribute('aria-label'),
                });
            });
        });
    });
    test.afterEach(async ({ page, browserName }, testInfo) => {
        if (!page.isClosed()) await testInfo.attach('clipboard-events', {
            body: JSON.stringify(await page.evaluate(() => (window as unknown as { __qaClipboardEvents?: object[] }).__qaClipboardEvents ?? []), null, 2),
            contentType: 'application/json',
        });
        if (browserName !== 'firefox' || testInfo.status !== 'passed') return;
        // Exercise a clean page exit before disposing the automation context;
        // keep page-exit errors separate from Firefox context-disposal errors.
        await waitForLocalSave(page);
        await page.goto('about:blank', { waitUntil: 'commit', timeout: 10_000 });
    });
    test('SCRUM-90 cut/paste preserves an entire nested branch and its links', async ({ page }, testInfo) => {
        await openCanvas(page);
        const [parent, peer, child] = makeCards(3, 'Clipboard');
        child.parentId = parent.id;
        child.position = { x: 56, y: 112 };
        parent.data!.content = [{ id: 'page-link', type: 'page', content: 'Child', metadata: { nodeId: child.id } }];
        await seedCanvasState(page, [parent, peer, child], [{ id: 'linked', source: parent.id, target: peer.id, type: 'centered', data: { parentId: null, label: 'Meaningful link', color: '#ff8800' } }]);
        await fitView(page);
        await selectNode(nodeById(page, parent.id));
        await selectNode(nodeById(page, peer.id), ['Shift']);
        await page.keyboard.press('Control+x');
        await confirmNodeDeletion(page);
        await waitForCanvasState(page, s => s.nodes.length === 0, 'source branch cut');
        await page.keyboard.press('Control+v');
        const pasted = await waitForCanvasState(page, s => s.nodes.length >= 2, 'pasted group');
        expect(pasted.nodes).toHaveLength(3);
        const newParent = pasted.nodes.find(n => n.data?.label === parent.data?.label)!;
        const newChild = pasted.nodes.find(n => n.data?.label === child.data?.label)!;
        expect(newChild.parentId).toBe(newParent.id);
        expect(newChild.position).toEqual(child.position);
        expect(JSON.stringify(newParent.data?.content)).toContain(newChild.id);
        expect(JSON.stringify(newParent.data?.content)).not.toContain(child.id);
        expect(pasted.edges[0].data).toEqual({ parentId: null, label: 'Meaningful link', color: '#ff8800' });
        expect(pasted.nodes.every(n => ![parent.id, peer.id, child.id].includes(n.id))).toBe(true);
        await fitView(page);
        await page.screenshot({ path: testInfo.outputPath('cut-paste-branch.png') });
        expect((await readCanvasState(page))?.nodes).toHaveLength(3);
        await reload(page);
        expect((await readCanvasState(page))?.nodes).toHaveLength(3);
        expect((await readCanvasState(page))?.edges).toHaveLength(1);
    });

    test('SCRUM-88 Shift toggles, select-all includes distant peers only, delete cancel and Undo protect bystanders', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(5, 'Selection');
        nodes[3].position = { x: 8000, y: 8000 };
        nodes[4].parentId = nodes[0].id;
        await seedCanvasState(page, nodes);
        await fitView(page);
        await page.keyboard.press('Control+a');
        await expect.poll(() => selection(page)).toEqual(nodes.slice(0, 4).map(n => n.id));
        await page.keyboard.press('Escape');
        await expect.poll(() => selection(page)).toEqual([]);
        // Bring the nearby fixture back into comfortable pointer reach.
        nodes[3].position = { x: 1500, y: 0 };
        await seedCanvasState(page, nodes);
        await fitView(page);
        await selectNode(nodeById(page, nodes[1].id));
        await selectNode(nodeById(page, nodes[2].id), ['Shift']);
        await expect.poll(() => selection(page)).toEqual([nodes[1].id, nodes[2].id]);
        await selectNode(nodeById(page, nodes[2].id), ['Shift']);
        await expect.poll(() => selection(page)).toEqual([nodes[1].id]);
        await selectNode(nodeById(page, nodes[2].id), ['Shift']);
        await page.keyboard.press('Delete');
        const dialog = page.getByRole('alertdialog');
        await dialog.getByRole('button', { name: 'Keep cards' }).click();
        expect((await readCanvasState(page))?.nodes).toHaveLength(5);
        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        const deleted = await waitForCanvasState(page, s => s.nodes.length === 3);
        expect(deleted.nodes.map(n => n.id).sort()).toEqual([nodes[0].id, nodes[3].id, nodes[4].id].sort());
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await waitForCanvasState(page, s => s.nodes.length === 5);
        await page.screenshot({ path: testInfo.outputPath('bulk-selection-undo.png') });
    });

    for (const mixed of [false, true]) test(`SCRUM-89 ${mixed ? 'mixed card/doc' : 'card'} group drag keeps shape and links over a target without nesting; one Undo and Redo`, async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(3, 'Drag');
        nodes.forEach((n, i) => { n.position = { x: i * 300, y: 0 }; n.style = { width: 208, height: 208 }; n.data!.viewMode = 'medium'; });
        if (mixed) nodes[1].type = 'fused-note';
        await seedCanvasState(page, nodes, [{ id: 'drag-link', source: nodes[0].id, target: nodes[1].id, type: 'centered' }]);
        await fitView(page);
        await selectNode(nodeById(page, nodes[0].id));
        await selectNode(nodeById(page, nodes[1].id), ['Shift']);
        await expect.poll(() => selection(page)).toEqual([nodes[0].id, nodes[1].id]);
        const source = await nodeById(page, nodes[0].id).boundingBox();
        const target = await nodeById(page, nodes[2].id).boundingBox();
        const before = (await readCanvasState(page))!;
        await page.mouse.move(source!.x + source!.width / 2, source!.y + 4);
        await page.mouse.down();
        await page.mouse.move(target!.x + target!.width / 2, target!.y + 4, { steps: 25 });
        await page.screenshot({ path: testInfo.outputPath('group-drag-over-card.png') });
        await page.mouse.up();
        const moved = await waitForCanvasState(page, s => s.nodes[0].position!.x !== before.nodes[0].position!.x);
        expect(moved.nodes).toHaveLength(3);
        for (const n of moved.nodes) expect(n.parentId ?? null).toBeNull();
        expect(moved.nodes[1].position!.x - moved.nodes[0].position!.x).toBeCloseTo(300, 1);
        expect(moved.nodes[1].position!.y - moved.nodes[0].position!.y).toBeCloseTo(0, 1);
        expect(moved.nodes[2].position).toEqual(before.nodes[2].position);
        expect(moved.edges).toEqual(before.edges);
        await page.waitForTimeout(350);
        await page.keyboard.press('Control+z');
        await waitForCanvasState(page, s => s.nodes[0].position!.x === before.nodes[0].position!.x, 'one gesture Undo');
        expect((await readCanvasState(page))!.nodes[1].position).toEqual(before.nodes[1].position);
        await page.keyboard.press('Control+Shift+z');
        await waitForCanvasState(page, s => s.nodes[0].position!.x === moved.nodes[0].position!.x, 'Redo group');
        await reload(page);
        expect((await readCanvasState(page))!.nodes[1].position).toEqual(moved.nodes[1].position);
    });

    test('SCRUM-90 cancelled cut keeps source; repeated native paste clones independently with fresh identities', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Repeat'));
        await fitView(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+x');
        await page.getByRole('alertdialog').getByRole('button', { name: 'Keep cards' }).click();
        expect((await readCanvasState(page))!.nodes).toHaveLength(2);
        await page.keyboard.press('Control+v');
        await waitForCanvasState(page, s => s.nodes.length === 4);
        await page.keyboard.press('Control+v');
        const state = await waitForCanvasState(page, s => s.nodes.length === 6);
        expect(new Set(state.nodes.map(n => n.id)).size).toBe(6);
        const blockIds = state.nodes.map(n => (n.data!.content as { id: string }[])[0].id);
        expect(new Set(blockIds).size).toBe(6);
        expect(state.nodes[4].position).not.toEqual(state.nodes[2].position);
        expect(await selection(page)).toHaveLength(2);
        await fitView(page);
        await page.screenshot({ path: testInfo.outputPath('repeated-paste.png') });
    });

    test('SCRUM-91 menu Copy and Cut preserve the multi-selection and match native paste', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Menu'));
        await fitView(page);
        await page.keyboard.press('Control+a');
        let menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Copy', exact: true }).click();
        await page.keyboard.press('Control+v');
        await waitForCanvasState(page, s => s.nodes.length === 4);
        expect(await selection(page)).toHaveLength(2);
        menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Cut', exact: true }).click();
        await confirmNodeDeletion(page);
        await waitForCanvasState(page, s => s.nodes.length === 2);
        await page.keyboard.press('Control+v');
        await waitForCanvasState(page, s => s.nodes.length === 4);
        await page.screenshot({ path: testInfo.outputPath('context-selection-parity.png') });
    });

    test('SCRUM-91 denied clipboard gives recovery guidance, keyboard menu and Escape keep selection', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Permissions'));
        await fitView(page);
        await page.keyboard.press('Control+a');
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
                read: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
                readText: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
            } });
        });
        const menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Paste', exact: true }).click();
        await expect(menu.getByRole('status')).toContainText('Ctrl+V');
        expect((await readCanvasState(page))!.nodes).toHaveLength(2);
        expect(await selection(page)).toHaveLength(2);
        await page.screenshot({ path: testInfo.outputPath('clipboard-denied-guidance.png') });
        await page.keyboard.press('Home');
        await expect(menu.getByRole('button', { name: 'Add Block', exact: true })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(menu.getByRole('button', { name: 'Copy', exact: true })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        expect(await selection(page)).toHaveLength(2);
    });

    for (const [flavor, html, text] of [
        ['text', '', 'First line\n\nSecond line'],
        ['HTML', '<h2>Heading</h2><ul><li>Bullet</li></ul>', 'Heading\nBullet'],
    ]) test(`SCRUM-91 ${flavor} menu paste equals native parsing and selects the result`, async ({ page }, testInfo) => {
        await openCanvas(page);
        // A controlled external clipboard lets all browser engines exercise the same input.
        await page.evaluate(({ html, text }) => {
            // Firefox strips DataTransfer contents from untrusted ClipboardEvents.
            // This fixture controls the port, while other cases drive native Ctrl+V.
            const event = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: {
                getData: (type: string) => type === 'text/html' ? html : text,
                files: [],
            } });
            window.dispatchEvent(event);
        }, { html, text });
        const native = await waitForCanvasState(page, s => s.nodes.length === 1);
        await page.evaluate(({ html, text }) => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
                read: async () => [{ types: ['text/plain', ...(html ? ['text/html'] : [])], getType: async (type: string) => new Blob([type === 'text/html' ? html : text]) }],
            } });
        }, { html, text });
        const menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Paste', exact: true }).click();
        const state = await waitForCanvasState(page, s => s.nodes.length === 2);
        const shape = (content: unknown) => (content as { type: string; content: string }[]).map(b => ({ type: b.type, content: b.content }));
        expect(shape(state.nodes[1].data!.content)).toEqual(shape(native.nodes[0].data!.content));
        expect(state.nodes[1].type).toBe(native.nodes[0].type);
        expect(await selection(page)).toEqual([state.nodes[1].id]);
        await fitView(page);
        await page.screenshot({ path: testInfo.outputPath(`paste-${flavor}.png`) });
    });

    test('SCRUM-88 editor owns select-all/copy/cut/delete and Escape leaves editing without deleting cards', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Typing'));
        await fitView(page);
        const node = nodeById(page, 'seed-0');
        await selectNode(node);
        const title = node.getByPlaceholder('Untitled');
        await title.fill('Editable title');
        await title.press('Control+a');
        await title.press('Control+c');
        await title.press('Control+x');
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await title.press('Control+v');
        await expect(title).toHaveValue('Editable title');
        await title.press('Control+a');
        await title.press('Delete');
        expect((await readCanvasState(page))!.nodes).toHaveLength(2);
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await blurEditor(page);
        await clickEmptyCanvas(page);
        await page.keyboard.press('Control+a');
        expect(await selection(page)).toHaveLength(2);
    });

    test('SCRUM-90 paste a linked branch into another card with correct ownership and local persistence', async ({ page, context, browserName }, testInfo) => {
        await openCanvas(page);
        const [parent, peer, destination, child] = makeCards(4, 'Transfer');
        child.parentId = parent.id;
        child.position = { x: 112, y: 56 };
        destination.data!.content = [];
        parent.data!.content = [{ id: 'transfer-page', type: 'page', content: 'Nested', metadata: { nodeId: child.id } }];
        await seedCanvasState(page, [parent, peer, destination, child], [{ id: 'transfer-edge', source: parent.id, target: peer.id, type: 'centered', data: { parentId: null, label: 'Transfer relationship' } }]);
        await fitView(page);
        await selectNode(nodeById(page, parent.id));
        await selectNode(nodeById(page, peer.id), ['Shift']);
        await page.keyboard.press('Control+c');
        await nodeById(page, destination.id).hover();
        await nodeById(page, destination.id).getByRole('button', { name: 'Open card', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Nested canvas' })).toBeVisible();
        await page.keyboard.press('Control+a');
        expect(await selection(page)).toEqual([]);
        if (browserName === 'chromium') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            const menu = await openMenu(page);
            await menu.getByRole('button', { name: 'Paste', exact: true }).click();
        } else await page.keyboard.press('Control+v');
        const state = await waitForCanvasState(page, s => s.nodes.length === 7, 'transferred complete branch');
        const copies = state.nodes.filter(n => ![parent.id, peer.id, destination.id, child.id].includes(n.id));
        expect(copies.filter(n => n.parentId === destination.id)).toHaveLength(2);
        const copiedParent = copies.find(n => n.data?.label === parent.data?.label)!;
        expect(copies.find(n => n.data?.label === child.data?.label)!.parentId).toBe(copiedParent.id);
        expect(state.edges.find(e => e.id !== 'transfer-edge')!.data).toEqual({ parentId: destination.id, label: 'Transfer relationship' });
        expect(await selection(page)).toHaveLength(2);
        await fitView(page);
        await page.screenshot({ path: testInfo.outputPath('paste-into-nested-canvas.png') });
        await reload(page);
        expect((await readCanvasState(page))!.nodes).toHaveLength(7);
        await page.keyboard.press('Alt+ArrowUp');
        await expect(nodeById(page, destination.id)).toBeVisible();
    });

    test('SCRUM-88 Control box-selection and bulk color/duplicate operate only on the intended group', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(3, 'Box');
        nodes.forEach((n, i) => { n.position = { x: i * 300, y: 0 }; n.style = { width: 208, height: 208 }; n.data!.viewMode = 'medium'; });
        await seedCanvasState(page, nodes);
        await fitView(page);
        const a = await nodeById(page, nodes[0].id).boundingBox();
        const b = await nodeById(page, nodes[1].id).boundingBox();
        await page.keyboard.down('Control');
        await page.mouse.move(a!.x - 10, a!.y - 10);
        await page.mouse.down();
        await page.mouse.move(b!.x + b!.width + 10, b!.y + b!.height + 10, { steps: 15 });
        await page.mouse.up();
        await page.keyboard.up('Control');
        await expect.poll(() => selection(page)).toEqual([nodes[0].id, nodes[1].id]);
        await page.getByRole('button', { name: 'Color', exact: true }).click();
        await page.getByTitle('Amber', { exact: true }).click();
        const colored = await waitForCanvasState(page, s => s.nodes[0].data?.color === 'var(--a-amber)');
        expect(colored.nodes[1].data?.color).toBe('var(--a-amber)');
        expect(colored.nodes[2].data?.color).toBeUndefined();
        await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
        const duplicated = await waitForCanvasState(page, s => s.nodes.length === 5);
        expect(duplicated.nodes.filter(n => n.data?.color === 'var(--a-amber)')).toHaveLength(4);
        expect(await selection(page)).toHaveLength(2);
        await fitView(page);
        await page.screenshot({ path: testInfo.outputPath('box-selection-bulk-color-duplicate.png') });
    });

    test('SCRUM-91 Select by type excludes nested cards and failed menu cut leaves content intact', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(4, 'Mixed');
        nodes[1].type = 'fused-note'; nodes[2].type = 'block'; nodes[3].parentId = nodes[0].id;
        await seedCanvasState(page, nodes);
        await fitView(page);
        let menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Select', exact: true }).click();
        await menu.getByRole('button', { name: 'Select Cards', exact: true }).click();
        await expect.poll(() => selection(page)).toEqual([nodes[0].id]);
        await page.evaluate(() => { document.execCommand = () => false; });
        menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Cut', exact: true }).click();
        await expect(menu.getByRole('status')).toContainText('Your cards are unchanged');
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        expect((await readCanvasState(page))!.nodes).toHaveLength(4);
        await page.screenshot({ path: testInfo.outputPath('cut-denied-source-intact.png') });
        await page.keyboard.press('Escape');
        menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Select', exact: true }).click();
        await menu.getByRole('button', { name: 'Select Docs', exact: true }).click();
        await expect.poll(() => selection(page)).toEqual([nodes[1].id]);
        menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Select', exact: true }).click();
        await menu.getByRole('button', { name: 'Select Blocks', exact: true }).click();
        await expect.poll(() => selection(page)).toEqual([nodes[2].id]);
    });

    test('SCRUM-91 context Delete selection uses the same protected branch deletion and Undo as Delete key', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(4, 'Delete');
        nodes[3].parentId = nodes[0].id;
        await seedCanvasState(page, nodes, [{ id: 'delete-link', source: nodes[0].id, target: nodes[1].id }]);
        await fitView(page);
        await selectNode(nodeById(page, nodes[0].id));
        await selectNode(nodeById(page, nodes[1].id), ['Shift']);
        const menu = await openMenu(page);
        await menu.getByRole('button', { name: 'Delete selection', exact: true }).click();
        await expect(page.getByRole('alertdialog')).toContainText('2 selected cards and 1 nested card');
        await page.screenshot({ path: testInfo.outputPath('context-bulk-delete-confirmation.png') });
        await confirmNodeDeletion(page);
        const after = await waitForCanvasState(page, s => s.nodes.length === 1);
        expect(after.nodes[0].id).toBe(nodes[2].id);
        expect(after.edges).toHaveLength(0);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        const restored = await waitForCanvasState(page, s => s.nodes.length === 4);
        expect(restored.edges).toHaveLength(1);
    });

    test('SCRUM-90 twelve mixed nodes copy, paste, delete and Undo as a batch without changing originals', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(12, 'Batch');
        nodes.forEach((n, i) => {
            n.type = ['note', 'fused-note', 'block'][i % 3];
            n.data!.content = [{ id: `batch-${i}`, type: 'heading2', content: `Content ${i} — محتوى` }];
        });
        await seedCanvasState(page, nodes);
        await fitView(page);
        await page.keyboard.press('Control+a');
        await expect.poll(() => selection(page)).toHaveLength(12);
        await page.keyboard.press('Control+c');
        await page.keyboard.press('Control+v');
        const pasted = await waitForCanvasState(page, s => s.nodes.length === 24);
        expect(new Set(pasted.nodes.map(n => n.id)).size).toBe(24);
        expect(await selection(page)).toHaveLength(12);
        for (const original of nodes) expect(pasted.nodes.find(n => n.id === original.id)!.data?.content).toEqual(original.data!.content);
        await page.screenshot({ path: testInfo.outputPath('twelve-node-batch.png') });
        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        const deleted = await waitForCanvasState(page, s => s.nodes.length === 12);
        expect(deleted.nodes.map(n => n.id).sort()).toEqual(nodes.map(n => n.id).sort());
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await waitForCanvasState(page, s => s.nodes.length === 24);
        await reload(page);
        expect((await readCanvasState(page))!.nodes).toHaveLength(24);
    });

    test('SCRUM-89 regression: single drag still nests a card and one Undo restores the whole graph', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(2, 'Single drag');
        await seedCanvasState(page, nodes);
        await fitView(page);
        await selectNode(nodeById(page, nodes[0].id));
        const source = await nodeById(page, nodes[0].id).boundingBox();
        const target = await nodeById(page, nodes[1].id).boundingBox();
        await page.mouse.move(source!.x + source!.width / 2, source!.y + 4);
        await page.mouse.down();
        await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 20 });
        await page.waitForTimeout(100);
        await page.mouse.move(target!.x + target!.width / 2 + 1, target!.y + target!.height / 2);
        await page.mouse.up();
        const nested = await waitForCanvasState(page, s => s.nodes.find(n => n.id === nodes[0].id)?.parentId === nodes[1].id, 'single-card nesting');
        expect(JSON.stringify(nested.nodes.find(n => n.id === nodes[1].id)!.data!.content)).toContain(nodes[0].id);
        await page.waitForTimeout(250);
        await page.keyboard.press('Control+z');
        const undone = await waitForCanvasState(page, s => !s.nodes.find(n => n.id === nodes[0].id)?.parentId, 'single nesting Undo');
        expect(undone.nodes.find(n => n.id === nodes[0].id)!.position).toEqual(nodes[0].position);
        expect(undone.nodes.find(n => n.id === nodes[1].id)!.data!.content).toEqual(nodes[1].data!.content);
        await page.screenshot({ path: testInfo.outputPath('single-drag-undo-regression.png') });
    });

    test('SCRUM-90 empty system clipboard recovers the session copy; external and editor copies invalidate it', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Recovery'));
        await fitView(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+c');
        const pastePort = (text = '') => page.evaluate(text => {
            const event = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: {
                files: [], getData: (type: string) => type === 'text/plain' ? text : '',
            } });
            window.dispatchEvent(event);
        }, text);
        await pastePort();
        await waitForCanvasState(page, s => s.nodes.length === 4, 'session clipboard recovery');
        await expect(page.getByRole('status').filter({ hasText: 'Pasted the last selection copied in this app.' })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('session-clipboard-recovery.png') });
        await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
        expect(await selection(page)).toHaveLength(2);
        await pastePort('New external content');
        const external = await waitForCanvasState(page, s => s.nodes.length === 5, 'external clipboard priority');
        expect(JSON.stringify(external.nodes[4].data!.content)).toContain('New external content');
        await pastePort();
        expect((await readCanvasState(page))!.nodes).toHaveLength(5);
        await fitView(page);
        const original = nodeById(page, 'seed-0');
        await selectNode(original);
        await page.keyboard.press('Control+c');
        await original.getByPlaceholder('Untitled').focus();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+c');
        await blurEditor(page);
        await pastePort();
        expect((await readCanvasState(page))!.nodes).toHaveLength(5);
    });

    test('SCRUM-88 history keeps selection valid after paste Undo/Redo and deletion Undo after selecting a bystander', async ({ page }, testInfo) => {
        await openCanvas(page);
        const nodes = makeCards(3, 'History selection');
        nodes.forEach((n, i) => { n.position = { x: [0, 800, 3000][i], y: 0 }; });
        await seedCanvasState(page, nodes);
        await fitView(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+c');
        await page.keyboard.press('Control+v');
        await waitForCanvasState(page, s => s.nodes.length === 6);
        const expectConsistentSelection = async () => {
            const ids = await selection(page);
            const state = (await readCanvasState(page))!;
            expect(ids.every(id => state.nodes.some(n => n.id === id)), 'selection must never reference deleted nodes').toBe(true);
            const renderedFlags = state.nodes.filter(n => (n as typeof n & { selected?: boolean }).selected).map(n => n.id).sort();
            expect(ids).toEqual(renderedFlags);
        };
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+z');
        await waitForCanvasState(page, s => s.nodes.length === 3);
        await expectConsistentSelection();
        await page.keyboard.press('Control+Shift+z');
        await waitForCanvasState(page, s => s.nodes.length === 6);
        await expectConsistentSelection();
        await fitView(page);
        await selectNode(nodeById(page, 'seed-0'));
        await selectNode(nodeById(page, 'seed-1'), ['Shift']);
        await page.keyboard.press('Delete');
        await confirmNodeDeletion(page);
        await waitForCanvasState(page, s => s.nodes.length === 4);
        await selectNode(nodeById(page, 'seed-2'));
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await waitForCanvasState(page, s => s.nodes.length === 6, 'selection-only changes must not invalidate deletion Undo');
        await expectConsistentSelection();
        await page.screenshot({ path: testInfo.outputPath('history-selection-consistency.png') });
    });
});
