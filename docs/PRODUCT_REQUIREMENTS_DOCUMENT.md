# Product Requirements Document — Chnk it / Infonote

**Document status:** implementation-backed baseline PRD  
**Snapshot date:** 2026-09-13  
**Companion source of truth:** [Product Master Document](PRODUCT_MASTER_DOCUMENT.md)  
**Evidence basis:** current application source, feature flags, migrations, API routes, automated test inventory, and repository product documentation.

## 1. Purpose and use

This PRD translates the current product into organized, traceable feature requirements for product, design, engineering, QA, and stakeholders. It records what the application demonstrably does today before describing future work.

It does **not** authorize unimplemented scope. When a capability is only gated, placeholder, historically mentioned, contradictory, or missing product decisions, it is marked **Later**, **Idea**, or **Needs Definition**. Product approval is required before those items become delivery requirements.

### Status definitions

| Status | Meaning |
|---|---|
| Built | Implemented and enabled in the current product. |
| Partially Built | Material implementation exists, but an end-to-end gap, constraint, or conflicting evidence remains. |
| In Progress | Work exists in the active codebase but is not a confirmed released capability. |
| Next | Explicit follow-up required to complete/validate current scope. |
| Later | Implemented behind an off-by-default flag or explicitly deferred. |
| Idea | Historical possibility, not a committed requirement. |
| Needs Definition | Product decision, success measure, or release condition is absent or contradictory. |

## 2. Product definition

### Product summary

Chnk it / Infonote is a local-first, visual knowledge workspace. A person captures notes, standalone blocks and files on an infinite canvas; writes rich block content; then spatially arranges, links, nests, fuses or boards the work. Task metadata, Kanban/calendar views, search/table of contents, optional cloud persistence and an AI panel support retrieval and organization.

### Evidence-backed users and jobs

| User | Primary job supported today | Evidence |
|---|---|---|
| Individual thinker / researcher | Capture and spatially connect information, then retrieve it. | Canvas, note, AI, templates and search surfaces. |
| Planner | Track card status, priority, dates, progress and tasks through boards/calendar. | Metadata, tasks, Kanban and calendar components. |
| Creator / writer | Draft structured content with block editing, files and AI assistance. | Block editor, file/media handling and AI creation. |
| Authenticated workspace user | Preserve and recover workspace work beyond the device. | Supabase auth, cloud sync, versions and folder mirror paths. |

No validated organization/team persona or paid-plan entitlement is defined. Workspace collaboration code exists but is not enabled by default.

### Product boundaries

| In the enabled product | Not currently released |
|---|---|
| Canvas/notes/blocks, edges, nesting, metadata, files, Kanban/calendar, templates, local persistence, optional cloud/folder storage, authentication, text/grounded AI, search/TOC, public pages and owner admin. | Real-time collaboration, Notion import, AI images, YouTube Study, YouTube Study AI and a functional marketplace. |

### Current feature-flag contract

| Flag | Default | PRD treatment |
|---|---:|---|
| `kanban`, `files`, `compactCardMeta` | On | Built scope. |
| `collaboration`, `notionImport`, `aiImages`, `youtubeStudy`, `youtubeStudyAI`, `marketplace` | Off | Later; source presence must not be presented as availability. |

## 3. Requirements conventions

Each feature has a stable requirement prefix. “Acceptance evidence” describes the observable behavior the existing implementation must retain; it is not a claim that all behavior has passed production-release QA. Requirements with no source-backed decision are deliberately left unresolved.

| Prefix | Feature group |
|---|---|
| CAN | Canvas and graph |
| CNT | Note, metadata and block content |
| FIL | Files and media |
| PLN | Planning and templates |
| RET | Retrieval and utilities |
| PST | Persistence and recovery |
| IAM | Identity and profile |
| AI | Artificial intelligence |
| COL | Collaboration and invitations |
| IMP | Import and study workflows |
| PUB | Public/marketing/marketplace |
| ADM | Administration and telemetry |

---

# 4. Feature Requirements

## F-01 — Canvas and visual graph

**Feature IDs:** FE-01 through FE-07  
**Status:** Built, with camera-regression validation In Progress  
**Priority:** Now  
**Dependencies:** React Flow, Zustand node/edge state, history, browser clipboard/canvas APIs, feature-independent node limits.

### Goal

Let a user create and organize a visual graph of content without losing the context of the current canvas level.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CAN-01 | The workspace shall render an infinite canvas containing supported node types and edges. | `note`, `block`, `fused-note`, `kanban` and gated `youtube` types are represented in the application model. |
| CAN-02 | The canvas shall support pan/zoom, fit/center, minimap, controls, selection and keyboard navigation as explicit navigation operations. | `CanvasBoard`, minimap, viewport hooks and navigation UI exist. |
| CAN-03 | A user shall be able to create, select, resize, duplicate, update and delete canvas nodes, with recent-deletion recovery. | Node lifecycle actions and `BranchDeleteConfirmation` are implemented. |
| CAN-04 | A user shall be able to create, select, reconnect, edit and delete visual edges. | Canvas edge/connection components and edge editing toolbar exist. |
| CAN-05 | A user shall be able to enter a nested canvas through a parent node and return through breadcrumbs. | Node `parentId`, canvas navigation state and `Breadcrumbs` exist. |
| CAN-06 | Nodes and edges shall remain scoped to their active canvas level. | Nested-node `parentId` and edge parent-context data are present in the model. |
| CAN-07 | The canvas shall support compatible content fusion, splitting and release-to-block operations. | Node slice and content synchronization operations expose fuse, split and release behavior. |
| CAN-08 | A user shall be able to manually arrange content and invoke canvas organization with review/undo where AI organization is used. | Layout actions, AI organization preview and undo paths exist. |
| CAN-09 | The product shall allow anonymous users to create cards and nodes without temporary numeric quotas. | `nodeLimits` no longer enforces the former 25-card or 50-nodes-per-canvas caps. |
| CAN-10 | Editor and embedded control gestures shall not unintentionally pan or re-center the canvas. | Canvas/editor interaction isolation was changed in the active workspace; focused regression coverage is still In Progress. |

### Constraints and unresolved requirements

- Anonymous nesting remains limited to depth 3; card and node quotas are intentionally disabled for the current beta configuration.
- A desktop versus mobile interaction/support contract is not evidenced. It is **Needs Definition**.
- The camera behavior in CAN-10 must receive passing cross-input (mouse, trackpad and touch where supported) regression coverage before it can be considered fully validated.

---

## F-02 — Notes, metadata and rich block editing

**Feature IDs:** FE-08 through FE-12  
**Status:** Built  
**Priority:** Now  
**Dependencies:** Canvas graph, block content model, asset ingestion, editor hooks, content synchronization.

### Goal

Enable a user to capture, read and structure rich content directly in a spatial note system.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CNT-01 | Notes shall render in icon, medium, expanded and focused contexts. | `NoteCard`, `NoteExpandedContent` and level-of-detail components are implemented. |
| CNT-02 | A note shall store label, rich content and visual/planning metadata. | `NoteData` supports title/label, content, visual state, tags, dates, status, priority, assignee, progress and provenance fields. |
| CNT-03 | Users shall be able to edit block arrays within notes, standalone block nodes and fused-note nodes. | `BlockEditor` is reused across those content surfaces. |
| CNT-04 | The editor shall support paragraphs, headings, bullet/numbered/todo lists, toggles, quotes, callouts, code, tables, dividers, pages, AI, media/video/file and structural blocks. | Current editor menu constants and block component set define these block types. |
| CNT-05 | The editor shall provide slash-command insertion, markdown shortcuts, inline formatting and link/color actions. | Slash menu, command hooks, markdown shortcut and floating toolbar artifacts exist. |
| CNT-06 | Users shall be able to reorder blocks and move supported content through drag/drop. | Sortable wrappers, block DnD hook and canvas drop support exist. |
| CNT-07 | Users shall be able to edit card metadata through compact chips and supporting property controls. | `compactCardMeta` is on; card metadata and property components are present. |
| CNT-08 | Task metadata and card task details shall be attached to content rather than copied into a separate board-only record. | Card task components and note metadata data flow are implemented. |

### Constraints and open requirements

- Exact supported import/export semantics for each block type are not defined.
- Accessibility requirements for rich text editing, keyboard-only drag/drop and screen-reader announcements are not documented; they are **Needs Definition**.
- No external collaboration/edit-conflict rules apply to the enabled individual-first editor.

---

## F-03 — Files and media

**Feature ID:** FE-13  
**Status:** Built with browser/storage constraints  
**Priority:** Now  
**Dependencies:** IndexedDB asset store, ingest pipeline, file renderers, optional Supabase Storage and folder asset handling.

### Goal

Allow users to attach, retain and view binary content alongside canvas notes and blocks.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FIL-01 | Users shall be able to ingest supported image, video and file content into cards or blocks. | File/media placeholders, ingest service and file card components exist. |
| FIL-02 | The application shall address retained assets by an asset id and keep binary metadata/blob records locally. | Asset record, reference and IndexedDB asset store are implemented. |
| FIL-03 | The application shall render an appropriate file preview or viewer for supported files. | `FileCard`, `FileViewer`, file-renderer and `AssetMedia` artifacts exist. |
| FIL-04 | Referenced assets shall be included in folder backup/restore and cloud mirroring when applicable. | Folder-assets and asset-sync services exist. |
| FIL-05 | Cloud-eligible asset uploads shall respect the current 25 MiB source limit. | `MAX_CLOUD_ASSET_BYTES` is 25 MiB in the current implementation. |

### Constraints and open requirements

- The supported file-type matrix, virus scanning policy, quota policy and error/retry UX are not a defined product contract.
- Large-file and unsupported-browser behavior are **Needs Definition**.

---

## F-04 — Planning: Kanban, calendar, tasks and templates

**Feature IDs:** FE-14 through FE-17  
**Status:** Built  
**Priority:** Now  
**Dependencies:** Note metadata, Kanban node model, drag/drop, date/time components and template definitions.

### Goal

Let a user turn metadata-bearing notes into visual planning and reusable starting structures.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PLN-01 | A Kanban board shall organize child note cards into configurable metadata-driven lanes. | `KanbanNode`, lane/card components and board configuration exist. |
| PLN-02 | Board operations shall support card drop/move and lane creation, rename, reorder and deletion. | Kanban DnD and lane/column UI are implemented. |
| PLN-03 | Board and task dates shall be visualized in calendar day, time-grid and year views. | Calendar, time grid, timed event and year grid components exist. |
| PLN-04 | Card tasks shall expose task details, lists and progress. | `CardTasksModal`, `TaskDetail`, `TaskList` and `TaskProgress` exist. |
| PLN-05 | Boards shall consume the child note's metadata rather than duplicating planning information. | Current Kanban data model uses child notes and board parent/order configuration. |
| PLN-06 | Users shall be able to preview and insert the seven currently defined templates: Zettelkasten, Mindmap, Second Brain, PARA, Daily Planner, Meeting Notes and User Story Mapping. | `templateDefinitions` and `TemplatePreviewModal` exist. |
| PLN-07 | A template preview shall be generated from the same builder used for insertion. | Template definitions supply shared preview/insertion construction. |

### Constraints and open requirements

- Calendar timezone, recurrence, reminders, external calendar integration and planning permissions are not defined requirements.
- Custom user-authored templates are only a historical **Idea**, not current scope.

---

## F-05 — Retrieval and workflow utilities

**Feature IDs:** FE-18 and FE-19  
**Status:** Built  
**Priority:** Now  
**Dependencies:** Content model, search worker, table-of-contents service and browser APIs.

### Goal

Help users find and reuse content within the visual workspace.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| RET-01 | The application shall provide a table of contents for current canvas content. | `TableOfContentsPanel` and `tocService` are implemented. |
| RET-02 | The application shall provide worker-backed local content search results. | `search.worker`, `searchService` and `SearchResults` are implemented. |
| RET-03 | Users shall be able to copy, cut and paste supported canvas node payloads. | Clipboard payload/write utilities and E2E coverage exist. |
| RET-04 | Users shall be able to capture a canvas screenshot through the canvas action surface. | Canvas action implementation uses browser/canvas APIs. |

### Constraints and open requirements

- Saved searches, global/cross-workspace search, export formats, backlinks and a graph view are historical **Ideas**, not requirements.
- Search index freshness, ranking and scale targets are not documented; they are **Needs Definition**.

---

## F-06 — Local-first persistence, sync and recovery

**Feature IDs:** FE-20 through FE-22  
**Status:** Local persistence Built; cloud sync/recovery Partially Built  
**Priority:** Now  
**Dependencies:** IndexedDB, File System Access API, Supabase Auth/Postgres/Storage, active workspace state, sync revisions and asset references.

### Goal

Preserve a user's work locally by default and offer optional folder/cloud storage and recovery without losing data.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PST-01 | The application shall maintain an IndexedDB workspace safety net. | `LocalWorkspaceStore` and local-first state paths exist. |
| PST-02 | The application shall retain an IndexedDB AI-chat cache. | `AIChatStore` is implemented. |
| PST-03 | Users shall be able to select device-only storage or device plus cloud storage during first-run storage choice. | `StorageChoiceModal` and storage preference state are implemented. |
| PST-04 | The application shall support explicit local-folder save/load including referenced assets on compatible browsers. | File-system backend, local sync modal and folder asset services exist. |
| PST-05 | Authenticated workspaces shall have a cloud sync path with hydration, outbox/delta handling, revision state and asset mirroring. | `SyncCoordinator`, sync controller/cloud sync, migration revisions and asset sync exist. |
| PST-06 | The application shall expose supported backup/version and restore paths, including manual/daily canvas versions. | Canvas version migrations and storage controls exist. |

### Release limitations and decisions

- File System Access API support is browser-dependent; official supported browsers and fallback messaging are **Needs Definition**.
- Cloud multi-device sync, version restore and asset recovery require release-grade end-to-end validation. Their availability is therefore **Partially Built**, not a confirmed reliability guarantee.
- Conflict handling, offline retention, cloud storage entitlement, quota, deletion and downgrade behavior are **Needs Definition**.

---

## F-07 — Authentication, profile and account state

**Feature ID:** FE-23  
**Status:** Built  
**Priority:** Now  
**Dependencies:** Supabase Auth, auth state, user profiles and storage preference flow.

### Goal

Give users a session/account path for cloud-backed workspace behavior while preserving local-first use.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| IAM-01 | Users shall be able to sign up, sign in, use the configured OAuth path and complete password recovery. | Login, signup, update-password pages and auth flow/provider are implemented. |
| IAM-02 | The application shall hydrate the current session and show auth-aware root routing. | App route selection and auth context/slice exist. |
| IAM-03 | Authenticated users shall have a profile/account screen. | `ProfilePage` is implemented. |
| IAM-04 | Anonymous users shall be prompted to sign in when applicable to storage/limit behavior. | `AnonSaveReminder`, storage choice and limit UI exist. |

### Open requirements

- Email verification, account deletion/retention, session duration, supported OAuth providers and data-portability requirements are not fully specified.

---

## F-08 — AI Ask, Create/Edit, grounding and history

**Feature IDs:** FE-24 through FE-29  
**Status:** Text/grounded AI Built; cloud history Partially Built; image creation Later  
**Priority:** Now for enabled text/grounded AI  
**Dependencies:** AI panel/runtime, server AI guard, Gemini endpoints, optional Gemini search helper, node state and local/cloud chat stores.

### Goal

Help a user ask questions about scoped content or create/revise attributable canvas artifacts while preserving visibility into the operation.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| AI-01 | The AI panel shall provide distinct Ask and Create modes. | `AIPanel` and AI routing artifacts expose both modes. |
| AI-02 | Ask shall return an assistant response without requiring a canvas mutation. | AI chat flow and message model support response-only turns. |
| AI-03 | Create/Edit shall support structured canvas output, including notes, fused notes, mind maps, boards and timelines. | AI canvas operations and response handling support those artifacts. |
| AI-04 | Users shall be able to attach explicit scope/context and choose supported content-shape options. | Mention picker, context bar, scope and command artifacts exist. |
| AI-05 | The application shall expose citations/evidence previews and an execution trace when returned by the AI flow. | Citation preview, run trace and provenance components exist. |
| AI-06 | The AI panel shall offer current effort levels `Fast`, `Efficient` and `Smart`, and optional web-search grounding. | AI effort configuration and grounded path exist. |
| AI-07 | AI-created/edited artifacts shall record provenance and canvas organization shall be previewable and undoable. | Provenance mark, organization preview and history paths exist. |
| AI-08 | Users shall have locally cached chat history; authenticated cloud history can be listed, opened, duplicated, regenerated and deleted where available. | Local/cloud AI chat stores and history UI exist. |
| AI-09 | Image generation shall remain unavailable in the default UI while `aiImages` is false. | Image endpoint/client path exists, but the feature flag is off. |

### AI requirements that remain undefined

- Model selection/availability, rate limits, spend limits, content safety policy, audit retention, data use, user consent, citation quality and failure/retry UX are not complete product requirements.
- Cloud-history merge/conflict/offline behavior needs release QA before the capability can be positioned as complete.
- AI image cost, storage, ownership and safety requirements must be approved before enabling the existing image path.

---

## F-09 — Workspace invitations and real-time collaboration

**Feature IDs:** FE-30 and FE-31  
**Status:** Invitation path Partially Built; realtime collaboration Later  
**Priority:** Next only after definition  
**Dependencies:** Supabase workspaces/members/invitations, RLS, email delivery, authenticated sessions, Supabase Realtime and feature flags.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| COL-01 | A workspace invitation URL shall retain an invitation identifier, request sign-in when needed and accept/activate the target workspace. | Invite route/query handling and invitation services/endpoints exist. |
| COL-02 | Invitation delivery shall have the implemented provider/fallback path. | Workspace invite API uses Resend with Supabase Auth fallback behavior. |
| COL-03 | Collaboration/presence UI shall not be exposed as enabled product functionality while the flag remains false. | `collaboration` is false; live-cursor/realtime code is present but gated. |

### Required definition before release

- Membership roles, invite expiry/revocation, transfer of ownership, concurrent-edit conflict resolution, presence privacy, permissions and collaboration success criteria are **Needs Definition**.
- Until these decisions and end-to-end QA exist, marketing must not claim real-time collaboration.

---

## F-10 — Notion import and YouTube Study

**Feature IDs:** FE-32 and FE-33  
**Status:** Later  
**Priority:** Later  
**Dependencies:** Feature flags, Notion API routes/converter, YouTube transcript endpoint/study services and optional AI-study flag.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| IMP-01 | Notion search/fetch and block conversion paths shall remain unavailable in default product UI while `notionImport` is false. | Notion routes, converter and modal exist; flag defaults false. |
| IMP-02 | YouTube transcript/player/study paths shall remain unavailable in default product UI while `youtubeStudy` is false. | YouTube node/player/studio and transcript endpoint exist; flag defaults false. |
| IMP-03 | AI extensions for YouTube Study shall remain disabled while `youtubeStudyAI` is false. | Separate feature flag and study AI service exist. |

### Required definition before release

- Notion authorization, supported content mapping, import error states, source attribution and refresh behavior are undefined.
- YouTube content rights, transcript availability/failures, source-video handling, output ownership and AI-study scope are undefined.

---

## F-11 — Public experience and marketplace

**Feature IDs:** FE-34 and FE-35  
**Status:** Marketing Built; marketplace Later  
**Priority:** Now for public experience; Later for marketplace  
**Dependencies:** App routing, auth state and marketplace feature flag.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PUB-01 | Signed-out visitors shall see marketing/public entry routes, while signed-in users reach the landing/dashboard surface from `/`. | Auth-aware root routing exists. |
| PUB-02 | Public `/features`, login and signup routes shall remain available. | Lazy route definitions and page components exist. |
| PUB-03 | `/marketplace` shall not be presented as a functional marketplace while its flag is false; the present page is placeholder/fallback content. | Route/flag logic and placeholder page are implemented. |

### Required definition before release

- Marketplace users, listing model, moderation, transactions, payments, ownership, fulfillment and support obligations are all **Needs Definition**.

---

## F-12 — Administration and telemetry

**Feature ID:** FE-36  
**Status:** Partially Built  
**Priority:** Next  
**Dependencies:** Supabase RPC/RLS, profile/telemetry tables, client-error capture and owner gate.

### Goal

Support restricted operational visibility without relying on a browser-only authorization control.

### Current functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| ADM-01 | The application shall record client-error and site-visit telemetry through the implemented data paths. | `errorTelemetry`, `useSiteTelemetry`, migrations and API/RPC support exist. |
| ADM-02 | The owner admin route shall display implemented analytics, user and client-error data. | `AdminDashboard` and related RPC calls exist. |
| ADM-03 | The database/RLS/RPC layer, rather than the browser route gate, shall remain the authority for administrative data operations. | Current client gate is a fixed email and is not sufficient authorization evidence. |

### Required definition before release

- A server-enforced admin role model, administrator onboarding/offboarding, audit trail, retention policy and deletion workflow acceptance criteria are **Needs Definition**.
- Verify all RLS/RPC checks before considering admin ready for production operations.

---

# 5. Data, roles and integrations

## Data requirements

| Data domain | Requirement | Status |
|---|---|---|
| Canvas graph | Persist nodes, node data, positions, hierarchy and parent-scoped edges. | Built |
| Content | Retain ordered `Block[]` content with note/block/fused-note data and metadata. | Built |
| Planning | Keep Kanban configuration/order separate from child note metadata. | Built |
| Assets | Retain asset id, binary/metadata, local reference and optional cloud path/presence. | Built |
| AI | Retain chat/message content, scope, citations, trace and created/edited-node references locally and, for authenticated paths, in `ai_chats`. | Partially Built |
| Workspace | Retain workspace, membership, invitation, sync revision, version and asset metadata through Supabase schema/RLS. | Partially Built due gated collaboration and sync validation |
| Telemetry | Retain client errors and visit events under existing schema/policies. | Partially Built due admin/security validation |

## Role requirements

| Role/state | Product permission requirement today | Status |
|---|---|---|
| Anonymous | Use core local canvas within code-enforced anonymous and nesting limits; receive sign-in prompts. | Built, with cap conflict unresolved |
| Authenticated user | Use profile, cloud workspace/sync path and cloud AI-history path where configured. | Built / sync path partially validated |
| Workspace owner | Own/operate workspace and invitations under database policies. | Partially Built; collaboration UI is off |
| Workspace member | Read/access workspace graph/assets under membership policies. | Partially Built; collaboration UI is off |
| Application admin | Use restricted operations dashboard only under server-authorized policy. | Needs Definition; client fixed-email gate is insufficient |

## Integration requirements

| Integration | Required use | Status |
|---|---|---|
| Supabase Auth | Session, sign-up/sign-in, recovery and OAuth path. | Built |
| Supabase Postgres/RLS | Profiles, workspaces, graph, versions, AI chats, telemetry and sync state. | Built; security validation ongoing |
| Supabase Storage | Referenced asset mirroring. | Built |
| Supabase Realtime | Future presence/collaboration. | Later |
| Google Gemini + server guard | Text/stream/grounded AI request execution. | Built |
| Gemini search helper | Grounded web-search responses. | Built |
| Resend | Workspace invite delivery path. | Partially Built |
| Notion API | Future content import. | Later |
| YouTube transcript endpoint | Future study workflow. | Later |
| Browser IndexedDB / File System Access / clipboard APIs | Local persistence, optional folder mirror and canvas utilities. | Built with browser constraints |

# 6. Quality, constraints and release evidence

## Existing quality evidence

The repository contains smoke, core, advanced and mobile Playwright scenarios for app shell, canvas graph/organization, block editor, AI response, card lifecycle, files, local/cloud persistence, save reliability, selection performance, tasks, Kanban/calendar, limits/security and mobile flows.

This is test inventory evidence, not a blanket claim that every scenario is currently passing. The known standalone-block context-menu setup failure occurs before its assertion in the current workspace test run and needs stabilization.

## Product constraints that must remain visible

| Constraint | Effect | Status |
|---|---|---|
| Card and node quotas | No numeric card or per-canvas node quota is enforced during the current beta configuration. | Built |
| Anonymous cap conflict | Product code and beta document state different values. | Needs Definition |
| Local-first baseline | IndexedDB remains the safety net even when cloud/folder paths are selected. | Built |
| Browser-specific folder API | Folder persistence is not a universal browser capability. | Built with constraint |
| 25 MiB cloud-eligible asset limit | Larger binary handling needs defined behavior. | Built with constraint |
| Gated capabilities | Off-by-default paths are not released scope. | Later |

## Release blockers / decisions

1. Approve one anonymous card-limit policy and synchronize code, copy and test assertions.
2. Validate cloud sync, backup/version restore and asset recovery under realistic cross-browser/device conditions.
3. Verify Supabase RLS/RPC authorization independently of client routing, especially for admin and workspace operations.
4. Define release criteria for each feature-flagged capability before enabling it.
5. Stabilize the existing canvas standalone-block test setup and add focused camera interaction regression coverage.

# 7. Traceability and roadmap

## Feature-to-status traceability

| Feature IDs | PRD section | Current status | Next decision/action |
|---|---|---|---|
| FE-01–07 | F-01 Canvas and visual graph | Built; camera validation In Progress | Resolve limits and complete interaction regression QA. |
| FE-08–12 | F-02 Notes, metadata and editing | Built | Define accessibility and interchange scope if required. |
| FE-13 | F-03 Files and media | Built with constraints | Define file support, quota and large-file policy. |
| FE-14–17 | F-04 Planning | Built | Define recurrence/reminders/custom templates only if prioritized. |
| FE-18–19 | F-05 Retrieval | Built | Define search scale/ranking and future retrieval scope. |
| FE-20–22 | F-06 Persistence | Local built; cloud partially built | Release-grade recovery/sync validation. |
| FE-23 | F-07 Identity | Built | Define account lifecycle/data-rights behavior. |
| FE-24–29 | F-08 AI | Text/grounded built; history partial; images later | Define safety, economics, retention and image release criteria. |
| FE-30–31 | F-09 Collaboration | Invite partial; realtime later | Define roles, concurrency and invite lifecycle. |
| FE-32–33 | F-10 Import/study | Later | Define permissions, mapping, rights and errors. |
| FE-34–35 | F-11 Public/marketplace | Marketing built; marketplace later | Define marketplace model before release. |
| FE-36 | F-12 Admin/telemetry | Partially built | Secure server-authorized admin role model. |

## Now / Next / Later

| Horizon | Scope supported by evidence |
|---|---|
| Now | Protect the enabled individual workspace: canvas/editing, persistence safety net, files, planning, authentication, text/grounded AI and public entry. Reconcile limits, validate sync/recovery, test camera interactions and verify admin authorization. |
| Next | Complete definition and release validation for collaboration, Notion import, AI image generation, YouTube Study and administration hardening before enabling any of them. |
| Later | Marketplace and legacy ideas: saved searches, export, backlinks/graph view, comments/mentions, custom templates and mobile-first optimization. None is an approved delivery commitment. |

# 8. Open questions requiring product ownership

1. Is the approved anonymous note-card cap 3 or 25, and what messaging accompanies it?
2. Which browsers/devices are officially supported for the canvas, folder storage and file workflows?
3. Is cloud sync an entitlement, a future paid feature, or both? What are the quota, downgrade and recovery rules?
4. What is acceptable resolution behavior for concurrent workspace changes?
5. What server-enforced role model will administer the product?
6. What data retention, deletion and export rights apply to workspace data, assets, AI chats and telemetry?
7. What model, spend, rate-limit, safety, consent and audit requirements govern AI?
8. Which gated capability has an approved target user and measurable release criteria first?
9. Is mobile a supported operating mode or a non-goal for the current release?
10. Which historical product documents should be retired after this PRD is approved?

# 9. Change control

Update this PRD whenever a feature flag, route, visible workflow, data schema, entitlement, role, AI behavior or release decision changes. Any new future requirement must identify its owner, status, dependency, acceptance criteria and source of approval before it is moved into Built or Next scope.

## Source register

- Product baseline: `docs/PRODUCT_MASTER_DOCUMENT.md`
- Runtime/routes/flags: `src/App.tsx`, `src/config/featureFlags.ts`, `src/store/types.ts`, `src/types.ts`
- Feature implementation: `src/features/**`, `src/services/**`, `src/store/**`
- Server/schema: `api/**`, `supabase/migrations/0001_init.sql` through `0019_statement_level_sync_revision.sql`
- Quality/history: `e2e/**`, `BETA_SCOPE.md`, `BETA_READINESS_REPORT.md`, `docs/INFORMATION_ARCHITECTURE.md`
