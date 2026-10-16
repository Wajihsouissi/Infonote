import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { getNodeBlocks } from '../../../types';
import { parseAIContent } from '../../editor/text/aiMarkdown';
import { extractJsonFromString } from '../../../services/ai/structured';
import { generateText } from '../../../services/ai/text';
import { structuredEffortDirective } from '../../../config/aiEffort';
import { nodeTitle } from '../canvasContext';
import { assertLive, type RunnerContext, type RunnerResult } from './context';

/**
 * Rewrite the cards the user has selected, one at a time.
 * Each card gets its own step so a failure on card 3 is visible and the other
 * edits still stand.
 */
export async function runEdit(query: string, selectedIds: string[], ctx: RunnerContext): Promise<RunnerResult> {
    const { updateNodeData } = useStore.getState();
    let edited = 0;

    for (const nodeId of selectedIds) {
        assertLive(ctx.signal);
        const node = useStore.getState().nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const title = nodeTitle(node);
        const stepId = ctx.step('action', `Rewriting “${title}”`, 'running');

        const description = node.type === 'note' ? node.data.description || '' : '';
        const contentText = (getNodeBlocks(node.data) ?? [])
            .map((b) => (typeof b.content === 'string' ? b.content : ''))
            .join('\n');

        /* The effort directive has to be inlined rather than passed as a system
           prompt: generateText only folds effort into `system`, and this call
           deliberately sends none (system prompts are reserved for free-form
           writing). Without this the token CEILING still applied while the
           instruction to be brief did not — Fast capped the reply at 800 tokens
           and nothing told the model to fit, which is what manufactured the
           truncated JSON this function then had to cope with. */
        const effortNote = ctx.request?.effort ? `\n${structuredEffortDirective(ctx.request.effort)}\n` : '';

        const prompt = `You are editing an existing card in a note app.
Current title: "${title}"
Current description: "${description}"
Current body:
"${contentText}"

The user's instruction:
"${query}"
${effortNote}
Respond ONLY with a valid JSON object. No markdown, no code fences, no commentary.
{
  "title": "...",       // updated title, or the same one if unchanged
  "description": "...", // short summary reflecting the edit
  "content": "..."      // the full updated body, markdown allowed
}`;

        try {
            const responseText = await generateText(prompt, ctx.request);

            /* Was `responseText.match(/\{[\s\S]*\}/)` — the same greedy pattern
               extractJsonFromString was written to replace (see its comment
               there). On a reply truncated at the effort ceiling, or one
               whose prose happens to contain braces, that match failed and the
               old else-branch wrote the RAW MODEL REPLY over the card body,
               destroying whatever the user had written. There is no longer a
               path that writes on a parse failure: a card we can't edit is left
               exactly as it was. */
            const jsonStr = extractJsonFromString(responseText, 'object');
            const result = jsonStr
                ? JSON.parse(jsonStr) as { title?: string; description?: string; content?: string }
                : null;

            if (!result) {
                ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}” — left unchanged`);
                continue;
            }

            const newContent = typeof result.content === 'string' ? result.content.trim() : '';
            const update: Record<string, unknown> = {};

            if (newContent) {
                const blocks = parseAIContent(newContent);
                update.content = blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: newContent }];
            }
            if (node.type === 'note') {
                update.label = result.title || title;
                update.description = result.description || description;
            }

            // A title-only reply is the classic truncation shape. Apply what came
            // back rather than blanking the body, and say so.
            if (Object.keys(update).length === 0) {
                ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}” — left unchanged`);
                continue;
            }

            /* Keep what is being overwritten so the change is reversible on its
               own (ai-Plan.md §5.7). This is the one path that destroys the
               user's own writing;
               Ctrl+Z is a blunt instrument for that — it walks back everything
               since, and the user has to notice within the undo window. A
               per-card snapshot makes "put that one back" a specific action. */
            ctx.edits?.push({
                nodeId,
                title,
                before: {
                    ...(node.type === 'note' ? { label: node.data.label, description } : {}),
                    content: getNodeBlocks(node.data) ?? [],
                },
            });

            updateNodeData(nodeId, update);
            edited += 1;
            ctx.settle(stepId, 'done', newContent
                ? `Rewrote “${title}”`
                : `Updated the title of “${title}” — no new body was returned`);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}”`);
        }
    }

    return {
        createdNodeIds: [],
        summary: edited === 0
            ? 'No cards were changed.'
            : `Updated ${edited} card${edited === 1 ? '' : 's'} in place. Undo with Ctrl+Z if it isn't what you wanted.`,
    };
}
