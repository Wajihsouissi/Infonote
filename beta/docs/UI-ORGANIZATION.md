# Beta UI navigation

Implemented on 19 October 2026. This guide describes the physical source tree. The broader [architecture strategy](ARCHITECTURE-STRATEGY.md) remains a staged proposal for domain and infrastructure boundaries.

## Follow the owner, then the surface

```text
src/
  app/
    App.tsx
    errors/ErrorBoundary.tsx
    recovery/{RecoveryPage,WorkspaceLoading}.tsx
    shell/
      navigation/{menus,breadcrumbs}/
      panels/{containers,peek,fullscreen,outline}/
      toolbars/{edge,history,selection}/
      feedback/{guest-reminder,limits,save-state}/
      preferences/{keyboard,theme}/
      input/modifiers/
      media/lightbox/
  shared/
    icons/                          Existing icon API and SVG resolution
    ui/
      controls/{button,tabs}/
      feedback/{loading,tooltip}/
      graphics/
  features/
    ai/ui/
      panel/hooks/
      composer/
      transcript/trace/
      citations/
      clarification/
      dialogs/
    canvas/
      board/
      nodes/
      edges/
      ui/{menus,dialogs,overlays}/
      hooks/{navigation,viewport,interaction,editing}/
    card/ui/{node,content,cover,icons,chunking}/
    block/{ui,hooks}/
    editor/
      ui/
        surface/styles/
        menus/{block,slash}/
        toolbars/
        dialogs/color/
        inputs/date-time/
      blocks/{text,table,code,ai,color,layout,media,link}/
      gallery/{board,tile,hooks}/
      document/, text/, drag/, hooks/
    auth/pages/{authentication,profile}/
    landing/pages/{home,marketing}/
    file/ui/{card,viewer}/
    intelligent-ui/ui/{block,preview,styles}/
    search/{ui/results,model,workers}/
```

Braces abbreviate existing siblings. The [complete source and API tree](../../docs/source-tree/beta.txt) lists individual files.

## Where to make a change

| Change | Start here |
| --- | --- |
| Reusable button behavior or appearance | [shared button](../src/shared/ui/controls/button/Button.tsx) and adjacent CSS |
| Application startup and view composition | [App](../src/app/App.tsx) and `app/routes.ts` |
| Side peek, full screen, document outline | `app/shell/panels/` |
| Canvas actions and selection actions | `app/shell/navigation/menus/` and `app/shell/toolbars/` |
| A note's cover or reading content | `features/card/ui/cover/` or `features/card/ui/content/` |
| AI prompt entry and attachments presentation | [composer](../src/features/ai/ui/composer/AIComposer.tsx) |
| AI panel lifecycle and rendering adapter | `features/ai/ui/panel/hooks/` |
| Editor composition | [BlockEditor](../src/features/editor/ui/surface/BlockEditor.tsx) |
| Table cells and table editing | `features/editor/blocks/table/` |
| Editor slash commands or block menu | `features/editor/ui/menus/` |
| Gallery board behavior or a tile | `features/editor/gallery/board/` or `features/editor/gallery/tile/` |
| Search UI, matching rules, background execution | `features/search/ui/results/`, `model/`, `workers/` respectively |
| File presentation | `features/file/ui/card/` or `features/file/ui/viewer/` |

## Placement rules

- Workspace density lives in `styles/design/density.css`. Mouse/trackpad desktops at 900 CSS pixels and above use Compact chrome: a 44px header, 48px dock, 32px controls, a 248px notes sidebar and tighter panel spacing. Touch capability takes priority with 44px primary control targets. This changes shell spacing and control geometry, not document typography, canvas node dimensions, browser zoom or device pixel ratios.
- Card side peeks use `--card-peek-width`: Compact defaults to `clamp(320px, 30vw, 480px)` instead of growing to 40% of a 4K viewport. Manual resizing uses the rendered starting width, a 280px readable minimum and a half-viewport maximum (or the starting width when the comfortable default is wider), capped within the viewport. AI keeps its independently saved width; panel colours and input interaction states remain owned by their existing tokens.
- Canvas breadcrumbs live in a top-left React Flow `Panel`, outside the transformed node viewport. Their floating surface stays anchored during pan/zoom, uses the existing breadcrumb component, and becomes inert together with the covered canvas. The top bar retains history and workspace utilities.
- The breadcrumb frame owns its spacing independently of the top bar. Its ordered path keeps home fixed and truncates long labels within the available width, with the current location exposed through `aria-current`. Breadcrumbs use neutral text and a grey hover wash, with no persistent primary-colour selected fill. Fine-pointer controls are 26px high with 12px labels; touch targets remain 44px.
- Fullscreen note navigation and its collapsed rail use `--sidebar-bg` from the deeper Graphite rail palette (`--bg-rail`, #121212 in Ink), replacing their pure-black inset surface. AI surfaces and card side peeks retain their original tokens: panel chrome uses `--panel-bg` → `--shell-bg`, reading bodies and AI history use `--panel-body-bg`.
- Native text fields, textareas and selects share shape and focused state in `styles/design/inputs.css`, using the input tokens in `design/component-tokens.css`. Resting backgrounds stay with their feature. Existing hover styling applies only while unfocused; focus adds a flat neutral shade with no extra stroke or inner shadow. The radius is the system's 8px squircle with a rounded fallback. Text selection uses neutral theme colours.
- Composite fields with icons/actions mark their outer frame with `data-input-shell`; that frame owns the focus shade so its child input does not create a second surface. Checkboxes, radio buttons, sliders, colour pickers and upload triggers retain their own control shapes.
- Shared UI contains reusable primitives with no imports from feature internals, application composition, the concrete store or services. ESLint enforces these direct import restrictions. Product-specific controls stay with their feature.
- App shell owns surfaces spanning multiple features. `features/ui/` and `components/` have been replaced by explicit owners; do not recreate those generic buckets.
- Keep a component and its `.module.css` together. Shared CSS used by several components has a named local owner, such as intelligent UI's `ui/styles/`.
- Keep existing editor/card CSS layers in their owning surface's `styles/` directory and preserve their import order.
- Give a subdirectory a meaningful role. A component with its own stylesheet may own a leaf directory; small related components can share one directory. Do not create empty future folders or a wrapper/index for each file.
- Keep local React adapters named `use…`. UI entry points and their existing state/service access have only moved; this work does not claim to have extracted all application decisions from components.
- Domain contracts, storage transaction ordering and transport semantics remain unchanged. `store/`, `services/`, `config/`, assets and global styles retain their current roots pending separate boundary work.
- Keep route lazy imports and worker entry points explicit. Search's worker is listed in `knip.json`; moving a worker requires updating its `new URL` reference and any diagnostic module URL.

## Verification record

264 source files moved in three stages, with a TypeScript check after each stage. A baseline manifest covers 547 original source/API files. Every original file remains present; 383 non-documentation files are byte-identical and 162 differ only by recorded path replacements. Two Markdown files were checked for presence and updated separately as documentation.

The migration helper initially shortened the shared icon wildcard incorrectly. Inspection caught it, restored `../../assets/icons/*.svg`, and corrected the helper. Its correction is recorded alongside the original stage edits rather than hidden from the audit.

The move maps, original copies, exact path replacement records and check logs are in `output/audits/beta-ui-tree-2026-10-19/` at the repository root.

| Check | Result |
| --- | --- |
| TypeScript after each of the three move stages | PASS |
| Root `npm run check` | PASS: strict lint, editor/folder checks, TypeScript/Vite production build, Knip |
| Selected existing browser scenarios | 22 PASS / 0 FAIL |
| Real Chromium canvas, original shared SVG registry and relocated search worker | PASS |
| Original source preservation | PASS; exact recorded replacements, no missing original files |

Browser coverage includes routing/profile, an AI answer, ten transfer contracts, keyboard navigation, card cover persistence, file peek/fullscreen, gallery rendering, icon loading, guest auth deferral and error reporting. This is focused coverage, not a complete browser-suite or performance rerun. The previously recorded folder UI and gallery-layout failures were not retested or resolved by this source organization. Existing bundle-size warnings remain.

The first browser attempts used different sandbox/browser execution environments; the runtime probe could not find Chromium there or reach the isolated server. Final browser tests and the runtime probe ran successfully with the installed browser and server in the same environment. The temporary probe server was stopped.

No file was moved to the deletion queue or deleted by this UI organization stage. Existing future-feature references retain their own layout. Changes remain local and uncommitted: the working tree contains earlier product and organization changes, so committing entire moved files would also include that prior work.
