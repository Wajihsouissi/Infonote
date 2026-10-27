# Production source architecture

The [UI navigation guide](../docs/UI-ORGANIZATION.md) explains the implemented surface groups. The [architecture strategy](../docs/ARCHITECTURE-STRATEGY.md) also records remaining domain/infrastructure proposals; those layers have not been implemented by the UI organization work.

`beta/` is the only production application. Organize by product capability, then by responsibility inside a large capability. Keep a component beside its CSS and keep imported paths explicit; do not create duplicate implementations or import the retained reference application.

```text
src/
  main.tsx                  Browser bootstrap
  app/
    App.tsx, routes.ts      Application composition and route definitions
    errors/                 Application error boundary
    shell/
      navigation/           Main menus and breadcrumbs
      panels/               Container, peek, fullscreen and outline surfaces
      toolbars/             Edge, history and selection commands
      feedback/             Save state, limits and guest messages
      preferences/          Theme and keyboard-help surfaces
      input/, media/        Modifier tracking and media lightbox
  shared/
    ui/                     Reusable controls, feedback primitives and graphics
    icons/                  Icon API and local SVG resolution
  config/                   Public application configuration
  features/
    ai/                     AI workflows; ui groups composer/panel/transcript/etc.
    auth/                   Session lifecycle and pages/authentication,profile
    canvas/                 board, nodes, edges, UI menus/overlays and grouped hooks
    card/                   ui/node,content,cover,icons,chunking; hooks and icon data
    editor/
      ui/surface/           Editor composition, frame, render orchestration and CSS
      blocks/               text,table,code,ai,color,layout,media,link renderers
      document/             Document tree, merge, reading patches and table data
      drag/                 Drag transport, lock, transfer and canvas spawning
      gallery/              Gallery renderer, board and tile groups, shared hooks
      hooks/                React editing/interaction adapters
      text/                 Text parsing, formatting, caret and paste rules
      ui/                   menus,toolbars,dialogs,inputs and surface
    search/                 ui/results, model query rules and workers entry point
    file/                   File contracts and ui/card,viewer
    intelligent-ui/         Generation logic and ui/block,preview,styles
  services/
    assets/                 Asset references, bytes and ingestion
    ai/                     AI transport and request shaping
    storage/
      workspace/            Browser/folder persistence, backups and session
      chat/                 Durable AI chat records
    supabase/               Optional authentication client
  store/                    Reactive graph/state mutations, slices and hydration
  styles/, assets/, utils/  Shared visual foundations, static assets and utilities
```

`block` retains its model rules and now groups node/drag/color UI plus hooks. `clipboard` retains its capability boundary; `landing` groups home and marketing pages. Breadcrumbs belong to the application shell. Browser adapters keep caret/DOM and gesture behavior; document rules and transfer decisions have their named owners. Storage adapters keep the deliberate differences between browser, folder and portable backup persistence.

Components retain their names and adjacent stylesheets. Shared UI has an ESLint restriction against direct imports from feature internals, the store, services or application composition. Feature UI's existing state/service access remains behaviorally unchanged; a folder move does not prove complete architectural decoupling.

`beta/api/` remains outside `src/` because its route paths are deployment entry points. Tests and fixtures remain outside shipped source in `e2e/`, `scripts/` and `qa/`. The moved search worker is explicitly listed in `knip.json` and remains a Vite module-worker entry point.

See the repository [source tree](../../docs/SOURCE-TREE.md), [future feature catalogue](../../future-features/catalogue/README.md) and [deletion review queue](../../to-delete/README.md). Folder organization improves navigation; it does not by itself reduce runtime work or prove production acceptance.
