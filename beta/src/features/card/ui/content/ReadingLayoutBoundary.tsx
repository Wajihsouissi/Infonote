import { Component, createRef, type ReactNode } from 'react';

interface Props { editing: boolean; children: ReactNode }
interface Snapshot {
    top: number;
    heights: Map<string, number>;
    tables: Map<string, number>;
    anchor?: { id: string; y: number };
}

/** React's before-mutation snapshot preserves native containment measurements
 * when a reader/editor adapter changes. No document data or history is written. */
export class ReadingLayoutBoundary extends Component<Props, Record<string, never>, Snapshot | null> {
    private host = createRef<HTMLDivElement>();

    getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
        if (previous.editing === this.props.editing) return null;
        const host = this.host.current;
        const scroll = host?.closest<HTMLElement>('.infonote-scrollable');
        if (!host || !scroll) return null;
        const viewport = scroll.getBoundingClientRect();
        const heights = new Map<string, number>();
        let anchor: Snapshot['anchor'];
        host.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block => {
            const id = block.dataset.blockId!;
            // Reading offsetHeight of a contained outer block does not request
            // its skipped descendants' geometry. Preserve measured AND estimated sizes.
            heights.set(id, block.offsetHeight);
            if (!anchor) {
                const box = block.getBoundingClientRect();
                if (box.bottom > viewport.top && box.top < viewport.bottom) anchor = { id, y: box.y };
            }
        });
        const tables = new Map<string, number>();
        host.querySelectorAll<HTMLElement>('[data-table-scroll]').forEach(table => {
            const id = table.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
            if (id) tables.set(id, table.scrollLeft);
        });
        return { top: scroll.scrollTop, heights, tables, anchor };
    }

    componentDidUpdate(_previous: Props, _state: Record<string, never>, snapshot: Snapshot | null) {
        const host = this.host.current;
        const scroll = host?.closest<HTMLElement>('.infonote-scrollable');
        if (!snapshot || !host || !scroll) return;
        host.querySelectorAll<HTMLElement>('[data-defer-offscreen][data-block-id]').forEach(block => {
            const height = snapshot.heights.get(block.dataset.blockId!);
            if (height !== undefined) block.style.containIntrinsicBlockSize = `auto ${height}px`;
        });
        scroll.scrollTop = snapshot.top;
        host.querySelectorAll<HTMLElement>('[data-table-scroll]').forEach(table => {
            const id = table.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
            if (id) table.scrollLeft = snapshot.tables.get(id) ?? 0;
        });
        if (snapshot.anchor) {
            const anchor = host.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(snapshot.anchor.id)}"]`);
            const scale = scroll.offsetWidth ? scroll.getBoundingClientRect().width / scroll.offsetWidth : 1;
            if (anchor && scale) scroll.scrollTop += (anchor.getBoundingClientRect().y - snapshot.anchor.y) / scale;
        }
    }

    render() { return <div ref={this.host}>{this.props.children}</div>; }
}
