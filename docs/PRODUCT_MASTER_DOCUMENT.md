# Product Master Document — Chnk it / Infonote

**Status:** living source of truth  
**Evidence reviewed:** product source, feature flags, database migrations, API routes, automated test inventory, and repository documentation  
**Snapshot date:** 2026-09-13  
**Scope rule:** this document records only behavior evidenced in the repository. A source file or migration is not treated as a released capability when its feature flag is off or its route is a placeholder.

## Status language

| Status | Meaning in this document |
|---|---|
| **Built** | Implemented and enabled by default in the current application. |
| **Partially Built** | Implemented in material part, but has a known constraint, incomplete end-to-end validation, or conflicting evidence. |
| **In Progress** | Present in the current working tree or an active implementation path, but not a confirmed released surface. |
| **Next** | Explicitly identified by existing product/beta documentation as work to complete after current-state validation. |
| **Later** | Explicitly deferred by existing documentation. |
| **Idea** | Mentioned only as a possible future direction in older product documentation; not committed. |
| **Needs Definition** | A product decision, acceptance criteria, or release condition is absent or contradictory. |

---

# Product Overview

Chnk it / Infonote is a local-first, browser-based visual knowledge workspace. People create notes, free-standing content blocks, files, boards, and connections on an infinite canvas; notes can also contain nested canvases. The application combines a block editor with spatial organization, task metadata, Kanban/calendar views, optional cloud persistence, and an AI panel.

The current beta model is local-first: IndexedDB is the safety net; a local folder mirror is optional on browsers that support the File System Access API; authenticated users can use a Supabase workspace mirror. The product enforces creation limits per canvas and for anonymous users.

**Primary audiences evidenced in the product copy and templates:** individual thinkers, researchers, planners, and creators. Workspace membership/invitations exist in the codebase but are disabled by default.

**Primary value loop:** capture or create a card/block → edit rich content → arrange, connect, nest, fuse, or board it → save locally and optionally sync → retrieve through canvas navigation, table of contents, search, calendar, or AI-assisted context.

## Application Map

| Route / entry | Screen | Current behavior | Status |
|---|---|---|---|
| `/` | Marketing page for signed-out visitors; landing/dashboard for signed-in visitors | Route selection is auth-aware. | Built |
| `/features` | Public feature/marketing page | Static product presentation. | Built |
| `/canvas` | Canvas workspace | Main application surface within `ReactFlowProvider`. | Built |
| `/login` | Sign in | Email/password, password recovery and OAuth entry path. | Built |
| `/signup` | Sign up | Registration entry path. | Built |
| `/update-password` | Password recovery completion | Updates password after recovery. | Built |
| `/profile` | Profile and account settings | Account/profile surface. | Built |
| `/wajihadmin` | Owner admin dashboard | Client gate accepts only the configured owner email, then loads analytics, users and client errors through Supabase RPC. | Partially Built |
| `/marketplace` | Marketplace page | Route falls back to landing/marketing while `FEATURES.marketplace` is false; component says it is a placeholder. | Later |
| `/invite/:uuid` or `?workspaceInvite=` | Workspace invitation activation | Stores invite id temporarily, requires sign-in, accepts invitation and activates its workspace. Collaboration UI remains feature-gated. | Partially Built |

## Product boundaries and feature flags

| Capability | Flag default | Product surface conclusion | Status |
|---|---:|---|---|
| Kanban and calendar | On | Board creation and Kanban/calendar components are available. | Built |
| Files | On | File ingestion, local asset store, cloud asset mirror and file viewer/card are available. | Built |
| Compact card metadata | On | Chip-bar metadata UI is the active implementation; legacy property panel remains in source. | Built |
| Collaboration | Off | Invitations, membership, realtime and live cursors exist, but the capability is not enabled by default. | Later |
| Notion import | Off | Conversion, server routes and modal exist but are not enabled by default. | Later |
| AI images | Off | Image API/client path exists but UI capability is gated off. | Later |
| YouTube study | Off | YouTube node, transcript endpoint and study studio exist but are not enabled by default. | Later |
| YouTube study AI | Off | AI actions for the study workflow are separately gated. | Later |
| Marketplace | Off | Page exists but is explicitly placeholder content. | Later |

---

# Artifact Inventory

This inventory is product-facing. Every user-facing component is named in **Screens and Components**; runtime/supporting artifacts and all API endpoints are catalogued in **Operational Services and APIs**. Stylesheets, declaration files and test fixtures are supporting implementation files rather than separate product artifacts.

| ID | Name | Type | Area | What it does | Status | Dependencies |
|---|---|---|---|---|---|---|
| ART-01 | Application shell | Route shell | Core | Auth-aware routing, lazy loading, error boundary, global sync and global modals. | Built | React, Zustand, Supabase, SyncCoordinator |
| ART-02 | Infinite canvas | Screen/workspace | Canvas | Renders nodes, edges, minimap, controls, keyboard navigation, selection and viewport behavior. | Built | React Flow, node/edge store |
| ART-03 | Note card | Canvas node | Content | Renders a note in icon, medium, expanded and focused contexts. | Built | Block editor, metadata, navigation |
| ART-04 | Standalone block | Canvas node | Content | Places a block-array directly on a canvas. | Built | Block editor, asset store |
| ART-05 | Fused note | Canvas node | Content | Combined long-form block content / document-like node. | Built | Block editor, canvas relations |
| ART-06 | Kanban board | Canvas node | Planning | Organizes child note cards into metadata-driven lanes and calendar views. | Built | Note metadata, dnd-kit |
| ART-07 | File card/viewer | Canvas node + viewer | Files | Stores/retrieves file assets and displays an appropriate renderer or browser viewer. | Built | IndexedDB assets, optional Supabase Storage |
| ART-08 | Block editor | Editor | Content | Edits rich block arrays, commands, formatting, media, drag/reorder and selection. | Built | Block models, asset ingestion |
| ART-09 | Canvas navigation | Navigation | Core | Breadcrumbs, nested canvases, fit/focus actions and peek/fullscreen surfaces. | Built | parentId, React Flow viewport |
| ART-10 | Canvas actions | Menus/toolbars | Canvas | Add, select, copy/cut/paste, arrange, organize, screenshot, delete, edge editing and multi-select. | Built | Clipboard, node slice, browser APIs |
| ART-11 | Storage controls | Settings | Persistence | Selects storage preference; loads/saves local folder or cloud; exposes backup/version actions. | Built | IndexedDB, File System Access API, Supabase |
| ART-12 | Sync coordinator | Background process | Persistence | Coordinates local-first hydration, outbox, cloud save/load, asset sync and version creation. | Partially Built | Supabase, IndexedDB, workspace state |
| ART-13 | Authentication | Screens/service | Identity | Session hydration, sign-up, login, OAuth, password recovery and account profile. | Built | Supabase Auth |
| ART-14 | Workspace collaboration | Service + dialogs | Collaboration | Workspace membership, invitations, realtime cursors and workspace switching. | Later | Supabase, Resend; feature flag |
| ART-15 | AI panel | Panel | AI | Ask/create conversational UI, context attachment, chat history, trace and provenance. | Built | Gemini API routes, AI store |
| ART-16 | AI canvas operations | AI action layer | AI | Creates/edits notes, mind maps, boards and timelines; supports reviewed canvas organization. | Built | AI response schema, node slice |
| ART-17 | Templates | Modal/data | Onboarding | Previews and inserts seven structured canvas templates. | Built | Node/edge model |
| ART-18 | Search and table of contents | Panels | Retrieval | Searches indexed local content and presents an outline of current canvas content. | Built | search worker, content model |
| ART-19 | Task surfaces | Components/modals | Planning | Todo blocks, card-level tasks, task progress and task details. | Built | Note data, block content |
| ART-20 | Admin dashboard | Screen | Administration | Owner-only user list, traffic metrics and client-error review; can request deletion through RPC. | Partially Built | Supabase RPC, hard-coded owner gate |
| ART-21 | Notion import | Modal + API | Import | Searches/fetches Notion content and converts it to app blocks. | Later | Notion API, feature flag |
| ART-22 | YouTube study | Node + studio | Research | Transcript retrieval, player, clips/selections and study artifacts. | Later | YouTube transcript API, feature flags |
| ART-23 | Marketplace | Page | Distribution | Marketplace landing/placeholder only. | Later | feature flag |
| ART-24 | E2E suite | Quality artifact | QA | Smoke, core, advanced and mobile Playwright scenarios cover major product workflows. | Built | Vite, Playwright |
| ART-25 | Operational services and APIs | Runtime artifact set | Platform | Auth, persistence, sync, assets, search, telemetry, API endpoints and database migrations backing the visible product. | Built / Partially Built by capability | Browser APIs, Supabase, Gemini, feature flags |

---

# Feature Inventory

| Feature ID | Feature | Parent Feature | What it does | Status | Priority | Dependencies |
|---|---|---|---|---|---|---|
| FE-01 | Canvas graph | Core workspace | Pan/zoom, render nodes/edges, selection, minimap and controls. | Built | Now | React Flow, Zustand |
| FE-02 | Canvas node lifecycle | Canvas graph | Create, update, resize, duplicate, delete with confirmation/undo. | Built | Now | Node slice, history |
| FE-03 | Connect and edit edges | Canvas graph | Connect cards; edit/reconnect/delete/select links. | Built | Now | React Flow edge model |
| FE-04 | Nested canvases | Canvas graph | Uses `parentId` to open a card’s child canvas and breadcrumbs to return. | Built | Now | Node model, navigation slice |
| FE-05 | Fuse, split and release content | Canvas graph | Combines compatible nodes, splits node content, or releases content to blocks. | Built | Now | Node/content sync |
| FE-06 | Canvas organization | Canvas graph | Manual layout modes plus organize-canvas action and AI-reviewed arrangement/undo. | Built | Now | Node positions, AI operations |
| FE-07 | Node limits | Core workspace | Blocks creation above 50 nodes per canvas; anonymous note/depth limits and UI notices. | Built | Now | nodeLimits, auth state |
| FE-08 | Note card modes | Content | Icon, medium, expanded and focused reading/editing presentations. | Built | Now | NoteCard, NoteExpandedContent |
| FE-09 | Metadata | Content | Title, description, icon, cover, tags, dates, status, priority, URL, assignee and progress properties. | Built | Now | NoteData, metadata UI |
| FE-10 | Block editing | Content | Text, heading, list, todo, toggle, quote, callout, code, table, divider, page, AI, media/video/file and structural blocks. | Built | Now | BlockEditor, BlockComponents |
| FE-11 | Editor commands | Content | Slash command insertion, markdown shortcuts, text formatting toolbar and link/color actions. | Built | Now | editor hooks/utilities |
| FE-12 | Editor DnD | Content | Reorders blocks and supports cross-editor/canvas drops. | Built | Now | HTML DnD, dnd-kit utilities |
| FE-13 | Files and media | Files | Ingests image/video/file content, stores blobs locally, mirrors referenced assets and renders previews/viewers. | Built | Now | IndexedDB, Supabase Storage |
| FE-14 | Kanban boards | Planning | Lanes derived from note metadata; supports board card editing, DnD, lane operations and calendar. | Built | Now | Kanban node, card metadata |
| FE-15 | Calendar | Planning | Day/time/year views and task chips derived from board cards and dates. | Built | Now | Kanban calendar model |
| FE-16 | Card tasks | Planning | Displays and edits actionable task details/progress associated with cards. | Built | Now | Block/Note content |
| FE-17 | Templates | Onboarding | Inserts Zettelkasten, Mindmap, Second Brain, PARA, Daily Planner, Meeting Notes and User Story Mapping structures. | Built | Now | Template definitions |
| FE-18 | Canvas retrieval | Retrieval | Table of contents and worker-backed search results for current content. | Built | Now | tocService, search worker |
| FE-19 | Clipboard and screenshot | Utilities | Copy/cut/paste canvas nodes and take a canvas screenshot. | Built | Now | Clipboard/browser APIs |
| FE-20 | Local persistence | Persistence | IndexedDB workspace safety-net and AI chat cache. | Built | Now | LocalWorkspaceStore, AIChatStore |
| FE-21 | Folder mirror | Persistence | Explicit local-folder read/write including associated assets; Chromium-dependent. | Built | Now | File System Access API |
| FE-22 | Cloud sync | Persistence | Workspace-scoped delta sync, revision checks, backup/restore and manual/daily versions. | Partially Built | Now | Supabase, SyncCoordinator |
| FE-23 | Auth and profile | Identity | Email/password, OAuth, recovery, welcome flow and profile. | Built | Now | Supabase Auth |
| FE-24 | AI Ask | AI | Produces a response in an auditable chat without necessarily changing the canvas. | Built | Now | `/api/ai/text` or `/stream`, Gemini |
| FE-25 | AI Create/Edit | AI | Routes requests, produces structured artifacts, places/revises nodes, records provenance and supports turn rollback. | Built | Now | AI runner, node slice, Gemini |
| FE-26 | AI context and citations | AI | Explicit `@` scope, selected content types, evidence/citation previews, reasoning trace and clarifying form. | Built | Now | AI scope/types, search service |
| FE-27 | Grounded AI | AI | Optional web-search-backed answer path. | Built | Now | `/api/ai/grounded`, Gemini search helper |
| FE-28 | AI image creation | AI | Image-generation variant of Create. Code/API exists; UI flag defaults off. | Later | Later | `/api/ai/image`, feature flag |
| FE-29 | AI chat history | AI | Local cache plus authenticated cloud chat list/open/duplicate/regenerate/delete. | Partially Built | Now | IndexedDB, Supabase `ai_chats` |
| FE-30 | Workspace invitations | Collaboration | Sends/accepts invitations and activates workspace after login. | Partially Built | Next | Supabase, Resend, feature flag |
| FE-31 | Realtime presence | Collaboration | Subscribes to updates and renders live cursors. Disabled by default. | Later | Later | Supabase Realtime, feature flag |
| FE-32 | Notion import | Import | Search/fetch Notion pages and convert blocks. Disabled by default. | Later | Later | Notion API, feature flag |
| FE-33 | YouTube Study | Research | URL source, transcript, player, moments/clips and canvas export. Disabled by default. | Later | Later | transcript API, feature flags |
| FE-34 | Marketing and public pages | Acquisition | Marketing, feature presentation and auth-aware entry page. | Built | Now | Lazy routes |
| FE-35 | Marketplace | Distribution | Placeholder marketplace page behind disabled feature flag. | Later | Later | feature flag |
| FE-36 | Admin/telemetry | Administration | Owner dashboard for users, visits, analytics and client errors. | Partially Built | Next | RLS, RPC, owner gate |

---

# Feature Details

## Current workspace behavior

- The canvas stores nodes and edges. Current supported node types are `note`, `block`, `fused-note`, `kanban`, and `youtube`.
- A nested canvas is a node collection sharing a parent node id; edges also carry the active parent context so they do not appear across canvas levels.
- Cards can be selected individually/multiple, linked, duplicated, color-updated, arranged, moved into a board, fused, nested, or deleted through a confirmation flow with one-click recovery of the most recent deletion.
- Canvas `fit`, center, keyboard controls, minimap and zoom controls are explicit navigation actions. Editor gestures are intended to remain isolated from canvas navigation.
- Current creation enforcement is **50 nodes per canvas**. Source currently enforces **25 anonymous note cards** and nesting no deeper than level 3; this conflicts with the earlier beta-scope document that says 3 anonymous cards.

## Content and metadata behavior

- Notes hold a label and optional rich `Block[]` content, visual metadata and task/planning metadata. Expanded notes expose a scrollable editor; compact metadata chips are the default variant.
- Blocks support paragraph text, heading 1–3, bullets, numbered lists, todos, toggles, quotes, callouts, code, tables, dividers, pages, AI blocks, images, video, files, color blocks, galleries, containers and columns. The exact user-facing menu is defined by editor menu constants.
- Rich text formatting stores markdown-oriented representation rather than relying only on browser DOM formatting. Block editing supports paste handling, slash commands, selection formatting, reorder and cross-editor transfer.
- Task-oriented metadata includes status, priority, dates, assignee, progress and card task details. Kanban consumes note metadata rather than copying it into board-specific card entities.

## Planning behavior

- A Kanban board stores its lane configuration and ordering; child note cards retain their original metadata and use the board id as `parentId`.
- Boards can group by supported card metadata, create/rename/reorder/delete columns, accept card drops and show calendar/time/year representations of dated work.
- Templates generate nodes and edges together. Their preview and insertion share one builder so the preview should match the inserted layout.

## Persistence behavior

- Local workspace persistence uses IndexedDB as the baseline safety net, including cloud outbox support. AI chat transcripts also have an IndexedDB cache.
- Local folder persistence is an explicit mirror/restore option and includes asset files; support is constrained by the browser File System Access API.
- Authenticated cloud sync is workspace-scoped. The code includes background hydration, revision-aware delta sync, backups, manual/daily canvas versions and referenced asset upload/download.
- Uploaded assets are addressed by an asset id, cached in IndexedDB and, when cloud-sync eligible, mirrored to workspace storage. Source currently limits cloud-eligible assets to 25 MiB.

## AI behavior

- The AI panel has **Ask** and **Create** modes, with selectable effort (`Fast`, `Efficient`, `Smart`), optional web search, explicit scope attachments, content-shape chips and an inspectable execution trace.
- Ask returns an assistant message. Create/Edit can construct notes, fused notes, mind maps, boards and timelines, place them on the canvas, and attach provenance. A separate canvas-organization flow plans changes before application and exposes undo.
- AI conversations have local and authenticated cloud history. The backend owns model/guard behavior; the client’s requested model may be null to defer to the server.
- Image generation, despite an API/client path, is disabled by `FEATURES.aiImages` by default.

---

# Screens and Components

## Screens and dialogs

| Area | Components/screens evidenced | Status |
|---|---|---|
| App/public | `MarketingPage`, `FeaturesPage`, `LandingPage`, `MarketplacePage`, `ErrorBoundary`, `CrystalLoader` | Marketing/landing built; marketplace later |
| Identity | `LoginPage`, `SignupPage`, `UpdatePasswordPage`, `ProfilePage`, `AuthModal`, `WelcomeModal`, `AuthProvider` | Built |
| Canvas and navigation | `CanvasBoard`, `CanvasContextMenu`, `CanvasMiniMap`, `CanvasSlashMenu`, `DragChip`, `CenteredEdge`, `CustomConnectionLine`, `WorkspaceLoadOverlay`, `CloudLoadModal`, `CloudSyncModal`, `LocalSyncModal`, `ShareWorkspaceModal`, `BranchDeleteConfirmation`, `LiveCursors`, `Breadcrumbs`, `BottomMenu`, `HomeButton`, `ModifierKeyIndicator` | Built except live cursors/collaboration gated |
| Content cards | `NoteCard`, `NoteExpandedContent`, `NoteBody`, `NoteBodyPreview`, `NoteCoverSection`, `NoteFooterStats`, `NoteMetadataSection`, `FusedNoteNode`, `BlockNode`, `BlockLodBody`, `ChunkItPanel`, `ConvertCardModal`, `CoverPicker`, `IconPicker`, `EmojiPickerPanel`, `FolderArt`, `AISkeletonCard`, `SkeletonLoader`, `CardMetaBar`, `MetaPopover`, `AddPropertyMenu`, `NotePropertiesPanel`, `PropertyRow`, and individual assignee/date/priority/progress/status/URL property components | Built |
| Editor | `BlockEditor`, `BlockItem`, `BlockComponents`, `SlashMenu`, `BlockMenu`, `FloatingToolbar`, `SelectionCapsule`, `SortableBlockWrapper`, `GalleryBlock`, `ColumnsBlock`, `ContainerBlock`, `ColorBlock`, `ColorBlockModal`, `LinkBlock`, `MediaPlaceholder`, `ResizableMediaWrapper`, `CustomDateTimePicker` | Built |
| Files | `FileCard`, `FileViewer`, `FileRenderer`, `FileArt`, `AssetMedia` | Built |
| Planning | `KanbanNode`, `KanbanLane`, `KanbanCard`, `KanbanCardMetaEditor`, `KanbanColumnDeleteModal`, `KanbanBlockPreview`, `KanbanCalendar`, `KanbanCalendarDay`, `KanbanCalendarChip`, `KanbanCalendarTaskChip`, `KanbanCalendarTray`, `KanbanTimeGrid`, `KanbanTimedEvent`, `KanbanYearGrid`; `CardTasksModal`, `TaskDetail`, `TaskList`, `TaskProgress` | Built |
| AI | `AIPanel`, `AIChatHistory`, `AIContextBar`, `AIMentionPicker`, `AICommandPicker`, `AIClarifierOverlay`, `AIClarifyForm`, `AICitationPreview`, `AIMarkdown`, `AIRunTrace`, `AITurnResult`, `AIRegenerateDialog`, `AICanvasOrganizationPreview`, `AIProvenanceMark`, `SelectedNodeStrip` | Built |
| Retrieval/settings | `TableOfContentsPanel`, `SearchResults`, `StorageControls`, `StorageChoiceModal`, `CanvasLimitBadge`, `LimitNoticeModal`, `AnonSaveReminder`, `KeyboardShortcutsPanel`, `MetadataPanel`, `MultiSelectionToolbar`, `EdgeEditingToolbar`, `ThemeSwitcher`, `HistoryControls`, `FullscreenModal`, `CenterModal`, `SidePanel`, `SidePeek`, `FullscreenNoteList`, `MediaLightbox`, `PeekMenu`, `ChipInput`, `CustomDatePicker`, `CustomSelect`, `Tooltip` | Built |
| Templates | `TemplatePreviewModal` and template definitions for Zettelkasten, Mindmap, Second Brain, PARA, Daily Planner, Meeting Notes and User Story Mapping | Built |
| Administration | `AdminGate`, `AdminDashboard` | Partially Built |
| Future gated surfaces | `NotionImportModal`, `YouTubeNode`, `YouTubePlayer`, `YouTubeStudio` | Later |

## Shared UI and implementation supports

`Button`, `Tabs`, `DuotoneIcon`, `BorderBeam`, `LinkPreview`, `NumberTicker`, Solar icon catalog, `ChipInput`, `CustomSelect`, `CustomDatePicker`, `Tooltip`, modifier-key store, canvas level-of-detail hooks, scheduled mount hooks, editor command/selection/drag hooks, clipboard utilities, asset utilities and storage adapters are reusable supporting artifacts. They are implementation components, not independent product screens.

## Operational Services and APIs

| Artifact group | Concrete artifacts evidenced | What it does | Status |
|---|---|---|---|
| State and content | `useStore`, node/auth/navigation/storage/UI/AI slices, `contentHydration`, `contentSync`, `nodeIndex`, `nodeLimits`, `temporalControl`, `historyConfig` | Maintains graph, content, navigation, auth, persistence preferences and undoable application state. | Built |
| Cloud/local persistence | `SyncCoordinator`, `syncController`, `cloudSync`, `StorageManager`, `LocalWorkspaceStore`, `FileSystemStorage`, `FileSystemBackend`, `storagePreference`, `AIChatStore`, `AIChatCloudStore` | Hydrates, stores, queues, syncs and recovers workspace and AI-history data across local, folder and cloud storage. | Partially Built |
| Assets and files | `assetStore`, `assetSync`, `assetRef`, `folderAssets`, `ingest`, `useAssetUrl`, `AssetMedia`, file renderers/view helpers | Ingests, identifies, displays, mirrors and restores binary assets. | Built |
| Search, metadata and telemetry | `searchService`, `search.worker`, `tocService`, `metadataService`, `errorTelemetry`, `useSiteTelemetry` | Finds local content, creates outlines, supports metadata and records product/error telemetry. | Built |
| AI runtime | `aiRouter`, `aiRunner`, `aiCanvasOperations`, `aiScope`, `aiCompose`, `aiPrompt`, `aiCitations`, `aiTelemetry`, `aiResultUtils`, `aiService`, `aiAuthHeader` | Routes AI requests, constructs scopes/prompts, validates structured results, changes canvas content and exposes traces/citations. | Built |
| Auth, collaboration and imports | `AuthContext`, `authFlow`, `collaboration`, `realtimeSync`, `useRealtimeSync`, Notion converter/import services, YouTube transcript/study services | Provides identity; contains gated collaboration, import and study paths. | Built for auth; Later for gated paths |
| AI server endpoints | `/api/ai/text`, `/stream`, `/grounded`, `/image`; `_lib/aiGuard`, `geminiSearch` | Enforces AI request policy and serves normal, streaming, grounded and image-generation paths. | Built for text/stream/grounded; Later for image UI |
| External-content endpoints | `/api/notion/search`, `/fetch`; `/api/youtube/transcript` | Retrieves import/study source material for feature-gated workflows. | Later |
| Workspace endpoints | `/api/workspace/invite`, `/invite-health` | Sends/investigates workspace invitations. | Partially Built |
| Database artifacts | migrations `0001_init.sql` through `0019_statement_level_sync_revision.sql` | Establish schema, RLS, roles/functions, workspace sync, versions, assets, chats and telemetry. | Built / requires security validation |

---

# User Flows

| Flow | Current path | Outcome | Status |
|---|---|---|---|
| First launch and storage choice | App opens → `StorageChoiceModal` asks for device-only or device + cloud → authentication is required for cloud choice | User establishes local-first storage preference. | Built |
| Anonymous capture | Open canvas → create note/block → edit → IndexedDB persists locally → sign-in reminder/limit notice may appear | Work remains in the browser safety-net subject to anonymous limits. | Built |
| Authenticated workspace | Sign in/sign up/OAuth → session hydrates → SyncCoordinator loads/syncs active workspace | User can use cloud workspace persistence. | Partially Built |
| Create and edit note | Bottom menu/context menu/template → create note → select/expand → edit blocks and metadata | Content is stored in note data and visible on canvas. | Built |
| Spatial organization | Drag nodes → select/link/fuse/nest/arrange → optional canvas organization | Canvas relationships and layout are updated. | Built |
| Board planning | Add Kanban board → add/move child cards → configure lanes → inspect calendar | Board presents note metadata in planning views. | Built |
| File capture | Drop/select file → local asset ingest → block/file card → open viewer | File is referenced by asset id and can be mirrored if eligible. | Built |
| Backup and recovery | Storage controls → save/load folder or cloud → restore pre-load backup/version | User can recover from supported snapshots/versions. | Partially Built |
| AI ask/create | Open AI panel → attach explicit scope/select output type → submit → trace/citations/results → optional canvas placement | Chat response and/or attributed canvas artifacts. | Built |
| Workspace invitation | Receive URL → sign in → accept invitation → workspace activates → canvas opens | Membership acceptance code path exists; collaboration remains disabled by flag. | Partially Built |
| Notion/YouTube import | Entry points only when flag is enabled | Converter/studio paths are present but unavailable in default product. | Later |

---

# Data Entities

## Client content model

| Entity | Key attributes | Relationships / ownership |
|---|---|---|
| AppNode | `id`, `type`, `position`, `style`, `data`, optional `parentId` | Base canvas item. Node type is note, block, fused-note, kanban or youtube. |
| NoteData | label, content, view/visual state, tags, status, priority, due date, assignee, progress, source/provenance, timestamps | Data for a note node; board cards are child notes. |
| Block | id, type, content, metadata, indentation | Ordered rich content within note/block/fused-note data. |
| BlockNodeData | `content: Block[]`, standalone flag, label/color/pin and planning fields | Free-standing rich block node. |
| FusedNoteNodeData | label, `content: Block[]`, map role/color | Long-form/derived map/document node. |
| KanbanNodeData | lane configuration, group field, card order and view state | Board parent; does not duplicate its cards’ metadata. |
| YouTubeStudyNodeData | Source video/study state | Available in source but default-gated. |
| CanvasEdge | id, source, target, type and `data.parentId` | Directed visual relationship scoped to a canvas level. |
| AI chat/message | chat summary/session, user/assistant/form messages, trace steps, scope, citations, created/edited node refs | Local cache and, for authenticated users, cloud history. |
| Asset record/meta | asset id, blob, file metadata, hash, remote path/presence | IndexedDB asset; may be mirrored to workspace storage. |

## Supabase entities

| Entity | Purpose | Access model evidenced |
|---|---|---|
| `user_profiles` | Profile/account state, activity and admin-related fields | RLS; self-management plus collaborator/admin functions in migrations. |
| `workspaces` | Workspace identity, owner and name | Owner manages; members can read according to later migrations. |
| `workspace_members` | Workspace membership and role | Owner manages; members can read relevant membership. |
| `workspace_invitations` | Pending/accepted invitation data | Owner/invitee-oriented policies. |
| `canvas_nodes` / `canvas_edges` | Workspace-scoped persisted graph | Workspace-member policies; sync revisions added later. |
| `workspace_sync_state` | Workspace revision/state used by local-first sync | Member-readable. |
| `canvas_versions` | Manual/daily graph versions | Workspace-member read/create. |
| `workspace_assets` and storage objects | Cloud metadata/bytes for referenced assets | Workspace-member access policies. |
| `ai_chats` | Authenticated AI chat history | Owner-private policies. |
| `client_errors` | Browser-error events | Insert policy plus admin retrieval RPC. |
| `site_visits` | Visit telemetry | Anonymous insert policy; admin analytics RPC. |
| `recently_viewed_notes` | Dashboard recency support | User-manageable policy. |
| Legacy normalized tables (`nodes`, `connections`, snapshots) | Earlier normalized/snapshot persistence schema | Present in migrations; current sync services use canvas-node/edge paths. |

---

# Roles and Permissions

| Role/state | Current permissions | Evidence / limitation | Status |
|---|---|---|---|
| Anonymous visitor | Can use core canvas locally; subject to anonymous card and nesting creation limits; receives sign-in prompts. | Client `nodeLimits` currently sets 25 note cards and level 3 depth. | Built |
| Authenticated user | Own profile; active workspace; cloud sync and cloud AI history where configured. | Supabase session/auth slice and RLS-backed services. | Built |
| Workspace owner | Manages workspace, members and invitations; can create/update/delete workspace per policies. | Workspace collaboration migrations. | Partially Built because UI is flag-off |
| Workspace member | Reads workspace and can access workspace-scoped canvas/assets under membership policies. | Migrations/RLS. | Partially Built because UI is flag-off |
| Application owner/admin | Can access `/wajihadmin`, admin RPC metrics/errors/users and request user deletion. | Client gate is fixed to `wajih.souissi.ws@gmail.com`; database functions must remain the real authorization control. | Partially Built |

No general-purpose RBAC model, paid-plan role, or granular card-level permission model is evidenced. These are **Needs Definition**, not implied features.

---

# Integrations

| Integration | What it is used for | Status | Notes |
|---|---|---|---|
| Supabase Auth | Email/password, OAuth, recovery, session state | Built | Client configuration is environment-dependent. |
| Supabase Postgres + RLS | Workspaces, graph, versions, chats, telemetry and profile data | Built | Migrations are source of schema truth. |
| Supabase Realtime | Collaboration/presence updates | Later | Code exists; collaboration flag is off. |
| Supabase Storage | Workspace asset mirror | Built | Used for referenced assets. |
| Google Gemini | AI text, stream, grounded response and image route | Built for text/grounded; image later | Server routes include guard utilities. |
| Gemini search helper | Grounded AI/web-search response | Built | Used by grounded AI route. |
| Resend | Workspace invitation email delivery | Partially Built | API supports Supabase Auth fallback. |
| Notion API | Search/fetch/import external pages | Later | Routes and converter exist; feature flag off. |
| YouTube transcript endpoint | Transcript-based study workflow | Later | Studio and AI extensions separately gated. |
| File System Access API | User-selected local-folder mirror | Built | Chromium/browser-support constraint. |
| IndexedDB | Workspace snapshot, outbox, files and AI cache | Built | Local baseline. |
| Browser Clipboard / download/canvas APIs | Copy/paste and screenshots | Built | Browser permission/support dependent. |

---

# Current Product State

## Built now

The enabled product is an individual-first local canvas workspace with rich notes/blocks, nested spatial organization, edges, templates, task metadata, Kanban/calendar, file handling, IndexedDB persistence, optional cloud/folder storage, authentication/profile, AI text/canvas operations, search/TOC, undo/history and beta limit notices.

## Partially built / validate before positioning as complete

1. **Cloud/local-first reliability:** extensive sync, backup, outbox, versions and asset code is present, but this is a high-risk cross-device workflow and needs release-level end-to-end validation.
2. **Workspace collaboration:** membership/invitation infrastructure exists, but the feature is off by default. Do not market real-time co-editing as available.
3. **Admin:** dashboard is implemented, but route authorization is coupled to one hard-coded email in the client. Confirm all RPC/RLS checks before relying on it operationally.
4. **AI chat cloud history:** local/cloud merge and CRUD exist; offline, ownership and conflict behavior need release QA.
5. **Old documentation:** `docs/INFORMATION_ARCHITECTURE.md` is dated 2026-01-03 and conflicts with current source in places. It is historical context, not a current product contract.

## Later / disabled by default

Collaboration, Notion import, AI image generation, YouTube Study (+ Study AI), and marketplace are code-present but off/placeholder. They require an explicit release decision, acceptance criteria and QA before they move to Built.

## Idea / not committed

Older information-architecture documentation mentions saved searches, exports, backlinks/graph view, comments/mentions, custom templates and mobile optimization. None has current committed requirements in the reviewed sources; they remain **Idea** only.

---

# Known Issues

| ID | Issue / evidence | Product impact | Status / action |
|---|---|---|---|
| KI-01 | Anonymous-card limit conflict: `BETA_SCOPE.md` states 3 cards, while current `src/store/nodeLimits.ts` enforces 25. | Pricing/onboarding/support mismatch. | Needs Definition — choose one policy and update code/copy/tests. |
| KI-02 | Several feature paths are implemented but default-gated off. | Stakeholders may mistake source presence for released scope. | Needs Definition — retain, remove or release each with QA criteria. |
| KI-03 | Marketplace page is explicitly a placeholder. | No usable marketplace capability. | Later. |
| KI-04 | Admin gate relies on a hard-coded owner email in the client. | Fragile administration and incorrect authorization posture if server policies are insufficient. | Next — verify server-side/RLS authority and define admin role management. |
| KI-05 | Folder persistence depends on File System Access API. | Not universally available across browsers. | Built with constraint — document/detect unsupported browsers. |
| KI-06 | Earlier beta readiness/scope docs report issues and timelines that predate current code and sometimes conflict with it. | Risk of planning from obsolete facts. | Next — reconcile or archive stale reports after validation. |
| KI-07 | The local legacy canvas E2E test has a context-menu setup failure before its standalone-block assertion in the current workspace run. | Reduces confidence in that regression path; not proof of a user-facing defect. | In Progress — stabilize/isolate test data and rerun. |
| KI-08 | Camera interaction was recently adjusted so editor gestures do not pan/recenter the canvas. | Needs focused UX regression coverage across editing, node drag and media drag. | In Progress — retain E2E regression and test on touch/trackpad. |

---

# Roadmap: Now / Next / Later

This is an evidence-based sequencing recommendation, not a promise of new scope.

## Now — protect the enabled product

1. Resolve the anonymous limit contradiction (3 vs 25) across code, modal text, beta documentation and E2E tests.
2. Run release-grade QA for enabled canvas/editing, persistence, file assets, Kanban/calendar, auth and AI text flows; include the updated camera interaction path.
3. Establish an authoritative release-status register for every feature flag so product copy, roadmap and source cannot disagree.
4. Validate cloud sync/backup/version recovery on a fresh device/browser and with real workspace data.
5. Verify admin RPC and RLS authorization independently of the client-side email gate.

## Next — complete gated capabilities only after definition

1. Define collaboration’s concurrency/conflict, membership and invite acceptance criteria; then enable it behind a QA pass.
2. Define Notion import support boundaries, permissions, data mapping and error states; then enable it behind a QA pass.
3. Define AI image cost, content policy, storage and consent/ownership behavior before enabling image creation.
4. Decide whether YouTube Study is a product line, then define copyright/content access, transcript failure behavior and AI-study scope before enabling it.
5. Define marketplace target users, listing model, moderation, payments and fulfillment; current page is not a product marketplace.

## Later — explicitly deferred or not yet defined

- Paid Pro cloud-sync gating, mentioned as a future beta-scope direction.
- Other legacy ideas such as saved searches, export, backlinks, comments, custom templates and mobile-first experience, only after product discovery turns them into requirements.

---

# Dependencies

| Capability | Depends on | Downstream consumers |
|---|---|---|
| Canvas graph | React Flow, Zustand node/edge slices | Notes, blocks, boards, edges, selection, minimap |
| Nested content | `parentId`, content synchronization, navigation slice | Breadcrumbs, nested canvases, fused/document maps |
| Kanban/calendar | Note metadata, board configuration, dnd-kit | Lanes, card order, date/time views |
| Files | Asset references, IndexedDB, renderer, optional cloud storage | File card, media blocks, folder backup, sync |
| Local-first sync | IndexedDB state/outbox, Supabase auth/workspace, revisions | Cloud load, save pill, versions, asset mirror |
| AI creation | Auth header/guard, Gemini endpoints, structured response parser, node slice | Canvas artifacts, provenance, chat history |
| Grounded AI | AI creation/ask flow plus Gemini search helper | Citations, evidence preview, trace |
| Invitations | Workspace/member schema, server invite route, email provider, auth session | Workspace activation, collaboration (when enabled) |
| Admin dashboard | Owner gate, Supabase RPC, telemetry/client-error schema | Operations and support |
| Feature flags | Build environment/config | Public routes, menus and all deferred capabilities |

---

# Open Questions

1. Is the anonymous note-card cap **3** or **25**? Which pricing/onboarding language is approved?
2. What exact user segment and release criteria justify enabling collaboration, Notion import, AI images, YouTube Study and marketplace?
3. Is cloud sync a beta entitlement, a future paid benefit, or both? What happens on downgrade or across workspace ownership changes?
4. What conflict-resolution behavior is acceptable for concurrent workspace changes?
5. Who can become an administrator, and what server-enforced role model replaces the fixed owner email?
6. Which browsers are officially supported for folder persistence and large-file workflows?
7. What retention, deletion and export expectations apply to workspace data, files, AI chats, telemetry and client errors?
8. What AI model, rate, spend, safety and audit policies are product requirements rather than implementation defaults?
9. Is mobile canvas use in scope for the next release, or should the product explicitly be desktop-first?
10. Which old product documents should be retired once this document is adopted?

---

# Next Actions

1. **Product owner:** answer the ten open questions, beginning with anonymous limits and feature-flag release decisions.
2. **Engineering:** produce a clean, repeatable QA report for enabled features; stabilize the legacy canvas context-menu test before using it as a gate.
3. **Design:** review the enabled-product flows only, especially first-run storage choice, limit notices, editing/drag isolation and unsupported-browser messaging.
4. **Security/operations:** validate Supabase RLS and admin RPCs; document production secrets, invitation delivery fallback and AI guard/rate-limit behavior.
5. **Product operations:** replace or archive stale planning/IA documents after owners sign off on this master document.
6. **Release manager:** keep this file updated whenever a feature flag, route, schema, entitlement, or user-visible workflow changes.

---

## Source Register

- Runtime/app map: `src/App.tsx`, `src/config/featureFlags.ts`, `src/store/types.ts`, `src/types.ts`
- Product behavior: `src/features/**`, `src/services/**`, `src/store/**`
- Backend/API: `api/**`, `supabase/migrations/0001_init.sql` through `0019_statement_level_sync_revision.sql`
- Quality evidence: `e2e/scenarios/**`, `docs/QA_TEST_RESULTS.md`, `docs/QA_TEST_SCENARIOS.md`
- Historical context requiring revalidation: `BETA_SCOPE.md`, `BETA_READINESS_REPORT.md`, `docs/INFORMATION_ARCHITECTURE.md`
