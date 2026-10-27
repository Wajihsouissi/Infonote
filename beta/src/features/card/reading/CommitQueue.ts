export interface RenderTicket { commit(): void; cancel(): void }

interface Clock {
    requestFrame(callback: () => void): number;
    cancelFrame(id: number): void;
    setTimer(callback: () => void, delay: number): number;
    clearTimer(id: number): void;
    paused(): boolean;
}
interface Work { run(): void; ticket: RenderTicket }

/** One outstanding React commit across card readers and editor mounts.
 * A ticket acknowledges only its own work, never another component's commit. */
export class CommitQueue {
    private interactive = new Set<Work>();
    private reading = new Set<Work>();
    private active: Work | null = null;
    private frame: number | null = null;
    private timer: number | null = null;
    private clock: Clock;
    private commitTimeoutMs: number;
    constructor(clock: Clock, commitTimeoutMs: number) {
        this.clock = clock;
        this.commitTimeoutMs = commitTimeoutMs;
    }

    schedule(run: () => void, priority: 'interactive' | 'reading'): RenderTicket {
        const queue = priority === 'interactive' ? this.interactive : this.reading;
        const work: Work = { run, ticket: {
            commit: () => this.finish(work),
            cancel: () => { queue.delete(work); this.finish(work); this.idle(); },
        } };
        queue.add(work);
        this.wake();
        return work.ticket;
    }
    private finish(work: Work) {
        if (this.active !== work) return;
        if (this.timer !== null) this.clock.clearTimer(this.timer);
        this.timer = null;
        this.active = null;
        this.wake();
    }
    private idle() {
        if (this.active || this.interactive.size || this.reading.size || this.frame === null) return;
        this.clock.cancelFrame(this.frame);
        this.frame = null;
    }
    private wake() {
        if (this.active || this.frame !== null || (!this.interactive.size && !this.reading.size)) return;
        this.frame = this.clock.requestFrame(() => {
            this.frame = null;
            if (this.clock.paused()) { this.wake(); return; }
            const queue = this.interactive.size ? this.interactive : this.reading;
            const work = queue.values().next().value;
            if (!work) return;
            queue.delete(work);
            this.active = work;
            // Removed consumers cannot stall every reader indefinitely.
            this.timer = this.clock.setTimer(() => this.finish(work), this.commitTimeoutMs);
            try { work.run(); }
            catch (error) { this.finish(work); throw error; }
        });
    }
}
