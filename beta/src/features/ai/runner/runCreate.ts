import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { GRID_GAP } from '../../../config/layout';
import { effortBudget } from '../../../config/aiEffort';
import { planArtifacts, verifyArtifacts } from '../../../services/ai/generate';
import type { AIArtifactPlan, AIPlanResult } from '../../../services/ai/types';
import { parseAIContent } from '../../editor/text/aiMarkdown';
import type { Block } from '../../editor/types';
import { composeBody, mapWithConcurrency } from '../aiCompose';
import { recordAIRun } from '../aiTelemetry';
import { normalizeAIText } from '../aiResultUtils';
import { createCanvasStreamWriter } from '../aiCanvasStream';
import { nodeTitle } from '../canvasContext';
import { assertLive, stampProvenance, FULL_ROW_WIDTH, PER_ROW, SHAPE_LABEL, type RunnerContext, type RunnerResult } from './context';
import { findBlockOrigin, placeAction, sizeFor, type PlacedArtifact } from './placement';

/**
 * Build new cards from a request, using the canvas as context.
 *
 * Two passes, not one. The old version asked a single call for every artifact
 * AND every body, so a Smart six-card request needed thousands of tokens of
 * balanced JSON in one reply; when it truncated the user got nothing after two
 * round trips. Now the plan is one small call, the bodies are one call each,
 * and a body that fails costs its own artifact rather than the whole turn.
 */
export async function runCreate(query: string, context: string, ctx: RunnerContext): Promise<RunnerResult> {
    const budget = effortBudget(ctx.request?.effort);
    const startedAt = Date.now();
    const metrics = { repaired: 0, blocks: [] as number[] };

    /* ---- Pass 1: what to build ---- */
    const planStep = ctx.step('action', 'Working out what to build', 'running', { phase: 'compose' });
    let plan: AIPlanResult;
    try {
        plan = await planArtifacts(query, context, ctx.request);
        assertLive(ctx.signal);
    } catch (err) {
        ctx.settle(planStep, 'failed', 'Could not work out a safe plan', { phase: 'compose' });
        throw err;
    }

    const artifacts = plan.artifacts;
    if (artifacts.length === 0) {
        ctx.settle(planStep, 'done', 'Nothing to build for that request', { phase: 'compose' });
        return { createdNodeIds: [], summary: 'I couldn’t turn that into anything to place on the canvas. Try naming what you want — "3 cards on X", "a doc about Y", "mindmap of Z".' };
    }

    ctx.settle(
        planStep,
        'done',
        `Planned ${artifacts.length} item${artifacts.length === 1 ? '' : 's'}`,
        {
            phase: 'compose',
            detail: {
                kind: 'plan',
                artifacts: artifacts.map((a) => ({ shape: SHAPE_LABEL[a.type], title: a.title })),
                why: plan.why,
            },
        },
    );

    /* ---- Pass 2: place everything, then write into what was placed ----
       Bodies used to be written first and placed at the very end, so a turn
       was a long silence followed by every card at once. The plan already
       fixes each artifact's shape and size, so the artifacts land the moment
       it is known and each body streams into its own card as it is written —
       the canvas fills in live, and Stop keeps whatever has arrived.
       Bounded concurrency rather than Promise.all: the gateway rate-limits per
       user, and nine bodies in flight on a Smart turn is the reliable way to
       have three of them refused. */
    const failed: string[] = [];
    let thin = 0;

    /* Announce the whole plan before writing any of it.
       Every artifact gets its line the moment the plan is known, dimmed and
       waiting, and the placing step after them. This is the difference between
       a trace that reports the past and one that shows a process: the user can
       see what is still coming, and stop early if the shape is wrong rather
       than after paying for all of it. */
    const bodyWork = artifacts.filter((a) => a.type !== 'mindmap');
    const stepFor = new Map<AIArtifactPlan, string>();
    bodyWork.forEach((artifact, index) => {
        stepFor.set(artifact, ctx.step(
            'action',
            `Writing ${SHAPE_LABEL[artifact.type].toLowerCase()} “${artifact.title}”`,
            'queued',
            {
                phase: 'compose',
                detail: { kind: 'artifact', shape: SHAPE_LABEL[artifact.type], title: artifact.title, index: index + 1, total: bodyWork.length },
            },
        ));
    });

    /* Say when something already exists rather than quietly making a second
       one. Duplicates are the failure mode of a canvas assistant that cannot
       see what it has already done: ask twice, get two "Pricing page rewrite"
       cards and no idea which is current.
       It reports rather than skips — the user asked for this, and the AI is not
       entitled to decide their card is close enough. Naming it is the honest
       middle: they can undo the turn or merge, both cheap; a silently skipped
       artifact is neither visible nor recoverable.
       Snapshotted BEFORE placement: once this turn's own cards land they would
       match themselves. */
    const existingTitles = new Map(
        useStore.getState().nodes
            .filter((n) => (n.parentId ?? null) === ctx.currentParentId)
            .map((n) => [nodeTitle(n).trim().toLowerCase(), nodeTitle(n)]),
    );

    const placeStepId = ctx.step(
        'action',
        `Placing ${artifacts.length} item${artifacts.length === 1 ? '' : 's'} on the canvas`,
        'running',
        { phase: 'place' },
    );

    const created: string[] = [];
    let blocked = 0;
    const placed = new Map<AIArtifactPlan, PlacedArtifact>();

    // Measure the block first so it can be placed as one unit, then fill it in
    // reading order — card 1 top-left, card 6 bottom-right. Sizes come from the
    // plan (mind-map node counts), so nothing here needs a body.
    const rows: { items: AIArtifactPlan[]; width: number; height: number; full: boolean }[] = [];
    artifacts.forEach((action) => {
        const size = sizeFor(action, ctx.mindmapLayout);
        const wide = size.width >= FULL_ROW_WIDTH;
        const row = rows[rows.length - 1];
        if (!row || wide || row.full || row.items.length === PER_ROW) {
            rows.push({ items: [action], width: size.width, height: size.height, full: wide });
        } else {
            row.items.push(action);
            row.width += GRID_GAP + size.width;
            row.height = Math.max(row.height, size.height);
        }
    });

    const blockW = Math.max(...rows.map((r) => r.width));
    const blockH = rows.reduce((sum, r) => sum + r.height, 0) + GRID_GAP * (rows.length - 1);
    const blockOrigin = findBlockOrigin(blockW, blockH, ctx);

    let cursorY = blockOrigin.y;
    const positioned: { action: AIArtifactPlan; position: { x: number; y: number } }[] = [];
    rows.forEach((row) => {
        let cursorX = blockOrigin.x;
        row.items.forEach((action) => {
            positioned.push({ action, position: { x: cursorX, y: cursorY } });
            cursorX += sizeFor(action, ctx.mindmapLayout).width + GRID_GAP;
        });
        cursorY += row.height + GRID_GAP;
    });

    positioned.forEach(({ action, position }) => {
        const result = placeAction(action, position, ctx);
        // addNode refuses silently once the canvas hits its guest node ceiling,
        // so confirm the node actually landed rather than reporting a success
        // the user can't see anywhere.
        const live = new Set(useStore.getState().nodes.map((n) => n.id));
        const landed = result.ids.filter((id) => live.has(id));
        created.push(...landed);

        if (landed.length === 0 && result.ids.length > 0) {
            blocked += 1;
            ctx.step('error', `Couldn't add ${result.label} — the canvas is at its card limit`, undefined, { phase: 'place' });
        } else if (result.label) {
            placed.set(action, result);
            ctx.step('result', `Added ${result.label}`, undefined, {
                phase: 'place',
                // The ids let the trace line offer the cards as click-to-locate
                // chips, so "what exactly did it just put on my canvas" is
                // answerable from the transcript rather than by hunting.
                detail: { kind: 'cards', nodeIds: landed },
            });
        }
    });

    ctx.settle(
        placeStepId,
        created.length > 0 ? 'done' : 'failed',
        created.length > 0
            ? `Placed ${created.length} item${created.length === 1 ? '' : 's'} on the canvas`
            : 'Nothing could be placed',
        { phase: 'place', ...(created.length > 0 ? { detail: { kind: 'cards' as const, nodeIds: created } } : {}) },
    );

    if (created.length === 0) {
        return {
            createdNodeIds: [],
            summary: blocked > 0
                ? 'Nothing could be added — this canvas has hit its card limit. Delete a few cards or open a sub-canvas and try again.'
                : 'Nothing landed on the canvas — try rephrasing the request.',
        };
    }

    stampProvenance(created, ctx.provenance);
    // The panel focuses the canvas here, so the bodies are watched arriving.
    ctx.onPlaced?.([...created]);

    const writer = createCanvasStreamWriter();

    /* A card or document whose body failed is taken back off the canvas: a
       card with a title and nothing in it is worse than no card. */
    const removeFromCanvas = (ids: string[]) => {
        useStore.getState().bulkDeleteNodes(ids, true);
        for (const id of ids) {
            const at = created.indexOf(id);
            if (at !== -1) created.splice(at, 1);
        }
        ctx.onPlaced?.([...created]);
    };

    /* The final write for a body. An empty parse still leaves the text visible
       rather than blanking the card. */
    const finalBlocks = (markdown: string): Block[] => {
        const blocks = parseAIContent(markdown);
        return blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: markdown }];
    };

    try {
        await mapWithConcurrency(artifacts, budget.concurrency, async (artifact, index) => {
            assertLive(ctx.signal);
            // Mindmaps are labels all the way down; there is no body to write.
            if (artifact.type === 'mindmap') return;
            // Refused at the card limit: already reported, nothing to write into.
            const target = placed.get(artifact);
            if (!target) return;

            const label = `Writing ${SHAPE_LABEL[artifact.type].toLowerCase()} “${artifact.title}”`;
            // Light the line that was already announced, rather than adding a new one.
            const stepId = stepFor.get(artifact) ?? ctx.step('action', label, 'running', { phase: 'compose' });
            /* What this artifact is going to be, stated while it is being
               written rather than only after. It is knowable from the plan the
               moment writing starts, and it is the line that makes the wait
               informative instead of merely narrated. */
            const grounded = ctx.provenance?.sources?.length ?? 0;
            const shapeNote = [
                `aiming for ${budget.targetBlocks} blocks`,
                grounded ? `grounded on ${grounded} of your cards` : '',
            ].filter(Boolean).join(' · ');

            ctx.settle(stepId, 'running', label, {
                phase: 'compose',
                detail: { kind: 'artifact', shape: SHAPE_LABEL[artifact.type], title: artifact.title, index: index + 1, total: bodyWork.length, note: shapeNote },
            });

            const nodeId = target.ids[0];
            // A document carries its title as its first heading, as placeAction built it.
            const asMarkdown = (body: string) => (artifact.type === 'fused-note' ? `# ${artifact.title}\n\n${body}` : body);

            try {
                const body = await composeBody(
                    {
                        shape: artifact.type,
                        title: artifact.title,
                        brief: artifact.brief,
                        userRequest: query,
                        context,
                    },
                    {
                        ...ctx.request,
                        signal: ctx.signal,
                        onText: (partial) => writer.write(nodeId, parseAIContent(asMarkdown(normalizeAIText(partial)))),
                    },
                );
                artifact.content = body.markdown;
                writer.commit(nodeId, finalBlocks(asMarkdown(body.markdown)));
                if (body.thin) thin += 1;
                if (body.repaired) metrics.repaired += 1;
                metrics.blocks.push(body.blocks);
                ctx.settle(stepId, 'done', `${label} — ${body.blocks} blocks${body.thin ? ', came back thin' : ''}`, {
                    phase: 'compose',
                });
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') throw err;
                failed.push(artifact.title);
                removeFromCanvas(target.ids);
                ctx.settle(stepId, 'failed', `Couldn’t write “${artifact.title}” — removed it from the canvas`, { phase: 'compose' });
            }
        });
    } finally {
        // Whatever streamed before a stop or a failure stays visible.
        writer.flush();
    }

    assertLive(ctx.signal);

    const placeable = artifacts.filter((a) => placed.has(a) && !failed.includes(a.title));
    const duplicates = placeable
        .map((a) => existingTitles.get(a.title.trim().toLowerCase()))
        .filter((title): title is string => Boolean(title));
    if (created.length === 0) {
        return {
            createdNodeIds: [],
            summary: 'Every part of that came back unusable, so nothing was added. Try again, or lower the effort — shorter pieces come back cleanly more often.',
        };
    }

    /* Check the work before the user acts on it. Runs AFTER placement, not
       before: the cards are already useful, and holding them back behind
       another round trip would double the perceived latency of the one effort
       level that is already the slowest. */
    let concerns: { title: string; concern: string }[] = [];
    if (budget.verify) {
        const reviewable = placeable
            .filter((a) => typeof a.content === 'string' && a.content.trim())
            .map((a) => ({ title: a.title, body: a.content as string }));
        if (reviewable.length > 0) {
            const verifyStep = ctx.step('action', 'Checking the claims it made', 'running', { phase: 'verify' });
            concerns = await verifyArtifacts(reviewable, context, ctx.request);
            ctx.settle(
                verifyStep,
                'done',
                concerns.length === 0
                    ? 'Checked the claims — nothing flagged'
                    : `Flagged ${concerns.length} claim${concerns.length === 1 ? '' : 's'} worth verifying`,
                {
                    phase: 'verify',
                    ...(concerns.length > 0
                        ? { detail: { kind: 'note' as const, text: concerns.map((c) => `“${c.title}” — ${c.concern}`).join('\n') } }
                        : {}),
                },
            );
        }
    }

    recordAIRun({
        at: startedAt,
        effort: ctx.request?.effort ?? 'efficient',
        planned: artifacts.length,
        placed: placeable.length,
        failed: failed.length,
        repaired: metrics.repaired,
        thin,
        blocks: metrics.blocks,
        durationMs: Date.now() - startedAt,
    });

    /* Partial success is stated, not hidden. The old all-or-nothing path had
       nothing to say here because there was no such thing as a partial turn. */
    const notes: string[] = [];
    if (failed.length > 0) {
        notes.push(`${failed.length} of ${artifacts.length} couldn’t be written and ${failed.length === 1 ? 'was' : 'were'} skipped: ${failed.map((t) => `“${t}”`).join(', ')}.`);
    }
    if (thin > 0) {
        notes.push(`${thin} came back shorter than this effort level usually gives — asking again often fixes it.`);
    }
    if (concerns.length > 0) {
        notes.push(`Worth checking: ${concerns.map((c) => `“${c.title}” — ${c.concern}`).join(' ')}`);
    }
    if (duplicates.length > 0) {
        notes.push(`You already had ${duplicates.length === 1 ? 'a card' : 'cards'} called ${duplicates.map((t) => `“${t}”`).join(', ')} on this canvas — these are new, so merge or undo if that was not what you wanted.`);
    }

    return { createdNodeIds: created, summary: notes.join(' ') };
}
