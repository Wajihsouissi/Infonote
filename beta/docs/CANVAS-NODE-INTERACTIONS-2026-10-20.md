# Shared canvas node interactions

Implemented on 20 October 2026. Applies to every registered renderer: `note`, `block` and `fused-note`, including their overview projections. Block payloads such as tables, media, files, galleries, colours and Intelligent UI inherit the same boundary.

## Interaction contract

- An unselected node can be dragged from any point on its body. Dragging does not open its editor, activate a button, open a colour picker or launch a file chooser.
- A first body click selects the node. Subsequent content gestures edit text or interact with its controls. A sole selection owns editing; multi-selection keeps the whole body available for group movement.
- Every node offers the same floating view toolbar immediately on hover, selected or unselected: left side panel, fullscreen, centre peek and right side panel. Toolbar actions work before selection and do not start a canvas drag. Cards retain their open-card action and files retain their open/close action.
- The toolbar remains reachable across the gap above a node. Its controls keep their size when zoomed out. Keyboard focus reveals it, and coarse pointers can access it after selecting a node.
- Selected content keeps its editor DOM while panning or moving the node. Existing headers and non-content surfaces still move selected nodes.
- Wheel scrolling can read an overflowing passive document without selecting it. Pinch gestures continue to zoom the canvas. Files can still be dropped onto an empty media picker.
- Explicit link mode and active connection drags take priority over the passive boundary, so connection targets remain reachable.

## Ownership

`src/features/canvas/nodes/CanvasNodeInteraction.tsx` owns passive selection/drag behavior. Its content wrapper uses `display: contents` to preserve each renderer's measurement and native `inert` to prevent passive controls, text selection and embedded documents from consuming a gesture. A separate drag surface lets React Flow handle movement and selection. Descendants stay mounted; there is no editor replacement on pointer movement.

`CanvasNodeToolbar.tsx` owns canvas chrome outside that inert content. It reuses the existing `PeekMenu` actions. Visibility uses CSS hover/focus, without publishing mouse positions or adding viewport subscriptions. Node and file renderers no longer carry competing toolbar implementations.

`CanvasNodeRenderer.tsx` wraps all three registered renderers with this common policy. Future renderer types must use the same boundary. Panels and fullscreen retain their existing content interaction because this boundary belongs to the canvas.

The replaced block-only overlay and its stylesheet are preserved in `to-delete/2026-10-20-replaced-block-drag-overlay/` for owner review. Nothing was permanently deleted.

## Verification

Isolated Playwright CLI tests use synthetic data on the dedicated test server, not the user's existing browser profile.

- Eight body-drag/first-click cases: expanded and compact cards, fused notes, text, colour, empty media, table and Intelligent UI blocks.
- Multi-selection movement; native connection drag and explicit link mode.
- Saved interactive iframe movement before selection and working controls after selection.
- All four hover view actions before selection, including crossing the toolbar gap.
- Existing pan/drag editor continuity, gesture cleanup and undo.
- Updated reading regressions retain complete content, native text selection after selection, scroll positions, table geometry, first typed input, draft handoffs and composition confirmation under the new selection rule.

Final results: 15 interaction/gesture checks passed, followed by 12 reading/file/iframe checks passed (one iframe case overlaps, for 26 distinct browser scenarios). The complete `npm run check` gate passed: strict lint, editor/reading/storage contracts, TypeScript, production build and Knip. Existing bundle-size and mixed-import build notices remain. Desktop and 1024×640 screenshots were inspected. The Graphify index was refreshed; the dedicated test server closed and the existing dev server on port 5174 remained running.

Evidence: `output/audits/canvas-node-interaction-2026-10-20/`. This interaction change does not establish that the earlier freeze in the user's populated canvas is resolved.
