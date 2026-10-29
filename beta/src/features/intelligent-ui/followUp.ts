import { useStore } from '../../store/useStore';
import type { IntelligentUIArtifact, UIFollowUp } from './types';

let pending: { query: string; brief: string } | undefined;
const listeners = new Set<() => void>();
export function requestUIFollowUp(artifact: IntelligentUIArtifact, request: UIFollowUp): void {
    if (useStore.getState().aiIsRunning || pending) throw new Error('Wait for the current answer, then try again.');
    pending = { query: request.text, brief: `[INTERACTIVE SCENARIO]\n${artifact.title}\nOriginal request: ${artifact.prompt}\nSelected values: ${JSON.stringify(request.values)}\n[END SCENARIO]\n\n` };
    useStore.getState().openAIPanel('ask');
    for (const listener of listeners) listener();
}
export function subscribeUIFollowUps(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function takeUIFollowUp(): typeof pending {
    const text = pending; pending = undefined; return text;
}
