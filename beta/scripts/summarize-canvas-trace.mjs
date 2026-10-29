import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/summarize-canvas-trace.mjs <diagnostic-pan-trace.json>');
const trace = JSON.parse(await readFile(filename, 'utf8'));
const mainThreads = trace.traceEvents.filter(e => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
const summaries = mainThreads.map(thread => {
    const events = trace.traceEvents.filter(e => e.pid === thread.pid && e.tid === thread.tid && e.ph === 'X' && e.dur > 0)
        .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const stack = [], totals = new Map();
    let crossingIntervals = 0;
    for (const event of events) {
        while (stack.length && stack.at(-1).end <= event.ts) stack.pop();
        const value = { event, end: event.ts + event.dur, self: event.dur };
        const parent = stack.at(-1);
        if (parent) {
            if (value.end <= parent.end) parent.self -= event.dur;
            else crossingIntervals++;
        }
        stack.push(value);
        // Keep the record itself: descendants subtract their duration later.
        const list = totals.get(event.name) || [];
        list.push(value);
        totals.set(event.name, list);
    }
    return { pid: thread.pid, tid: thread.tid, completeEvents: events.length, crossingIntervals,
        events: [...totals].map(([name, values]) => ({ name, count: values.length,
            inclusiveMs: values.reduce((sum, v) => sum + v.event.dur, 0) / 1000,
            selfMs: values.reduce((sum, v) => sum + v.self, 0) / 1000,
            maxMs: values.reduce((max, v) => Math.max(max, v.event.dur), 0) / 1000,
        })).sort((a, b) => b.selfMs - a.selfMs),
    };
});
const report = { source: path.basename(filename), diagnosticOnly: true,
    notes: ['Native tracing changes timing; do not combine these durations with unprofiled frame cohorts.',
        'Self time uses nested complete (X) events on renderer main threads. B/E and asynchronous events are not included.',
        'Inclusive durations overlap across parent/child categories. Crossing intervals, if present, make self-time attribution approximate.'],
    rendererMainThreads: summaries,
};
const output = path.join(path.dirname(filename), 'diagnostic-pan-summary.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, threads: summaries.map(t => ({ ...t, events: t.events.slice(0, 12) })) }, null, 2));
