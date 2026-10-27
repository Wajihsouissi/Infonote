import { Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NoteBodyPreview } from '../src/features/card/ui/content/NoteBodyPreview';
import { setOverviewZoom } from '../src/features/canvas/hooks/viewport/viewportStreamingStore';

const blocks = Array.from({ length: 500 }, (_, i) => ({ id: `threshold-${i}`, type: 'text' as const, content: `Evidence paragraph ${i}` }));
const commits: Record<string, number> = { complete: 0, compact: 0 };
const probe = { commits, reset: () => { commits.complete = commits.compact = 0; } };
Object.assign(window, { __readerThresholdProbe: probe });
export function Probe() {
    const [complete, setComplete] = useState(true);
    return <>
        <button onClick={() => setOverviewZoom(.1)}>Zoom out</button>
        <button onClick={() => setOverviewZoom(1)}>Zoom in</button>
        <button onClick={() => setComplete(value => !value)}>Switch presentation</button>
        <div data-probe="complete"><Profiler id="complete" onRender={id => { commits[id]++; }}><NoteBodyPreview content={blocks} complete={complete} /></Profiler></div>
        <div data-probe="compact"><Profiler id="compact" onRender={id => { commits[id]++; }}><NoteBodyPreview content={blocks} /></Profiler></div>
    </>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
