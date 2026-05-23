# Chnk it — Component & Features Sheet

## 1. App Shell (`src/App.tsx`)
| Component | Features |
|---|---|
| **App** | Auth-guarded routing, view switching (landing/marketplace/login/signup/canvas), ReactFlow provider, loading/sync screen, error boundary wrapper |

---

## 2. Auth Feature (`src/features/auth/`)
| Component | Features |
|---|---|
| **AuthProvider** | Auth context provider, session management |
| **AuthButton** | Sign-in / sign-up trigger button |
| **AuthModal** | Auth dialog overlay (login/signup forms) |
| **LoginPage** | Email/password login, OAuth social sign-in, validation |
| **SignupPage** | Registration form, email verification, password rules |
| **SignInPanel** | Slide-in side panel with auth form |
| **ProfileMenu** | User avatar dropdown, account settings, logout |

---

## 3. Canvas Feature (`src/features/canvas/`)
| Component | Features |
|---|---|
| **CanvasBoard** | Infinite canvas (ReactFlow), node/edge rendering, pan/zoom, minimap, grid snap |
| **CanvasContextMenu** | Right-click context menu (copy/paste/delete/duplicate) |
| **CanvasSlashMenu** | `/` command palette to insert new nodes/blocks |
| **CenteredEdge** | Custom ReactFlow edge with centered label |
| **CustomConnectionLine** | Visual feedback line when dragging connections |
| **CustomGrid** | Dot-grid background with configurable scale |
| **CloudSyncControls** | Sync status indicator, manual push/pull, conflict resolution |

---

## 4. Card Feature (`src/features/card/`)
| Component | Features |
|---|---|
| **NoteCard** | Draggable note card node with title, body, metadata |
| **NoteCardModern** | Alternative modern-styled card variant |
| **FusedNoteNode** | Merged/grouped note visualization |
| **NoteExpandedContent** | Inline expanded view of full note content |
| **NoteCoverSection** | Card cover image/color banner |
| **NoteMetadataSection** | Tags, dates, author, status badges |
| **NoteFooterStats** | Word count, character count, last edited |
| **CoverPicker** | Image/color cover selector |
| **IconPicker** | Emoji/icon selector for cards |
| **SkeletonLoader** | Loading skeleton placeholder for cards |

---

## 5. Editor Feature (`src/features/editor/`)
| Component | Features |
|---|---|
| **BlockEditor** | Rich-text block editor core (Slate/ProseMirror-like) |
| **BlockItem** | Individual editable block (text, heading, list, quote) |
| **BlockComponents** | Registry of all block type renderers |
| **SlashMenu** | `/` inline command menu for block type insertion |
| **BlockMenu** | Block drag handle + action menu (move, delete, duplicate) |
| **FloatingToolbar** | Contextual formatting toolbar (bold, italic, link, color) |
| **SelectionPopover** | Format popup on text selection |
| **SortableBlockWrapper** | Drag-and-drop block reordering |
| **ColorBlock** | Colored highlight block wrapper |
| **ColumnsBlock** | Multi-column layout block |
| **ContainerBlock** | Nested block container (grouping) |
| **LinkBlock** | Embedded link preview block |
| **PageBlock** | Sub-page embed block |
| **MediaPlaceholder** | Image/video/file upload placeholder |
| **ResizableMediaWrapper** | Resizable embedded media container |
| **VirtualBlockList** | Virtual scrolling for large block lists |

---

## 6. Kanban Feature (`src/features/kanban/`)
| Component | Features |
|---|---|
| **KanbanNode** | Root kanban board node |
| **KanbanColumn** | Column (status lane) with card list |
| **SortableCard** | Drag-sortable kanban card |
| **KanbanCardModal** | Full card detail modal (title, desc, assignee, dates) |
| **KanbanCardPreview** | Compact card preview |
| **KanbanToolbar** | Board toolbar (filter, sort, add column, config) |
| **KanbanConfigModal** | Column config, WIP limits, workflow settings |
| **KanbanSwimlane** | Horizontal swimlane grouping (by assignee/category) |
| **KanbanTableView** | Table/spreadsheet view of board |
| **KanbanCalendarView** | Calendar date view of cards |
| **KanbanTimelineView** | Gantt/timeline view of cards |
| **KanbanTimeline** | Timeline chart rendering |
| **TimelineBar** | Individual timeline bar item |
| **TimelineChart** | SVG timeline chart |
| **TimelineSidebar** | Timeline legend/filter sidebar |
| **SortableCalendarCard** | Calendar-draggable card |

---

## 7. Navigation Feature (`src/features/navigation/`)
| Component | Features |
|---|---|
| **Breadcrumbs** | Hierarchical breadcrumb trail, clickable path segments |

---

## 8. UI Feature (`src/features/ui/`)
| Component | Features |
|---|---|
| **DashboardLayout** | App shell layout (sidebar + main + panels) |
| **SidePanel** | Collapsible right-side info panel |
| **BottomMenu** | Bottom toolbar (canvas/board controls) |
| **EditBar** | Top edit mode toolbar |
| **CenterModal** | Centered dialog overlay |
| **FullscreenModal** | Full-screen overlay modal |
| **MetadataPanel** | Note metadata editor sidebar |
| **MetadataMenu** | Metadata field quick-edit dropdown |
| **TableOfContentsPanel** | Document outline / heading TOC |
| **NoteContentPanel** | Embedded note content viewer |
| **SearchResults** | Full-text search results list |
| **ThemeSwitcher** | Light/dark/custom theme toggle |
| **HistoryControls** | Undo/redo stack controls |
| **HomeButton** | Navigate back to landing/home |
| **KeyboardShortcutsPanel** | Keyboard shortcut cheat-sheet modal |
| **Tooltip** | Hover tooltip wrapper |
| **StorageControls** | Local/cloud storage selector, export/import |
| **PDFViewer** | Inline PDF document viewer |
| **EdgeEditingToolbar** | Toolbar for edge label/style editing |
| **MultiSelectionToolbar** | Bulk action bar for multi-selected nodes |
| **ChipInput** | Tag/chip multi-input component |
| **CustomDatePicker** | Date picker field |
| **CustomSelect** | Styled dropdown select |
| **ModifierKeyIndicator** | Visual indicator for held modifier keys |

---

## 9. Block Feature (`src/features/block/`)
| Component | Features |
|---|---|
| **BlockNode** | Generic block node wrapper (used in canvas + editor) |

---

## 10. Landing Feature (`src/features/landing/`)
| Component | Features |
|---|---|
| **LandingPage** | Marketing landing page, hero section, feature highlights, CTA |

---

## 11. Marketplace Feature (`src/features/marketplace/`)
| Component | Features |
|---|---|
| **MarketplacePage** | Template/plugin marketplace, browse, search, install |

---

## 12. Shared UI Components (`src/components/`)
| Component | Features |
|---|---|
| **ErrorBoundary** | React error boundary, fallback UI, error reporting |
| **BlurIn** | Scroll-triggered blur-in animation |
| **BorderBeam** | Animated gradient border wrapper |
| **NumberTicker** | Animated number counter |

---

## 13. Services (`src/services/`)
| Service | Features |
|---|---|
| **StorageManager** | Unified storage interface (local + cloud) |
| **FileSystemStorage** | Local file system read/write |
| **cloudSync** | Cloud sync engine, conflict resolution, versioning |
| **metadataService** | Note metadata CRUD, indexing |
| **tocService** | Table of contents generation from headings |
| **supabase/client** | Supabase DB, auth, real-time subscriptions |

---

## 14. State Store (`src/store/`)
| Slice | Features |
|---|---|
| **authSlice** | Auth state, user profile, session tokens |
| **navigationSlice** | View routing, breadcrumbs, history stack |
| **nodeSlice** | Node CRUD, selection, tree hierarchy |
| **storageSlice** | Storage backend status, sync queue |
| **uiSlice** | Panel toggles, theme, modal states |
| **contentSync** | Real-time content sync engine |

---

## 15. Config / Utils
| File | Features |
|---|---|
| **layout.ts** | Canvas grid layout constants, snap settings |
| **utils.ts** | Shared utility helpers |
| **colorUtils.ts** | Color manipulation, palette generation |
| **pasteUtils.ts** | Clipboard paste handling, markdown->blocks |
| **menuConstants.tsx** | Slash menu item definitions |
| **searchUtils.ts** | Search indexing, ranking, fuzzy match |
| **iconMap.ts** | Icon name -> React component mapping |
