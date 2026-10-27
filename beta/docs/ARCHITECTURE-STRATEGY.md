# Beta architecture strategy

Status: staged strategy, based on the source tree inspected on 19 October 2026. The UI groups have since been implemented; domain and infrastructure boundaries remain proposals.

Update: a subsequent [UI organization stage](UI-ORGANIZATION.md) implemented `app/App.tsx`, `app/shell/`, `app/errors/`, `shared/ui/`, `shared/icons/` and responsibility groups inside feature UI. The remaining domain extraction, infrastructure grouping and store-composition proposals below remain future work. Findings describe the layout before that UI stage.

## Findings

The current capability-based layout is a useful foundation. A static inventory found 325 TypeScript/JavaScript source files: editor owns 82, AI 40 and canvas 33. These counts exclude CSS, assets and generated output. Import observations below include type-only imports; they are ownership signals, not proof of a runtime dependency cycle.

- `features/ai/` owns behavior, `services/ai/` owns transport, `services/storage/chat/` owns persistence, and `store/slices/aiSlice.ts` owns state. The distinction is useful but needs explicit contracts and documentation.
- `store/contentSync.ts` imports editor document rules. `src/types.ts` imports the editor's `Block` type. `services/storage/workspace/welcomeCanvas.ts` also uses that type. The stored document contract therefore has consumers beyond editor presentation.
- `store/blockNodeStyle.ts` uses sizing decisions from file and intelligent UI features. These are product rules that should have a deliberate owner, rather than becoming accidental store utilities.
- `features/ui/` contains application panels and toolbars, whereas `components/ui/` contains reusable primitives. Keeping this distinction explicit avoids two generic UI buckets.
- Routes already use lazy imports in `App.tsx`. The next organization change should preserve these loading boundaries.

## Target layout

Use a modular application with a small number of layers, retaining the existing feature folders. Add a folder only when moving a coherent responsibility into it.

```text
beta/
  api/                         Deployed server routes; URL structure stays stable
  src/
    main.tsx                   Browser entry
    app/
      App.tsx                  Application composition
      routes.ts                URL/view mapping
      state/                   Shared store composition and cross-feature state
      shell/                   Application panels, toolbars and global feedback
    domain/
      document/                Persisted block contracts and pure document rules
      workspace/               Workspace contracts and pure graph decisions
    features/
      editor/                  Editing UI, DOM behavior and commands
      canvas/                  Canvas UI, interactions and rendering adapters
      ai/                      AI workflows, transcript UI and feature state
      auth/, search/, ...      Existing product capabilities
    infrastructure/
      storage/                 Browser/folder/chat persistence adapters
      ai/                      AI request and streaming transport
      assets/                  Asset ingestion and storage adapters
      auth/                    External authentication adapter
      telemetry/               Error reporting adapter
    shared/
      ui/                      Product-independent presentation primitives
      icons/, styles/, assets/ Shared visual foundations
      lib/                     Small helpers with no feature dependency
  e2e/                         Cross-feature user journeys
  scripts/, qa/                Current executable checks and fixtures
  docs/                        Architecture and operation guides
```

This is an ownership map, not an instruction to create every folder immediately. Keep CSS beside its component. Small features can stay flat; large features can use meaningful groups such as `document`, `drag`, `text` and `gallery`, already present in the editor. Avoid adding identical `components/hooks/utils` layers to every small feature.

## Dependency rules

`app` composes features and infrastructure. `domain` contains pure contracts and decisions and imports neither React components nor browser persistence. `shared` does not import product features. Infrastructure implements persistence/network boundaries and depends on shared/domain contracts, rather than feature UI internals. Features use domain rules and explicit service interfaces; an app-level composition point can provide concrete adapters where appropriate.

Feature-local state stays with its feature. Shared document history, graph state and hydration stay coordinated; do not split the existing Zustand store merely to imitate the folder tree. Initially move its composition together, then extract only responsibilities whose transaction and history semantics remain clear.

Choose a small explicit public interface for cross-feature use. Avoid a root barrel that re-exports every component, worker and service. Keep workers and lazy entry points explicit. Path aliases may improve navigation once consistent across TypeScript, Vite, scripts and tests; aliases alone do not create architectural boundaries.

## Migration order

1. **Document contracts first.** Extract the canonical stored `Block` contract and pure document operations used outside the editor. Keep DOM formatting/caret rules inside the editor. Update consumers directly; do not maintain duplicate schemas. Confirm stored content, unknown fields and undo/history behavior are preserved.
2. **Application composition.** Consolidate `App`, routing, global shell and shared store composition under `app`. Keep bootstrap/persistence/auth initialization ordering intact. Rename the generic shell owner only after checking all consumers.
3. **Infrastructure boundaries.** Group existing storage/network/asset adapters, while preserving separate browser, folder and backup contracts. Resolve the open folder-storage browser failure before changing those behaviors. Map AI feature state, request transport and chat persistence explicitly rather than merging them into one large feature module.
4. **Canvas responsibilities.** Group node rendering, edge rendering and interaction code by their owners. Split a large file only when it contains independent responsibilities; line count alone is not a defect. The large Solar catalogue is data, so it should not be split like interaction logic.
5. **Enforce the result.** Add focused ESLint import restrictions for migrated boundaries and keep the quality gate green. Verify workers, route loading and affected browser flows. Use measured bundle/startup/rendering results before making any speed claim.

Each stage needs its own move map and import update, with the root quality gate and focused regression checks. Existing source-preservation records describe the previous organization and should remain historical evidence, not be rewritten to hide later semantic changes.

## Expected benefit

The direct benefit is faster navigation, clearer ownership and fewer unrelated files touched for a feature. Runtime improvements require separate evidence: lazy loading, bundle sizes, render/subscription behavior and storage timing. Folder names do not change those costs by themselves.

See [current source architecture](../src/ARCHITECTURE.md) and [completed repository organization](../../docs/SOURCE-TREE.md). Future implementations remain outside beta in `future-features/`, and deletion candidates remain in the root `to-delete/` review queue.
