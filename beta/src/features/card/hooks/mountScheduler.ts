import { isStreaming } from '../../canvas/hooks/viewport/viewportStreamingStore';
import { CommitQueue } from '../reading/CommitQueue';

const COMMIT_TIMEOUT_MS = 400;
const queue = new CommitQueue({
    requestFrame: callback => requestAnimationFrame(callback),
    cancelFrame: id => cancelAnimationFrame(id),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: id => window.clearTimeout(id),
    paused: isStreaming,
}, COMMIT_TIMEOUT_MS);

/** Requested editors go ahead of passive reading batches. */
export const scheduleMount = (job: () => void) => queue.schedule(job, 'interactive');
export const scheduleReading = (job: () => void) => queue.schedule(job, 'reading');
