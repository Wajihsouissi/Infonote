import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import type { AIPhase } from '../../aiTypes';

/**
 * The run's phase decides which orb plays, so the animation carries the same
 * information as the trace line beside it rather than repeating "busy".
 */
const PHASE_ORB: Record<AIPhase, OrbState> = {
    route: 'listening',
    clarify: 'breathing',
    gather: 'searching',
    compose: 'composing',
    place: 'shaping',
    attribute: 'connecting',
    verify: 'solving',
};

export function AIThinkingOrb({ phase, size = 20 }: { phase?: AIPhase; size?: 20 | 64 }) {
    return <ThinkingOrb state={phase ? PHASE_ORB[phase] : 'working'} size={size} aria-hidden="true" />;
}
