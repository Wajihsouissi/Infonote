import assert from 'node:assert/strict';
import { CommitQueue } from '../src/features/card/reading/CommitQueue';
import { nextReadingCount } from '../src/features/card/reading/readingBudget';

function fixture() {
    let id = 0, paused = false;
    const frames = new Map<number, () => void>(), timers = new Map<number, () => void>();
    const queue = new CommitQueue({
        requestFrame: callback => { frames.set(++id, callback); return id; },
        cancelFrame: handle => { frames.delete(handle); },
        setTimer: callback => { timers.set(++id, callback); return id; },
        clearTimer: handle => { timers.delete(handle); },
        paused: () => paused,
    }, 400);
    const frame = () => { const entries = [...frames]; frames.clear(); entries.forEach(([, callback]) => callback()); };
    return { queue, frames, timers, frame, pause: (value: boolean) => { paused = value; } };
}
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }

check('only the active ticket can release a pending commit', () => {
    const f = fixture(), runs: number[] = [];
    const one = f.queue.schedule(() => runs.push(1), 'reading');
    const two = f.queue.schedule(() => runs.push(2), 'reading');
    f.frame(); two.commit(); f.frame();
    assert.deepEqual(runs, [1]);
    one.commit(); f.frame(); assert.deepEqual(runs, [1, 2]);
    one.commit(); assert.equal(f.timers.size, 1); two.commit(); assert.equal(f.timers.size, 0);
});
check('editors take priority and reading work keeps FIFO order', () => {
    const f = fixture(), runs: string[] = [];
    const one = f.queue.schedule(() => runs.push('first reader'), 'reading');
    const two = f.queue.schedule(() => runs.push('second reader'), 'reading');
    const editor = f.queue.schedule(() => runs.push('editor'), 'interactive');
    f.frame(); editor.commit(); f.frame(); one.commit(); f.frame(); two.commit();
    assert.deepEqual(runs, ['editor', 'first reader', 'second reader']);
});
check('cancelled work consumes no release or commit wait', () => {
    const f = fixture(); let ran = 0;
    const cancelled = f.queue.schedule(() => ran++, 'reading');
    const next = f.queue.schedule(() => ran++, 'reading');
    cancelled.cancel(); f.frame(); assert.equal(ran, 1);
    next.cancel(); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
});
check('cancelling the final pending job cancels its frame', () => {
    const f = fixture(); const job = f.queue.schedule(() => assert.fail('cancelled job ran'), 'reading');
    job.cancel(); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
});
check('a stale timeout or acknowledgement cannot release a later job', () => {
    const f = fixture(); let ran = 0;
    const first = f.queue.schedule(() => ran++, 'reading');
    const second = f.queue.schedule(() => ran++, 'reading');
    f.frame(); const stale = [...f.timers.values()][0];
    first.commit(); f.frame(); stale(); first.commit();
    assert.equal(ran, 2); assert.equal(f.timers.size, 1); second.commit();
});
check('a missing commit has a bounded wait and cannot deadlock the queue', () => {
    const f = fixture(); let ran = 0;
    f.queue.schedule(() => ran++, 'reading');
    const next = f.queue.schedule(() => ran++, 'reading');
    f.frame(); [...f.timers.values()][0](); f.frame(); next.commit(); assert.equal(ran, 2);
});
check('streaming parks work and resumes without duplicate releases', () => {
    const f = fixture(); let ran = 0;
    const job = f.queue.schedule(() => ran++, 'reading');
    f.pause(true); f.frame(); f.frame(); assert.equal(ran, 0); assert.equal(f.frames.size, 1);
    f.pause(false); f.frame(); job.commit(); f.frame(); assert.equal(ran, 1);
});
check('a throwing job releases ownership and preserves the error', () => {
    const f = fixture(), cause = new Error('render failed'); let ran = 0;
    f.queue.schedule(() => { throw cause; }, 'reading');
    const next = f.queue.schedule(() => ran++, 'reading');
    assert.throws(f.frame, error => error === cause); f.frame(); next.commit(); assert.equal(ran, 1);
});
check('a long text document releases a bounded contiguous prefix', () => {
    const costs = Array(1211).fill(1);
    assert.equal(nextReadingCount(costs, 0, 16), 16);
    assert.equal(nextReadingCount(costs, 1200, 16), 1211);
    assert.equal(nextReadingCount([], 0, 16), 0);
});
check('complex blocks get their own commit without starving later content', () => {
    const costs = [...Array(15).fill(1), 16, 1];
    assert.equal(nextReadingCount(costs, 0, 16), 15);
    assert.equal(nextReadingCount(costs, 15, 16), 16);
    assert.equal(nextReadingCount(costs, 16, 16), 17);
    assert.equal(nextReadingCount([1000, 1], 0, 96), 1);
});
check('all table rows eventually release without skipping or duplicating a row', () => {
    const costs = Array(121).fill(8); let count = 0, batches = 0;
    while (count < costs.length) { const next = nextReadingCount(costs, count, 96); assert(next > count); assert(next - count <= 12); count = next; batches++; }
    assert.equal(count, 121); assert.equal(batches, 11);
});
console.log(`${checks} reading work checks passed.`);
