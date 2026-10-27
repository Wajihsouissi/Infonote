# Intelligent UI blocks

The beta can generate an interactive answer as a native `intelligent-ui` block,
inside a note or directly on the canvas. Add **Intelligent UI** from a block menu
or type `/intelligent` inside a note. Enter a request and choose **Generate
interface**. Existing `/ai` writing blocks keep their current behavior.

The AI panel's existing router now chooses presentation independently of its
Ask/Create/Edit strategy. Useful calculators, adjustable comparisons, charts,
SVG diagrams and simulations may use `presentation: "intelligent-ui"`. Ask
renders the artifact in the transcript; **Keep as a block** places a copy.
Create places a native document and records the ordinary AI provenance and
turn undo information. Edit and explicit card/document/mindmap selections keep
their existing paths. Fast mode skips the model router and recognizes explicit
English interactive-tool requests through its fallback rules.

## Implementation

- `features/intelligent-ui/generate.ts` calls the existing AI
  stream gateway. The ordered CSS/HTML/functions/expressions contract follows
  OpenIntelligentUI; generation uses the configured model, not Jev or a new
  Python/CopilotKit runtime. See `../THIRD_PARTY_NOTICES.md` for attribution.
- Headings, descriptions and ordinary explanations are returned as `before` /
  `after` arrays of native editor blocks. They remain independently editable,
  searchable and selectable. Only SVG/diagrams, interactive controls, functional
  labels and dynamic results live inside the sandbox. A compatibility pass lifts
  static headings and paragraphs out of nonconforming model HTML. Refining the
  visual preserves the surrounding native text the user has edited.
- The empty block is one compact prompt row. A generated visual has only a small
  refinement row, a send/stop action, an HTML download and a previous revision
  action when available.
  There is no duplicate title, summary panel or explanatory footer in the frame.
  A lone outer wrapper around form controls is flattened by the host baseline
  so a generated card does not duplicate the host border and padding. Explicit
  grid/image/application roots and inner functional groups retain their styling.
- The final JSON artifact is validated before replacing content. Incomplete or
  malformed output fails atomically and never replaces the last successful
  revision. JSON generation disables the prose stream's automatic continuation.
  Once CSS is complete, partial HTML/SVG appears in an inert preview. Scripts,
  navigation, controls and the host bridge remain disabled there. Previews are
  throttled, never saved as artifacts, and discarded on Stop/error. A refinement
  retains the last good frame and control state until the new JSON validates.
- `metadata.intelligentUI` stores the versioned source, prompt, model, timestamp,
  draft, flat control values and one previous successful revision. The existing
  document/graph storage saves this data; reopening does not call the model.
- A locally bundled host font and theme tokens are injected into the frame.
  The frame uses `sandbox="allow-scripts"`, an opaque origin and a restrictive
  CSP. It receives no secrets, auth tokens or store object. Resize, flat control
  state, readiness and errors are accepted only from the matching frame and ID.
- Three.js, D3, Chart.js, GSAP and Leaflet are pinned npm dependencies, emitted
  as separate local assets. Only the names declared in `artifact.libraries` load;
  no CDN/importmap or library code is added to the initial canvas bundle. The host
  fetches these public assets, then initializes their globals inside the opaque
  frame before the generated code: `THREE`, `d3`, `Chart`, `gsap`, `L`.
- Only Leaflet artifacts permit images from `basemap.nationalmap.gov` for USGS
  tiles. Basemaps need internet and attribution; pins/connecting lines do not
  establish verified driving directions or current conditions. Other resource
  requests and form submissions remain blocked by CSP. Browser sandboxing
  isolates host access; this is not
  a general-purpose hostile-code execution service with CPU/resource quotas.
- A deliberate button can call `chnkUI.sendPrompt({text, values?})`. The bridge
  captures current controls, validates bounded flat values and text, and starts
  a new Ask turn. It preserves the prior visual and unsent composer draft. A
  private per-frame capability and trusted button activation gate this action;
  load/timer/input calls and forged action messages are rejected. No other host
  actions, navigation or arbitrary API requests are exposed.
- Download HTML packs the public library code, fonts, native surrounding prose
  and current values into one file. Its visual still runs in a sandbox. AI
  follow-ups require the application; no AI credentials are included in exports.
- Local input changes use no AI calls. Inputs/selects/textareas need stable
  unique IDs for restoration. Arbitrary closure, animation and canvas state is
  not serialized. Refine the prompt to create a new revision; **Restore previous
  revision** swaps the two saved snapshots.
- Unselected canvas nodes keep the visual and compact composer visible in an
  inert host, with saved control values restored in the same sandbox. Selection
  enables editing and AI actions; passive visuals do not write controls or send
  AI follow-ups. The existing invisible canvas drag surface lets an unselected
  block move directly from its body, without a visible grip. Distant overview
  nodes retain the canvas's usual lightweight projection.

## Local testing without signing in

The beta inherits the root `.env.local` flag `VITE_AI_ALLOW_ANONYMOUS=true` in
development. Vite passes the same normalized public flag to the client and its
local API middleware. Provider keys stay server-side. No account is needed for
the local AI test flow. The deployed server's access rules are separate.

Run the dedicated headed suite (it starts its own beta server on port 5189):

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.intelligent-ui.config.ts --headed
```

The tests replace provider responses at the HTTP boundary. They verify slash
insertion, generated controls, source/control persistence, passive previews,
Ask/Create routing, Keep/Undo, revision failure/restoration, cancellation,
truncation, schema validation, sandbox boundaries and narrow layouts. The slash
generation scenario also edits the generated native prose and checks the exact
native-text / visual / native-text block order. Enhanced scenarios use a real
chunked HTTP fixture, exercise actual local rendering engines (including a 3D
WebGL frame), validate AI follow-up values/draft preservation, and reopen HTML
exports. CI uses Chromium's software renderer for reproducible 3D verification.

`.github/workflows/beta-intelligent-ui.yml` runs the same suite in headed Chromium
under Xvfb on Linux, without provider keys. It uploads the HTML report, failure
traces, screenshots and video. The workflow must be pushed to GitHub before it
can execute there.

For a deliberate provider-backed test against an isolated beta on port 5177:

```powershell
$env:RUN_LIVE_AI = '1'
node scripts/smoke-intelligent-ui.mjs
```

This makes one real generation request using the already-allowed Flash Lite
model, exercises the controls, checks their persisted values, reloads, and saves
the artifact and screenshot under `qa/intelligent-ui-live/`. Set
`INTELLIGENT_UI_BASE_URL` to target another local port. To verify the saved real
artifact again without another provider request, use
`REPLAY_INTELLIGENT_UI=1` instead of `RUN_LIVE_AI=1`.
