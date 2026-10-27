import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useEditorDocument } from '../src/features/editor/hooks/useEditorDocument';
import type { Block } from '../src/features/editor/types';

/** Exercises the actual document hook, with disposable in-memory owner data. */
export async function runDocumentChecks(): Promise<string[]> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const saved: Block[][] = [];
    const results: string[] = [];
    let api: ReturnType<typeof useEditorDocument>;
    const original: Block[] = [{ id: 'probe', type: 'text', content: 'Original' }];
    function Probe({ incoming }: { incoming: Block[] }) {
        api = useEditorDocument({ initialContent: incoming, onUpdate: next => saved.push(next) });
        useLayoutEffect(() => { api.syncFromOwner(); }, [incoming]);
        return null;
    }
    const check = (condition: boolean, name: string) => {
        if (!condition) throw new Error(name);
        results.push(`PASS ${name}`);
    };
    const edit = (content: string) => flushSync(() => {
        const next: Block[] = [{ ...api.blocksRef.current[0], content }];
        api.setBlocks(next);
        api.commit(next);
    });
    try {
        flushSync(() => root.render(<Probe incoming={original} />));
        flushSync(() => {
            api.setBlocks(previous => [{ ...previous[0], content: 'First' }]);
            api.setBlocks(previous => [{ ...previous[0], content: previous[0].content + ' second' }]);
        });
        check(api!.blocksRef.current[0].content === 'First second', 'batched commands read the latest document');

        const start = performance.now();
        let i = 0;
        while (performance.now() - start < 1700) {
            edit(`Continuous ${i++}`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        check(saved.length > 0, 'continuous typing publishes within the maximum delay');
        edit('Pending at pagehide');
        window.dispatchEvent(new Event('pagehide'));
        check(saved.at(-1)?.[0].content === 'Pending at pagehide', 'pagehide publishes the pending snapshot');

        edit('Typing when removed');
        flushSync(() => root.render(<Probe incoming={[]} />));
        check(!api!.blocksRef.current.some(block => block.id === 'probe'), 'incoming empty document removes the pending original block');
        api!.flush();
        check(!saved.at(-1)?.some(block => block.id === 'probe'), 'deleted block stays absent when saved');

        edit('Pending at unmount');
        flushSync(() => root.unmount());
        check(saved.at(-1)?.[0].content === 'Pending at unmount', 'unmount publishes the pending snapshot');
        return results;
    } finally {
        if (host.isConnected) {
            // Unmount is idempotent after the explicit unmount check.
            root.unmount();
            host.remove();
        }
    }
}
