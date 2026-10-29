import { useStore } from '../../../store/useStore';

type LinkEvent = {
    target: EventTarget | null; currentTarget: EventTarget | null; defaultPrevented: boolean;
    preventDefault(): void; stopPropagation(): void;
};

export function revealCitationNode(id: string): boolean {
    const state = useStore.getState(), node = state.nodes.find(node => node.id === id);
    if (!node) return false;
    const parent = node.parentId ?? null;
    if (state.currentParentId !== parent) state.navigateToNode(parent);
    useStore.getState().setSelectedCanvasNodeIds(new Set([id]));
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } })));
    return true;
}

/** Atomic chips behave consistently in live editors and static readers. */
export function handleInlineLinkClick(event: LinkEvent): boolean {
    if (event.defaultPrevented || !(event.target instanceof Element)) return false;
    const link = event.target.closest('[data-page-id], [data-cite-node]');
    if (!link || !(event.currentTarget instanceof Element) || !event.currentTarget.contains(link)) return false;
    event.preventDefault(); event.stopPropagation();
    const citation = link.getAttribute('data-cite-node');
    if (citation) { revealCitationNode(citation); return true; }
    const id = link.getAttribute('data-page-id');
    const state = useStore.getState();
    if (id && state.nodes.some(node => node.id === id)) state.setFullscreenId(id);
    return true;
}

export function handleInlineLinkKeyDown(event: LinkEvent & { key: string }): void {
    if (!(event.target instanceof Element) || !event.target.closest('[data-page-id], [data-cite-node]')) return;
    if (event.key === 'Enter' || event.key === ' ') handleInlineLinkClick(event);
    // Tab belongs to browser focus navigation, not the paragraph indent shortcut.
    else if (event.key === 'Tab') event.stopPropagation();
}
