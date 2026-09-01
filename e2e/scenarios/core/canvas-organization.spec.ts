import { test, expect } from '../../support/fixtures';
import { openCanvas, PANE } from '../../support/canvas';
import {
    nodesOnCanvas,
    seedCanvasState,
    waitForCanvasState,
    type CanvasStateNode,
} from '../../support/canvasState';

const WIDTH = 240;
const HEIGHT = 144;

function blockNode(id: string, x: number, y: number, content: string, parentId?: string): CanvasStateNode {
    return {
        id,
        type: 'block',
        parentId,
        position: { x, y },
        style: { width: WIDTH, height: HEIGHT },
        data: {
            label: content,
            isStandaloneBlock: true,
            content: [{ id: `${id}-body`, type: 'text', content }],
        },
    };
}

const positionsOf = (nodes: CanvasStateNode[]) => Object.fromEntries(
    nodes.map((node) => [node.id, {
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
    }]),
);

function dimensionsOf(node: CanvasStateNode) {
    return {
        width: node.measured?.width
            ?? (typeof node.style?.width === 'number' ? node.style.width : WIDTH),
        height: node.measured?.height
            ?? (typeof node.style?.height === 'number' ? node.style.height : HEIGHT),
    };
}

function centreDistance(a: CanvasStateNode, b: CanvasStateNode): number {
    const aSize = dimensionsOf(a);
    const bSize = dimensionsOf(b);
    const ax = (a.position?.x ?? 0) + aSize.width / 2;
    const ay = (a.position?.y ?? 0) + aSize.height / 2;
    const bx = (b.position?.x ?? 0) + bSize.width / 2;
    const by = (b.position?.y ?? 0) + bSize.height / 2;
    return Math.hypot(ax - bx, ay - by);
}

function horizontalGap(a: CanvasStateNode, b: CanvasStateNode): number {
    const left = (a.position?.x ?? 0) <= (b.position?.x ?? 0) ? a : b;
    const right = left === a ? b : a;
    return (right.position?.x ?? 0) - ((left.position?.x ?? 0) + dimensionsOf(left).width);
}

function boundingArea(nodes: CanvasStateNode[]): number {
    const left = Math.min(...nodes.map((node) => node.position?.x ?? 0));
    const top = Math.min(...nodes.map((node) => node.position?.y ?? 0));
    const right = Math.max(...nodes.map((node) => (node.position?.x ?? 0) + dimensionsOf(node).width));
    const bottom = Math.max(...nodes.map((node) => (node.position?.y ?? 0) + dimensionsOf(node).height));
    return (right - left) * (bottom - top);
}

function boundingSize(nodes: CanvasStateNode[]) {
    const left = Math.min(...nodes.map((node) => node.position?.x ?? 0));
    const top = Math.min(...nodes.map((node) => node.position?.y ?? 0));
    const right = Math.max(...nodes.map((node) => (node.position?.x ?? 0) + dimensionsOf(node).width));
    const bottom = Math.max(...nodes.map((node) => (node.position?.y ?? 0) + dimensionsOf(node).height));
    return { width: right - left, height: bottom - top };
}

function expectNoOverlaps(nodes: CanvasStateNode[]) {
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].position!;
            const b = nodes[j].position!;
            const aSize = dimensionsOf(nodes[i]);
            const bSize = dimensionsOf(nodes[j]);
            const overlaps = a.x < b.x + bSize.width && a.x + aSize.width > b.x
                && a.y < b.y + bSize.height && a.y + aSize.height > b.y;
            expect(overlaps, `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);
        }
    }
}

async function chooseOrganizeCanvas(page: Parameters<typeof openCanvas>[0]) {
    await page.locator(PANE).click({ button: 'right', position: { x: 32, y: 32 }, force: true });
    const command = page.getByRole('button', { name: 'Organize canvas' });
    await expect(command).toBeEnabled();
    await command.click();
}

test.describe('Canvas organization', () => {
    test('groups related content, aligns compactly, preserves graph and camera, and undoes once', async ({ page }) => {
        await openCanvas(page);
        const seeded = [
            blockNode('budget-a', -1800, -900, 'quarterly budget revenue expenses forecast'),
            blockNode('garden-a', 1700, -700, 'tomato garden plants soil watering'),
            blockNode('budget-b', 1300, 1000, 'budget forecast expenses quarterly revenue'),
            blockNode('garden-b', -1500, 900, 'garden soil watering tomato plants'),
        ];
        const seededEdges = [{
            id: 'budget-link',
            source: 'budget-a',
            target: 'budget-b',
            type: 'centered',
            data: { parentId: null },
        }];
        await seedCanvasState(page, seeded, seededEdges);
        await waitForCanvasState(page, (state) => state.nodes.some((node) => node.id === 'garden-b'), 'organization fixture');
        await page.waitForTimeout(250);

        const before = await waitForCanvasState(page, (state) => nodesOnCanvas(state).length === 4, 'settled fixture');
        const activeBefore = nodesOnCanvas(before);
        const originalPositions = positionsOf(activeBefore);
        const originalPayload = Object.fromEntries(activeBefore.map((node) => [node.id, {
            type: node.type,
            parentId: node.parentId ?? null,
            style: node.style,
            data: node.data,
        }]));
        const viewport = page.locator('.react-flow__viewport');
        const viewportBefore = await viewport.evaluate((element) => (element as HTMLElement).style.transform);

        await chooseOrganizeCanvas(page);
        const organized = await waitForCanvasState(
            page,
            (state) => state.nodes.some((node) => {
                const before = originalPositions[node.id];
                return before && (before.x !== node.position?.x || before.y !== node.position?.y);
            }),
            'organized node positions',
        );
        const active = nodesOnCanvas(organized);

        expect(organized.edges).toEqual(before.edges);
        expect(Object.fromEntries(active.map((node) => [node.id, {
            type: node.type,
            parentId: node.parentId ?? null,
            style: node.style,
            data: node.data,
        }]))).toEqual(originalPayload);
        expectNoOverlaps(active);
        expect(boundingArea(active)).toBeLessThan(boundingArea(activeBefore));

        const byId = new Map(active.map((node) => [node.id, node]));
        expect(byId.get('budget-a')?.position?.y).toBe(byId.get('budget-b')?.position?.y);
        expect(byId.get('garden-a')?.position?.y).toBe(byId.get('garden-b')?.position?.y);
        expect(byId.get('budget-a')?.position?.x).not.toBe(byId.get('budget-b')?.position?.x);
        expect(byId.get('garden-a')?.position?.x).not.toBe(byId.get('garden-b')?.position?.x);
        expect(horizontalGap(byId.get('budget-a')!, byId.get('budget-b')!)).toBeLessThanOrEqual(72);
        expect(horizontalGap(byId.get('garden-a')!, byId.get('garden-b')!)).toBeLessThanOrEqual(48);
        expect(boundingSize(active).width).toBeGreaterThan(boundingSize(active).height);
        expect(centreDistance(byId.get('budget-a')!, byId.get('budget-b')!))
            .toBeLessThan(centreDistance(byId.get('budget-a')!, byId.get('garden-a')!));
        expect(centreDistance(byId.get('garden-a')!, byId.get('garden-b')!))
            .toBeLessThan(centreDistance(byId.get('garden-a')!, byId.get('budget-a')!));

        await page.waitForTimeout(320);
        expect(await viewport.evaluate((element) => (element as HTMLElement).style.transform)).toBe(viewportBefore);

        const notice = page.getByText('4 nodes organized', { exact: true }).locator('..');
        await expect(notice).toBeVisible();
        await notice.getByRole('button', { name: 'Undo' }).click();
        const undone = await waitForCanvasState(
            page,
            (state) => nodesOnCanvas(state).every((node) => {
                const before = originalPositions[node.id];
                return before?.x === node.position?.x && before?.y === node.position?.y;
            }),
            'organization undo',
        );
        expect(positionsOf(nodesOnCanvas(undone))).toEqual(originalPositions);
    });

    test('organizes connected nodes as a readable horizontal mind map', async ({ page }) => {
        await openCanvas(page);
        const seeded = [
            blockNode('map-root', -1500, 900, 'Product direction'),
            blockNode('map-strategy', 1200, -800, 'Strategy and market'),
            blockNode('map-delivery', -1000, -900, 'Delivery plan'),
            blockNode('map-risks', 1500, 1000, 'Risks and constraints'),
            blockNode('map-research', 800, 600, 'Market research'),
            blockNode('map-launch', -500, 1200, 'Launch milestones'),
        ];
        const edges = [
            { id: 'root-strategy', source: 'map-root', target: 'map-strategy', type: 'centered', data: { parentId: null } },
            { id: 'root-delivery', source: 'map-root', target: 'map-delivery', type: 'centered', data: { parentId: null } },
            { id: 'root-risks', source: 'map-root', target: 'map-risks', type: 'centered', data: { parentId: null } },
            { id: 'strategy-research', source: 'map-strategy', target: 'map-research', type: 'centered', data: { parentId: null } },
            { id: 'delivery-launch', source: 'map-delivery', target: 'map-launch', type: 'centered', data: { parentId: null } },
        ];
        await seedCanvasState(page, seeded, edges);
        await waitForCanvasState(page, (state) => nodesOnCanvas(state).length === seeded.length, 'mind-map fixture');
        await page.waitForTimeout(250);

        await chooseOrganizeCanvas(page);
        const organized = await waitForCanvasState(
            page,
            (state) => state.nodes.find((node) => node.id === 'map-root')?.position?.x !== seeded[0].position?.x,
            'organized mind map',
        );
        const active = nodesOnCanvas(organized);
        const byId = new Map(active.map((node) => [node.id, node]));
        const root = byId.get('map-root')!;
        const firstLevel = ['map-strategy', 'map-delivery', 'map-risks'].map((id) => byId.get(id)!);
        const secondLevel = ['map-research', 'map-launch'].map((id) => byId.get(id)!);

        expect(organized.edges).toEqual(edges);
        expectNoOverlaps(active);
        firstLevel.forEach((node) => expect(node.position!.x).toBeGreaterThan(root.position!.x));
        secondLevel.forEach((node) => expect(node.position!.x).toBeGreaterThan(firstLevel[0].position!.x));
        expect(new Set(firstLevel.map((node) => node.position!.x)).size).toBe(1);
        expect(new Set(secondLevel.map((node) => node.position!.x)).size).toBe(1);
        expect(horizontalGap(root, firstLevel[0])).toBeLessThanOrEqual(72);
        const rootCenterY = root.position!.y + dimensionsOf(root).height / 2;
        const branchCenters = firstLevel.map((node) => node.position!.y + dimensionsOf(node).height / 2);
        expect(rootCenterY).toBeGreaterThanOrEqual(Math.min(...branchCenters));
        expect(rootCenterY).toBeLessThanOrEqual(Math.max(...branchCenters));
        expect(boundingSize(active).width).toBeGreaterThan(boundingSize(active).height);
    });

    test('organizes only the active nested canvas', async ({ page }) => {
        await openCanvas(page);
        const parentId = 'project-parent';
        const seeded = [
            blockNode(parentId, 96, 96, 'Project overview'),
            blockNode('root-sibling', 600, 120, 'Root sibling'),
            blockNode('nested-a', -1200, -600, 'research sources evidence', parentId),
            blockNode('nested-b', 1300, 800, 'sources and research evidence', parentId),
        ];
        await seedCanvasState(page, seeded);
        const rootsBefore = positionsOf(seeded.filter((node) => !node.parentId));
        const nestedBefore = positionsOf(seeded.filter((node) => node.parentId === parentId));

        await page.evaluate((id) => {
            const store = (window as unknown as {
                __appStore?: { getState: () => { navigateToNode: (nodeId: string) => void } };
            }).__appStore;
            store?.getState().navigateToNode(id);
        }, parentId);
        await page.waitForFunction((id) => {
            const store = (window as unknown as {
                __appStore?: { getState: () => { currentParentId: string | null } };
            }).__appStore;
            return store?.getState().currentParentId === id;
        }, parentId);
        await page.waitForTimeout(500);

        const viewport = page.locator('.react-flow__viewport');
        const viewportBefore = await viewport.evaluate((element) => (element as HTMLElement).style.transform);
        await chooseOrganizeCanvas(page);
        const organized = await waitForCanvasState(
            page,
            (state) => nodesOnCanvas(state, parentId).some((node) => {
                const before = nestedBefore[node.id];
                return before && (before.x !== node.position?.x || before.y !== node.position?.y);
            }),
            'nested organization',
        );

        expect(positionsOf(nodesOnCanvas(organized))).toEqual(rootsBefore);
        expect(positionsOf(nodesOnCanvas(organized, parentId))).not.toEqual(nestedBefore);
        await page.waitForTimeout(320);
        expect(await viewport.evaluate((element) => (element as HTMLElement).style.transform)).toBe(viewportBefore);
    });
});
