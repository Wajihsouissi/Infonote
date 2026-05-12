# Infonote — Feature Audit Report

Scope: the 14 user stories listed alongside the Supabase integration request, plus
cross-cutting issues discovered during the Supabase wiring work. This report
documents **observed behavior vs. expected behavior** with file/line evidence
and a severity tag. No application code is modified by this audit — fixes will
be applied in a follow-up pass after you approve them.

Severity legend:
- **P0** — breaks a listed user story / data at risk
- **P1** — visible defect or spec mismatch, workaround exists
- **P2** — code smell, maintainability, lint
- **P3** — doc/spec drift only

---

## Cross-cutting findings

### C1. Grid snap step is inconsistent across spec, docs, code and tests (P1)

The snapping story is referenced by user stories **#2 (Node Creation)**,
**#3 (Drag & Drop)** and **#4 (Resize)**. The intended step is stated three
different ways:

- User story #2: *"Grid snapping: 112px (2 grid units) increments"*.
- `test_specifications.md` and the README likely repeat the 112px figure.
- [layout.ts#L3-L10](file:///c:/Users/LENOVO/Desktop/Infonote/src/config/layout.ts#L3-L10) — file header comment says `SNAP_STEP is 112px (2 * BASE_UNIT)` but line 10 sets `export const SNAP_STEP = 56; // Unified to 56 for consistency`.
- [CanvasBoard.tsx#L150](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/canvas/CanvasBoard.tsx#L150) — `const snapGrid: [number, number] = [56, 56];` (hard-coded, not sourced from `layout.ts`).
- [useCanvasNodeDrag.ts](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/canvas/hooks/useCanvasNodeDrag.ts) lines 184-185 — uses `snapToGridValue` which rounds to `BASE_UNIT` (56px).
- Only the **fused note** flow uses the 2-unit step via `MODULE_SNAP_STEP = 112` ([layout.ts#L27](file:///c:/Users/LENOVO/Desktop/Infonote/src/config/layout.ts#L27)).

Effect: notes snap on a 56px grid while the spec / user-facing docs promise
112px. User story #3 will fail the specification test as written. Also
`CanvasBoard.snapGrid` hard-codes the value, so fixing `SNAP_STEP` alone would
not fix the canvas.

Fix proposal (needs your call on whether the product wants 56 or 112):
1. Pick one canonical value.
2. Remove the hardcoded `[56, 56]` in `CanvasBoard.tsx` and source from `SNAP_STEP` in `layout.ts`.
3. Update the header comment in `layout.ts` to match the chosen value.
4. Update `test_specifications.md` and user-story docs to match.

### C2. File-system auto-reconnect swallows all errors silently (P1)

[StorageManager.ts `autoReconnect`](file:///c:/Users/LENOVO/Desktop/Infonote/src/services/StorageManager.ts) catches everything and returns without surfacing a reason. If permission was revoked or the folder moved, the user sees the "disconnected" icon with no diagnostic.

Fix proposal: pass the thrown message up through the status callback so
`StorageControls` can render it in its error badge.

### C3. Pre-existing TypeScript errors block `npm run build` (P0 for release, P2 today)

Running `npx tsc -b` on a clean tree reports **21 errors** that predate this
Supabase work. They include:

- [CoverPicker.tsx#L1](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/card/CoverPicker.tsx#L1) — unused `useEffect` import.
- [NoteCard.tsx#L577](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/card/NoteCard.tsx#L577) — `NoteExpandedContent` is passed `showMetadata` prop that does not exist on the component's props type (`TS2322`). **This is a real bug**, not lint — the prop is being dropped silently.
- [ColorBlock.tsx#L199](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/editor/ColorBlock.tsx#L199) — unused `autoName`.
- [ContainerBlock.tsx#L1](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/editor/ContainerBlock.tsx#L1) — unused `React` import.
- [useBlockCommands.ts#L4, L27](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/editor/hooks/useBlockCommands.ts) — unused `useStore` import and `nodeId` parameter.
- [VirtualBlockList.tsx#L3](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/editor/VirtualBlockList.tsx#L3) — `react-window` no longer exports `FixedSizeList` / `ListChildComponentProps` (API was renamed to `CellComponentProps`). **This file currently does not compile.** Virtual block rendering is broken.
- [KanbanCalendarView.tsx#L80](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/kanban/KanbanCalendarView.tsx#L80) — unused `getDaysInMonth`.
- [KanbanColumn.tsx#L46](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/kanban/KanbanColumn.tsx#L46) — unused callback param.
- [SearchResults.tsx#L4](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/ui/SearchResults.tsx#L4), [searchUtils.ts#L1](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/ui/searchUtils.ts#L1) — unused imports.
- [FileSystemStorage.ts#L41, L237, L489](file:///c:/Users/LENOVO/Desktop/Infonote/src/services/FileSystemStorage.ts) — unused private field `_lastSavedState`, unused `options`, dead `syncCardsToFolders` (commented out at call site).
- [nodeSlice.ts#L577](file:///c:/Users/LENOVO/Desktop/Infonote/src/store/slices/nodeSlice.ts#L577) — unused `currentParentId`.
- [throttle.ts#L18, L26](file:///c:/Users/LENOVO/Desktop/Infonote/src/utils/throttle.ts) — `TS2683: 'this' implicitly has type 'any'`.

The two items in **bold** are functional bugs. The rest are lint-level but
still break `npm run build`. Fixing them is quick.

### C4. `src/main.tsx` double-wraps `ErrorBoundary` (P2)

[main.tsx#L15-L19](file:///c:/Users/LENOVO/Desktop/Infonote/src/main.tsx) and [App.tsx#L7-L11](file:///c:/Users/LENOVO/Desktop/Infonote/src/App.tsx) both render `<ErrorBoundary>`. Harmless but redundant.

---

## User story audit

### Story 1 — Infinite Canvas Navigation (P3)

**Expected:** infinite pan/zoom, custom grid, viewport culling.
**Observed:** matches. [CanvasBoard.tsx#L195-L198](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/canvas/CanvasBoard.tsx#L195-L198) sets `minZoom={0.05}`, `maxZoom={2}`, `snapToGrid={true}`. Custom grid in `DragGridOverlay.tsx` + `CustomGrid.tsx`. Viewport culling in `useCanvasViewport.ts`.
**Finding:** `deleteKeyCode={null}` disables Delete-key node deletion on the canvas. This may be intentional but worth confirming against the spec — typical expectation on an infinite-canvas app is that Delete deletes selected nodes.

### Story 2 — Node Creation & Positioning (P1)

**Expected:** create note/block/kanban at positions, grid-snapped in 112px increments, no overlaps via `findNonOverlappingPosition`.
**Observed:**
- `findNonOverlappingPosition` lives in [BottomMenu.tsx#L86-L177](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/ui/BottomMenu.tsx#L86-L177) and is re-implemented inline. **Not grid-snapped** — it returns raw candidate coords without rounding to `SNAP_STEP` or `MODULE_SNAP_STEP`. Combined with C1, creation can place a node off-grid until the first drag snaps it.
- Default new-note size is hard-coded `432 x 432` ([BottomMenu.tsx#L184-L185](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/ui/BottomMenu.tsx#L184-L185)) — equal to `MIN_EXPANDED_SIZE` in `layout.ts` but duplicated.
**Fix proposal:** snap candidate positions in `findNonOverlappingPosition`; import sizing constants from `layout.ts`.

### Story 3 — Node Drag & Drop (P1)

**Expected:** "Grid snap enforced via position constraints" at 112px.
**Observed:** snapping runs through `snapToGridValue` (56px) — see C1. Drag itself works. React Flow `snapGrid={[56,56]}` attribute on `CanvasBoard` provides visual snap during the drag.
**Finding:** multi-node drag offset math in [useCanvasNodeDrag.ts#L182-L187](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/canvas/hooks/useCanvasNodeDrag.ts#L182-L187) looks correct for the 56px choice. If/when the product picks 112px, this hook must also be updated.

### Story 4 — Node Resizing with Grid Snap (P1)

**Expected:** icon (2x2 = 96px), medium (4x4 = 208px), expanded (8x8+). Auto-grow via ResizeObserver, prevented oscillations.
**Observed:** [calculateNoteLayout in layout.ts#L61-L100](file:///c:/Users/LENOVO/Desktop/Infonote/src/config/layout.ts#L61-L100) matches the spec thresholds. Auto-grow present on NoteCard (tracked via `activeResize` ref and ResizeObserver).
**Finding:** the expanded branch snaps to `MODULE_SNAP_STEP` (112px), which is inconsistent with the rest of the canvas snapping at 56px. This is the design intent for expanded notes (see layout.ts#L25-L28 comment "premium modular feel") but conflicts with user story #3's 112px global expectation. Ties into C1.

### Story 5 — Node Connections & Relationships (no defects found)

**Expected:** edges connect nodes via React Flow; `onConnect` handler; edges carry `parentId` in data.
**Observed:** [nodeSlice onConnect](file:///c:/Users/LENOVO/Desktop/Infonote/src/store/slices/nodeSlice.ts) present. No observed defect in a quick read — needs runtime exercise to confirm the `parentId` field on edges is actually populated as the story claims.

### Story 6 — Box Selection & Multi-Node Operations (no defects found)

**Expected:** Ctrl-drag box selection, bulk operations.
**Observed:** [useCanvasBoxSelection.ts](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/canvas/hooks/useCanvasBoxSelection.ts) implements it; `selectionMode={SelectionMode.Partial}`; `nodeSlice` exposes `bulkDeleteNodes`, `bulkDuplicateNodes`, `bulkApplyColor`.
**Finding (P3):** UI bulk-color relies on `bulkApplyColor`; `MultiSelectionToolbar` is rendered. Appears complete — mark verified after a runtime smoke test.

### Story 7 — View Modes (P0)

**Expected:** icon/medium/expanded/chromeless based on size; `getStrictSize` / `calculateNoteLayout`; `NoteCard` handles all view modes; `FusedNoteNode` for hybrid.
**Observed:** NoteCard reads `data.viewMode || 'medium'` at [NoteCard.tsx#L52](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/card/NoteCard.tsx#L52). Calculation in `layout.ts` matches spec.
**Finding (P0):** [NoteCard.tsx#L577](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/card/NoteCard.tsx#L577) passes `showMetadata` and `setShowMetadata` to `NoteExpandedContent`, but the component's prop type does not declare them (TypeScript error `TS2322`). Either the expanded content never receives the metadata-toggle state, or the component reads it via some other path and the prop is dead — **this is observable in the TS build and needs investigation**.

### Story 8 — Note Metadata Management (P2)

**Expected:** MetadataMenu, IconPicker (Lucide), ChipInput for tags, NoteData type.
**Observed:** [NoteData type in src/types.ts#L3-L40](file:///c:/Users/LENOVO/Desktop/Infonote/src/types.ts#L3-L40) has all the fields (`tags`, `priority`, `status`, dates, assignee, url, color, progress, subtasks). `IconPicker`, `ChipInput`, `MetadataMenu` all present.
**Finding (P2):** `category` is typed as `string` with comment "Allow legacy or keep as string" while `tags: string[]` exists. Schema is ambiguous — recommend deprecating `category` in favor of `tags`, or documenting the split clearly.

### Story 9 — Task Management Properties (no defects found)

Properties directory at `src/features/card/properties/` has the 12 files expected (StatusProperty, PriorityProperty, DateProperty, SubtaskProperty, ProgressProperty, etc.). No obvious bug without runtime verification.

### Story 10 — Note Navigation & Drill-Down (P1)

**Expected:** `navigationSlice` tracks `currentParentId`, `reconstructBreadcrumbs` handles path restoration.
**Observed:** [navigationSlice.ts#L5](file:///c:/Users/LENOVO/Desktop/Infonote/src/store/slices/navigationSlice.ts#L5) reads `localStorage.getItem('infonote-current-parent-id')` **synchronously at slice creation**. This fires before `storage.loadGraph` hydrates the nodes from disk/cloud, meaning on cold start `currentParentId` points to a node that does not yet exist.
**Effect:** `reconstructBreadcrumbs` (which also runs inside `loadGraph`) does handle the "parent missing" case on line 62-67 by falling back to Home, **but does not clear `localStorage`** (comment at line 65: "Don't clear localStorage here, as nodes might still be loading batch-by-batch"). The downside is that if the user's actual data doesn't contain that parent any more, the stale key lives forever.
**Finding:** on Supabase mode a stale parent ID from the previous File-System workspace will force a Home fallback on every load. Recommend clearing the key once load has completed and the parent is still missing.

### Story 11 — Note Display Options (P2)

**Expected:** `FullscreenModal`, `SidePanel`, `CenterModal` mutually exclusive.
**Observed:** [navigationSlice.ts#L47-L51](file:///c:/Users/LENOVO/Desktop/Infonote/src/store/slices/navigationSlice.ts#L47-L51) — each setter nulls the others, enforcing mutual exclusion. Good.
**Finding (P2):** `setRightSidePanelId` closes `leftSidePanelId`? No — line 49 only closes `fullscreenId` and `centerPanelId`. So the left/right panels can be open simultaneously (intentional? CanvasBoard#L240-L242 renders a `dualPanelBackdrop` when both are open, so yes, intentional). No defect. Keep.

### Story 12 — Block Content Creation (P1)

**Expected:** BlockEditor main component, BlockComponents.tsx renderers, block types.
**Observed:** all files present.
**Finding (P1):** [VirtualBlockList.tsx#L3](file:///c:/Users/LENOVO/Desktop/Infonote/src/features/editor/VirtualBlockList.tsx#L3) imports `FixedSizeList` and `ListChildComponentProps` from `react-window`. The installed `react-window@^2.2.5` renamed these (tsc suggests `CellComponentProps`). **This file currently does not compile and virtualization of the block list is broken.** Any long document rendered through this path either crashes or silently falls back.

### Story 13 — Slash Command Menu (no defects found)

**Expected:** SlashMenu + useSlashCommand + menuConstants.
**Observed:** `src/features/editor/SlashMenu.tsx`, `hooks/useSlashCommand.ts`, `menuConstants.tsx` present. No obvious issue without runtime exercise.

### Story 14 — Block Drag & Drop Reordering (no defects found)

**Expected:** @dnd-kit + SortableBlockWrapper + useBlockDragAndDrop.
**Observed:** all present. No obvious issue.

---

## Recommended fix order (if you approve)

1. **C3 → Story 12 virtual list:** fix `react-window` imports so the editor compiles and virtualization works again. Small diff, high value.
2. **C3 → Story 7 `NoteExpandedContent` props:** add `showMetadata` / `setShowMetadata` to the component props or remove the dead prop. Resolves the real `TS2322` error.
3. **C3 → other TS errors:** delete dead code / unused imports / `this` typings in `throttle.ts`. Makes `npm run build` pass. Quick win before shipping cloud sync.
4. **C1 → grid snap reconciliation:** decide 56 vs. 112, then update `layout.ts` comment + `SNAP_STEP`, remove the hard-coded `[56, 56]` in `CanvasBoard.tsx`, and update `findNonOverlappingPosition` to snap candidates.
5. **Story 2 fix:** source sizes from `layout.ts` constants in `BottomMenu.tsx`.
6. **Story 10 fix:** clear `infonote-current-parent-id` in `localStorage` when reconstruction falls back to Home *after* the first successful load.
7. **C2 → surface auto-reconnect error text** to `StorageControls`.

Tell me which items to fix and I will ship them in grouped, reviewable patches.
