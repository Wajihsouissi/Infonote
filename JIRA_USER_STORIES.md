# Chnk it - Jira User Stories & Epics Documentation

## Project Overview
**Chnk it** is a spatial, infinite-canvas note-taking application built with React 19, TypeScript, and Vite. It provides a visual, spatial approach to organizing information through interconnected note cards on an infinite 2D plane with rich editing capabilities, task management, and Kanban board views.

---

## EPIC 1: Canvas & Spatial Organization
**Objective:** Provide an infinite canvas environment for spatial organization of notes and content blocks.

### User Stories

#### 1.1 Infinite Canvas Navigation
**As a** user  
**I want to** pan and zoom infinitely on a 2D canvas  
**So that** I can organize my notes spatially without space constraints  

**Acceptance Criteria:**
- Canvas supports infinite panning in all directions
- Zoom controls available (zoom in, zoom out, fit to screen)
- Mini-map for navigation overview
- Smooth viewport transitions
- Grid background with 56px base unit and 16px gaps
- Snap-to-grid functionality (112px increments)

**Technical Notes:**
- Uses @xyflow/react (React Flow) for canvas engine
- Custom grid implementation in CustomGrid.tsx
- Viewport culling for performance optimization

---

#### 1.2 Node Creation & Positioning
**As a** user  
**I want to** create different types of nodes (notes, blocks, Kanban boards) at specific positions  
**So that** I can start organizing my content immediately  

**Acceptance Criteria:**
- Add Note nodes (icon, medium, expanded view modes)
- Add Block nodes (standalone content blocks)
- Add Fused Note nodes (hybrid note with embedded editor)
- Add Kanban Board nodes
- Non-overlapping placement algorithm
- Nodes snap to grid on placement
- Position determined by cursor location or smart placement

**Technical Notes:**
- BottomMenu provides node creation controls
- findNonOverlappingPosition algorithm prevents overlaps
- Grid snapping: 112px (2 grid units) increments

---

#### 1.3 Node Drag & Drop
**As a** user  
**I want to** drag nodes around the canvas  
**So that** I can rearrange my workspace organization  

**Acceptance Criteria:**
- Click and drag to reposition nodes
- Drag preview follows cursor
- Grid snapping on drag release
- Visual feedback during drag (ghost/shadow)
- Multi-node drag support (box selection)
- Drag state indicators

**Technical Notes:**
- React Flow built-in drag handling
- useCanvasNodeDrag hook manages drag state
- Grid snap enforced via position constraints

---

#### 1.4 Node Resizing with Grid Snap
**As a** user  
**I want to** resize notes by dragging corner handles  
**So that** I can control how much information is visible  

**Acceptance Criteria:**
- Resize handles on note corners (8px circular handles)
- Drag to resize with smooth transitions
- Dimensions snap to 112px increments on release
- Minimum size: 112x112px (icon view)
- Maximum size: 672x1120px (12x20 grid units)
- Auto view mode update based on size
- Auto-grow in expanded mode (never shrinks)
- Cursor changes to resize cursor (not hand)

**Technical Notes:**
- Custom resize implementation with activeResize ref
- ResizeObserver for auto-grow in expanded mode
- View mode thresholds: Icon (2x2), Medium (4x4), Expanded (8x8+)

---

#### 1.5 Node Connections & Relationships
**As a** user  
**I want to** create visual connections between notes  
**So that** I can show relationships between ideas  

**Acceptance Criteria:**
- Drag from connection handle to create edge
- Visual connection lines between nodes
- Connections respect parent-child hierarchy
- Delete connections via edge selection
- Connection visualization on canvas
- Edges filtered by current navigation context

**Technical Notes:**
- React Flow edge system
- onConnect handler manages new connections
- Edges track parentId in data

---

#### 1.6 Box Selection & Multi-Node Operations
**As a** user  
**I want to** select multiple nodes at once  
**So that** I can perform bulk operations  

**Acceptance Criteria:**
- Click and drag to create selection box
- All nodes within box are selected
- Visual selection indicators (highlighted borders)
- Multi-selection toolbar appears
- Bulk operations: delete, duplicate, apply color
- Keyboard shortcuts for selection (Shift+Click)
- Clear selection on canvas click

**Technical Notes:**
- useCanvasBoxSelection hook
- MultiSelectionToolbar component
- selectedCanvasNodeIds Set in UI slice

---

## EPIC 2: Note Card System
**Objective:** Provide flexible note cards with progressive disclosure and rich metadata management.

### User Stories

#### 2.1 Progressive View Modes
**As a** user  
**I want to** see different levels of detail based on card size  
**So that** I can choose the right balance between overview and detail  

**Acceptance Criteria:**
- **Icon View (112x112px):** Shows only icon and label
- **Medium View (224x224px):** Shows icon, label, description, metadata chips
- **Expanded View (448x448px+):** Full content with block editor, metadata section
- **Chromeless View:** Fullscreen/modal distraction-free editing
- Automatic view mode transitions on resize
- Smooth animations between view modes

**Technical Notes:**
- getStrictSize determines view mode from dimensions
- NoteCard component handles all view modes
- FusedNoteNode for hybrid note+editor

---

#### 2.2 Note Metadata Management
**As a** user  
**I want to** add and edit metadata for my notes  
**So that** I can organize and categorize my content effectively  

**Acceptance Criteria:**
- Edit note title/label
- Add/edit description
- Select icon from icon picker (Lucide icons)
- Upload/set cover image
- Add/remove tags (chip input)
- Set category
- Color customization
- External URL reference
- Layout column selection (1-4 columns)

**Technical Notes:**
- MetadataMenu component for editing
- IconPicker with Lucide icon library
- ChipInput for tag management
- NoteData type definition

---

#### 2.3 Task Management Properties
**As a** user  
**I want to** manage task-related properties on notes  
**So that** I can use Chnk it for project management  

**Acceptance Criteria:**
- Set status: todo, in-progress, review, done
- Set priority: low, medium, high, urgent
- Set due date with date picker
- Set start date
- Assign to team member (assignee field)
- Track progress (0-100%)
- Add subtasks/checklist items
- Visual indicators for status and priority
- Overdue date highlighting

**Technical Notes:**
- Property components in card/properties/
- StatusProperty, PriorityProperty, DateProperty
- SubtaskProperty with checklist UI
- ProgressProperty with progress bar

---

#### 2.4 Note Navigation & Drill-Down
**As a** user  
**I want to** navigate into notes to create hierarchical workspaces  
**So that** I can organize content in nested structures  

**Acceptance Criteria:**
- Double-click expanded note to drill down
- Canvas shows only child notes of current context
- Breadcrumb navigation shows hierarchy path
- Click breadcrumb to navigate up
- "Home" as root level
- Smooth transitions between levels
- Maintain context during navigation

**Technical Notes:**
- navigationSlice manages currentParentId
- Breadcrumbs component
- Canvas filters nodes by parentId
- reconstructBreadcrumbs for path restoration

---

#### 2.5 Note Display Options
**As a** user  
**I want to** view notes in different display modes  
**So that** I can focus on content in the way that works best  

**Acceptance Criteria:**
- Open note in fullscreen modal
- Open note in side panel (left or right)
- Open note in center modal
- Toggle metadata visibility
- Chromeless mode for distraction-free editing
- Only one modal type active at a time
- Easy close/exit from any modal

**Technical Notes:**
- FullscreenModal, SidePanel, CenterModal components
- UI slice manages modal states
- Mutually exclusive modal system

---

## EPIC 3: Block-Based Editor
**Objective:** Provide a rich, block-based content editing experience within notes.

### User Stories

#### 3.1 Block Content Creation
**As a** user  
**I want to** create different types of content blocks  
**So that** I can build rich, structured documents  

**Acceptance Criteria:**
- Text blocks (paragraphs)
- Heading blocks (H1, H2, H3)
- Bullet list blocks
- Numbered list blocks
- Todo/checkbox list blocks
- Toggle blocks
- Quote blocks
- Callout blocks
- Divider blocks
- Table blocks
- Image blocks
- Video blocks
- File attachment blocks
- Page blocks
- Container blocks
- Multi-column layout blocks
- Color blocks

**Technical Notes:**
- BlockEditor.tsx main editor component
- BlockComponents.tsx renderers
- Block type definitions in types.ts

---

#### 3.2 Slash Command Menu
**As a** user  
**I want to** use slash commands to quickly insert blocks  
**So that** I can format content efficiently without leaving the keyboard  

**Acceptance Criteria:**
- Type "/" to open slash menu
- Filterable block type list
- Keyboard navigation (arrow keys, enter)
- Icon and description for each block type
- Menu closes on selection or escape
- Context-aware suggestions
- Quick insert on selection

**Technical Notes:**
- SlashMenu component
- useSlashCommand hook
- menuConstants.tsx for menu items

---

#### 3.3 Block Drag & Drop Reordering
**As a** user  
**I want to** reorder blocks by dragging  
**So that** I can organize my content structure  

**Acceptance Criteria:**
- Drag handle on each block
- Visual drag indicator during drag
- Drop target highlighting
- Smooth reordering animation
- Keyboard-based reordering support
- Drag between containers/columns

**Technical Notes:**
- @dnd-kit for drag and drop
- SortableBlockWrapper component
- useBlockDragAndDrop hook

---

#### 3.4 Block Editing & Formatting
**As a** user  
**I want to** edit and format block content  
**So that** I can create well-formatted documents  

**Acceptance Criteria:**
- Inline text editing in blocks
- Keyboard navigation between blocks (Enter, Backspace, Arrows)
- Auto-focus management
- Multi-block selection (drag selection)
- Block menu access (hover options)
- Floating toolbar for text selection
- Copy/cut/paste support
- Block duplication
- Block deletion

**Technical Notes:**
- BlockItem component
- BlockMenu for block operations
- SelectionCapsule for multi-selection
- FloatingToolbar for text formatting

---

#### 3.5 Media Handling
**As a** user  
**I want to** add and manage media content in blocks  
**So that** I can enrich my notes with visual content  

**Acceptance Criteria:**
- Image upload via drag-and-drop
- Image upload via file picker
- Image URL input
- PDF viewing and rendering
- Video embedding
- File attachments
- Media placeholder UI
- Resizable media wrappers
- Media preview thumbnails

**Technical Notes:**
- MediaPlaceholder component
- ResizableMediaWrapper
- PDFViewer with pdfjs-dist
- react-pdf integration

---

#### 3.6 Block Keyboard Shortcuts
**As a** user  
**I want to** use keyboard shortcuts for common editing actions  
**So that** I can work more efficiently  

**Acceptance Criteria:**
- Enter: Create new block below
- Backspace on empty block: Delete block
- Arrow keys: Navigate between blocks
- Tab: Indent/nest blocks
- Shift+Tab: Unindent blocks
- Escape: Close menus
- Ctrl/Cmd+K: Open command palette (future)
- Slash command: Type "/"

**Technical Notes:**
- useBlockCommands hook
- Keyboard event handlers
- Focus management system

---

## EPIC 4: Kanban Board System
**Objective:** Provide comprehensive Kanban board views for project and task management.

### User Stories

#### 4.1 Kanban Board Creation
**As a** user  
**I want to** create Kanban boards from notes  
**So that** I can manage projects visually  

**Acceptance Criteria:**
- Create Kanban board node from bottom menu
- Configure board name
- Define custom columns (status values)
- Set column colors
- Configure swimlane field (assignee, category, priority)
- Set default sort options
- Board appears as node on canvas

**Technical Notes:**
- KanbanNode component
- KanbanConfigModal for setup
- KanbanColumn type definition

---

#### 4.2 Kanban Board View
**As a** user  
**I want to** view my tasks organized in Kanban columns  
**So that** I can track project progress  

**Acceptance Criteria:**
- Cards displayed in columns by status
- Column headers with task count
- Drag cards between columns to change status
- Collapse/expand columns
- Card preview shows title, metadata, status
- Visual column colors
- Empty column state
- Scrollable columns

**Technical Notes:**
- KanbanColumn component
- SortableCard component
- @dnd-kit for card dragging

---

#### 4.3 Kanban Table View
**As a** user  
**I want to** view my tasks in a spreadsheet-like table  
**So that** I can see detailed information at a glance  

**Acceptance Criteria:**
- Toggle to table view mode
- Configurable visible columns (metadata fields)
- Sortable columns
- Inline editing of properties
- Row selection
- Bulk operations
- Filter support
- Responsive column widths

**Technical Notes:**
- KanbanTableView component
- Configurable tableColumns in KanbanNodeData
- Property editors inline

---

#### 4.4 Kanban Calendar View
**As a** user  
**I want to** view my tasks on a calendar  
**So that** I can see deadlines and schedule  

**Acceptance Criteria:**
- Toggle to calendar view mode
- Monthly/weekly views
- Cards displayed on due dates
- Drag to change dates
- Multi-day task display
- Today indicator
- Navigate between months/weeks
- Date overflow indicators

**Technical Notes:**
- KanbanCalendarView component
- SortableCalendarCard component
- Date-based positioning logic

---

#### 4.5 Kanban Timeline View
**As a** user  
**I want to** view my tasks on a Gantt-style timeline  
**So that** I can visualize project schedules and dependencies  

**Acceptance Criteria:**
- Toggle to timeline view mode
- Horizontal timeline with date scale
- Task bars showing start and due dates
- Progress indicators on bars
- Zoom timeline (day/week/month)
- Swimlane grouping
- Task dependencies (future)
- Sidebar with task list

**Technical Notes:**
- KanbanTimelineView component
- TimelineChart component
- TimelineBar component
- TimelineSidebar component

---

#### 4.6 Kanban Filtering & Sorting
**As a** user  
**I want to** filter and sort tasks in my Kanban board  
**So that** I can focus on relevant tasks  

**Acceptance Criteria:**
- Search by title/content
- Filter by priority (multi-select)
- Filter by assignee
- Filter by tags
- Sort by due date, priority, created date, label
- Ascending/descending sort direction
- Persistent filter settings
- Clear all filters option

**Technical Notes:**
- KanbanToolbar component
- Filter state management in KanbanNode
- Client-side filtering logic

---

#### 4.7 Kanban Swimlanes
**As a** user  
**I want to** organize tasks into swimlanes  
**So that** I can group tasks by assignee, category, or priority  

**Acceptance Criteria:**
- Enable swimlane grouping
- Choose swimlane field (assignee, category, priority)
- Horizontal lanes across all columns
- Lane headers with field values
- Cards grouped by lane
- Empty lanes hidden
- Collapse/expand lanes

**Technical Notes:**
- KanbanSwimlane component
- swimlaneField in KanbanNodeData
- Dynamic lane generation from card data

---

## EPIC 5: Search & Discovery
**Objective:** Enable users to quickly find and filter their notes and content.

### User Stories

#### 5.1 Full-Text Search
**As a** user  
**I want to** search across all my notes  
**So that** I can quickly find relevant content  

**Acceptance Criteria:**
- Search input in bottom menu
- Real-time search results
- Search across titles, descriptions, content
- Debounced search (250ms)
- Web Worker for performance
- Highlight matched text
- Keyboard navigation (arrows, enter, escape)
- Result count display

**Technical Notes:**
- SearchResults component
- search.worker.ts for background processing
- searchUtils.ts for query parsing
- Debounced search execution

---

#### 5.2 Advanced Search Filters
**As a** user  
**I want to** use advanced search filters  
**So that** I can narrow down search results  

**Acceptance Criteria:**
- Filter by tags (#tag syntax)
- Filter by status (status:todo)
- Filter by priority (priority:high)
- Filter by type (is:text, is:image, is:task)
- Filter by date range (date:, after:, before:)
- Multiple filters combined
- Visual filter chips
- Toggle filter panel

**Technical Notes:**
- parseSearchQuery function
- Filter state management
- Active filters display in BottomMenu

---

#### 5.3 Quick Navigation
**As a** user  
**I want to** navigate to search results quickly  
**So that** I can access notes without manual browsing  

**Acceptance Criteria:**
- Click search result to navigate
- Navigate to result's parent context
- Clear modals/panels on navigation
- Keyboard selection (Enter)
- Recent searches (future)
- Search history (future)

**Technical Notes:**
- handleSelect in SearchResults
- navigateToNode action
- Modal state clearing

---

## EPIC 6: Storage & Data Management
**Objective:** Provide reliable local storage with data persistence and backup capabilities.

### User Stories

#### 6.1 Local File System Storage
**As a** user  
**I want to** save my data to a local folder  
**So that** I have control over my data  

**Acceptance Criteria:**
- Select local directory via File System API
- Auto-save on changes
- Reconnect on app restart
- Save status indicator
- Directory name display
- Permission management
- Graceful error handling

**Technical Notes:**
- FileSystemStorage class
- File System Access API
- IndexedDB for handle persistence
- showDirectoryPicker API

---

#### 6.2 Auto-Save with Debouncing
**As a** user  
**I want** my changes to be saved automatically  
**So that** I don't lose my work  

**Acceptance Criteria:**
- Immediate save for structural changes (add/delete nodes)
- Debounced save (500ms) for content changes
- Save indicator showing "Saving..."
- Last saved timestamp
- Save queue for concurrent operations
- Failed save retry logic

**Technical Notes:**
- StorageManager subscription logic
- Node count change detection
- Debounce timeout management
- Save queue implementation

---

#### 6.3 Data Compression
**As a** user  
**I want** my data to be compressed before saving  
**So that** save/load operations are faster  

**Acceptance Criteria:**
- LZString compression for large datasets
- Automatic compression threshold (>10KB)
- Transparent decompression on load
- Compression performance monitoring
- Fallback to plain JSON for small data

**Technical Notes:**
- LZString library
- writeJsonFile with compression logic
- readJsonFile with decompression
- USE_COMPRESSION flag

---

#### 6.4 Backup & Recovery
**As a** user  
**I want** automatic backups of my data  
**So that** I can recover from data corruption  

**Acceptance Criteria:**
- Backup created before each save
- Backup files (nodes.backup.json, edges.backup.json)
- Atomic save with temp files
- Verification before replacing files
- Automatic restore from backup on failure
- Backup integrity checks

**Technical Notes:**
- createBackup method
- atomicReplace implementation
- restoreFromBackup on error
- Temp file verification

---

#### 6.5 Storage Status Monitoring
**As a** user  
**I want to** see the current storage status  
**So that** I know if my data is being saved  

**Acceptance Criteria:**
- Connection status indicator (connected/disconnected)
- Directory name display
- Save in progress indicator
- Last saved time display
- Reconnect button
- Error notifications
- Storage controls UI

**Technical Notes:**
- StorageControls component
- storageSlice state
- onStatusChange callbacks
- Error handling UI

---

## EPIC 7: Undo/Redo & Version History
**Objective:** Provide comprehensive undo/redo capabilities and version history tracking.

### User Stories

#### 7.1 Undo/Redo System
**As a** user  
**I want to** undo and redo my changes  
**So that** I can correct mistakes easily  

**Acceptance Criteria:**
- Undo last action (Ctrl/Cmd+Z)
- Redo undone action (Ctrl/Cmd+Shift+Z)
- Undo/redo for node changes (add, delete, move, resize)
- Undo/redo for edge changes
- Undo/redo for content edits
- History limit (50 states)
- Visual undo/redo controls
- History state indicators

**Technical Notes:**
- Zundo temporal middleware
- Partialize function (nodes, edges only)
- 50 state limit
- HistoryControls component

---

## EPIC 8: UI/UX & Theming
**Objective:** Provide a premium, customizable user interface with smooth interactions.

### User Stories

#### 8.1 Dark/Light Theme
**As a** user  
**I want to** switch between dark and light themes  
**So that** I can work comfortably in different lighting conditions  

**Acceptance Criteria:**
- Theme toggle in UI
- Dark theme (default): Deep void background, soft surfaces
- Light theme (future enhancement)
- Smooth theme transitions
- Persistent theme preference
- Glassmorphism effects
- Vibrant accent colors (violet, cyan)

**Technical Notes:**
- ThemeSwitcher component
- CSS variables for theming
- Dark theme color palette
- toggleTheme action

---

#### 8.2 Glassmorphic UI Elements
**As a** user  
**I want** a premium glassmorphic design  
**So that** the interface feels modern and polished  

**Acceptance Criteria:**
- Glass-effect panels and modals
- Backdrop blur (16px)
- Semi-transparent backgrounds
- Subtle border highlights
- Depth and layering
- Consistent glass styling across components

**Technical Notes:**
- CSS glassmorphism variables
- backdrop-filter: blur(16px)
- rgba backgrounds
- Border gradients

---

#### 8.3 Smooth Animations & Transitions
**As a** user  
**I want** smooth, lightweight animations  
**So that** interactions feel responsive and polished  

**Acceptance Criteria:**
- Fast transitions (0.2s) for UI elements
- Smooth transitions (0.4s) for major state changes
- Resize animations (lightweight, not heavy)
- Drag and drop animations
- Modal open/close animations
- Canvas zoom/pan smoothness
- No janky or heavy animations
- Cursor changes match interactions (resize vs drag)

**Technical Notes:**
- CSS transition variables
- cubic-bezier easing functions
- Framer Motion for complex animations
- Performance-optimized transitions

---

#### 8.4 Responsive Layout & Controls
**As a** user  
**I want** intuitive controls and layout  
**So that** I can work efficiently  

**Acceptance Criteria:**
- Bottom menu with primary actions
- Context-sensitive toolbars
- Floating toolbars for text selection
- Multi-selection toolbar
- Metadata editing panel
- Icon picker modal
- Date picker component
- Custom select dropdowns
- Chip input for tags

**Technical Notes:**
- BottomMenu component
- FloatingToolbar
- MultiSelectionToolbar
- CustomDatePicker, CustomSelect
- ChipInput component

---

## EPIC 9: Performance & Optimization
**Objective:** Ensure smooth performance even with large numbers of nodes and complex content.

### User Stories

#### 9.1 Viewport Culling
**As a** user  
**I want** only visible nodes to be rendered  
**So that** the canvas performs well with many nodes  

**Acceptance Criteria:**
- Calculate visible viewport area
- Render only nodes in viewport
- Update on viewport change
- Buffer zone around viewport
- Performance monitoring
- Node count display (debug)

**Technical Notes:**
- useCanvasViewport hook
- Viewport change handler
- Visible nodes filtering
- Performance optimization

---

#### 9.2 Virtual Block List
**As a** user  
**I want** long documents to load quickly  
**So that** I can work with large notes without lag  

**Acceptance Criteria:**
- Virtual scrolling for block lists
- Render only visible blocks
- Smooth scrolling performance
- Dynamic block height calculation
- Memory optimization

**Technical Notes:**
- VirtualBlockList component
- react-window integration
- Windowing technique

---

#### 9.3 Performance Monitoring
**As a** developer  
**I want to** monitor performance metrics  
**So that** I can identify and fix performance issues  

**Acceptance Criteria:**
- Performance timing utilities
- Storage operation timing
- Render performance tracking
- Debug logging in development
- Performance warnings
- Metrics display (optional)

**Technical Notes:**
- perfMonitor utility
- Performance timing API
- DEBUG flag for development logging

---

## EPIC 10: Error Handling & Reliability
**Objective:** Provide robust error handling and graceful degradation.

### User Stories

#### 10.1 Error Boundary
**As a** user  
**I want** the app to handle errors gracefully  
**So that** I don't lose my work when something goes wrong  

**Acceptance Criteria:**
- Global error boundary
- Catch React rendering errors
- Display user-friendly error message
- Option to reload app
- Error logging
- State preservation where possible

**Technical Notes:**
- ErrorBoundary component
- componentDidCatch implementation
- Fallback UI
- Error reporting

---

#### 10.2 Storage Error Recovery
**As a** user  
**I want** automatic recovery from storage errors  
**So that** my data is protected  

**Acceptance Criteria:**
- Detect storage disconnection
- Attempt auto-reconnect
- Backup restoration on save failure
- User notification of errors
- Manual reconnect option
- Data validation on load
- Graceful degradation

**Technical Notes:**
- StorageManager error handling
- Auto-reconnect on startup
- Backup restore logic
- Permission re-request

---

## EPIC 11: Multi-Selection & Bulk Operations
**Objective:** Enable efficient management of multiple nodes simultaneously.

### User Stories

#### 11.1 Bulk Node Operations
**As a** user  
**I want to** perform operations on multiple nodes at once  
**So that** I can work more efficiently  

**Acceptance Criteria:**
- Select multiple nodes (box selection, Shift+Click)
- Bulk delete selected nodes
- Bulk duplicate selected nodes
- Bulk apply color to selected nodes
- Visual selection state
- Selection count display
- Clear selection option

**Technical Notes:**
- bulkDeleteNodes action
- bulkDuplicateNodes action
- bulkApplyColor action
- MultiSelectionToolbar

---

## EPIC 12: Advanced Features (Future Enhancements)
**Objective:** Document planned future enhancements for roadmap planning.

### User Stories

#### 12.1 Collaboration Features
**As a** user  
**I want to** collaborate with others in real-time  
**So that** we can work together on notes  

**Acceptance Criteria:**
- Real-time multi-user editing (CRDT/OT)
- User presence indicators
- Comments and mentions
- Activity history
- Change tracking
- User avatars
- Conflict resolution

**Priority:** Future  
**Status:** Not Implemented

---

#### 12.2 Templates System
**As a** user  
**I want to** use pre-built templates for common note types  
**So that** I can create structured notes quickly  

**Acceptance Criteria:**
- Template library
- Pre-built templates (meeting notes, project plans, etc.)
- Custom template creation
- Template preview
- One-click template application
- Template categories

**Priority:** Future  
**Status:** Not Implemented

---

#### 12.3 Export & Import
**As a** user  
**I want to** export and import my notes  
**So that** I can backup or share my data  

**Acceptance Criteria:**
- Export to Markdown
- Export to PDF
- Export individual notes
- Export entire workspace
- Import from Markdown
- Import from other note apps
- Backup file download
- Data migration tools

**Priority:** Future  
**Status:** Not Implemented

---

#### 12.4 Advanced Linking
**As a** user  
**I want to** see bidirectional links between notes  
**So that** I can discover connections in my knowledge base  

**Acceptance Criteria:**
- Backlinks display
- Graph view visualization
- Link suggestions
- Wiki-style [[link]] syntax
- Orphaned notes detection
- Link graph statistics

**Priority:** Future  
**Status:** Not Implemented

---

#### 12.5 Mobile Support
**As a** user  
**I want to** use Chnk it on my mobile device  
**So that** I can access my notes on the go  

**Acceptance Criteria:**
- Responsive design
- Touch gesture support
- Mobile-optimized UI
- Swipe navigation
- Pinch to zoom
- Mobile-friendly modals
- Offline support (PWA)

**Priority:** Future  
**Status:** Not Implemented

---

#### 12.6 AI Features
**As a** user  
**I want** AI assistance for my notes  
**So that** I can work more intelligently  

**Acceptance Criteria:**
- Auto-tagging suggestions
- Content summarization
- Smart search with semantic understanding
- Writing assistance
- Note organization suggestions
- Duplicate detection
- Action item extraction

**Priority:** Future  
**Status:** Not Implemented

---

## EPIC 13: Navigation & Breadcrumbs
**Objective:** Provide clear navigation and context awareness in hierarchical structures.

### User Stories

#### 13.1 Breadcrumb Navigation
**As a** user  
**I want to** see my current location in the hierarchy  
**So that** I know where I am and can navigate back  

**Acceptance Criteria:**
- Breadcrumb bar at top of canvas
- Shows full path from Home to current note
- Click any breadcrumb to navigate to that level
- "Home" as root
- Current level highlighted
- Smooth transitions on navigation
- Breadcrumb reconstruction on refresh

**Technical Notes:**
- Breadcrumbs component
- navigationSlice
- Breadcrumb array management
- reconstructBreadcrumbs function

---

## Summary Statistics

**Total Epics:** 13  
**Total User Stories:** 60+  
**Implemented Stories:** ~50  
**Future Stories:** ~10  

### Epic Breakdown:
1. **Canvas & Spatial Organization** - 6 stories
2. **Note Card System** - 5 stories
3. **Block-Based Editor** - 6 stories
4. **Kanban Board System** - 7 stories
5. **Search & Discovery** - 3 stories
6. **Storage & Data Management** - 5 stories
7. **Undo/Redo & Version History** - 1 story
8. **UI/UX & Theming** - 4 stories
9. **Performance & Optimization** - 3 stories
10. **Error Handling & Reliability** - 2 stories
11. **Multi-Selection & Bulk Operations** - 1 story
12. **Advanced Features (Future)** - 6 stories
13. **Navigation & Breadcrumbs** - 1 story

---

## Jira Import Instructions

### CSV Format for Jira Import:
```csv
Summary,Description,Issue Type,Priority,Status,Labels,Epic Link
"Infinite Canvas Navigation","As a user, I want to pan and zoom infinitely on a 2D canvas so that I can organize my notes spatially without space constraints",Story,High,Done,"canvas,core","Canvas & Spatial Organization"
```

### Recommended Jira Configuration:
- **Project Type:** Software Development (Scrum or Kanban)
- **Issue Types:** Epic, Story, Task, Bug
- **Custom Fields:** 
  - Technical Notes (text field)
  - Acceptance Criteria (text field)
  - Component (multi-select)
- **Labels:** canvas, notes, editor, kanban, search, storage, ui, performance, future
- **Sprints:** 2-week sprints recommended
- **Components:** Canvas, Note Cards, Block Editor, Kanban, Search, Storage, UI, Performance

---

## Component Mapping

| Feature Area | Main Components | Key Files |
|-------------|----------------|-----------|
| Canvas | CanvasBoard, CustomGrid | `src/features/canvas/` |
| Note Cards | NoteCard, FusedNoteNode | `src/features/card/` |
| Block Editor | BlockEditor, BlockItem, SlashMenu | `src/features/editor/` |
| Kanban | KanbanNode, KanbanColumn, KanbanTableView | `src/features/kanban/` |
| Search | SearchResults, searchUtils | `src/features/ui/` |
| Storage | StorageManager, FileSystemStorage | `src/services/` |
| Navigation | Breadcrumbs | `src/features/navigation/` |
| State Management | Zustand Store, Slices | `src/store/` |

---

## Technical Architecture Notes

### State Management:
- **Zustand** for global state
- **Zundo** for undo/redo (temporal middleware)
- **4 slices:** nodeSlice, navigationSlice, storageSlice, uiSlice
- **Subscribe with selector** for performance

### Key Dependencies:
- **@xyflow/react** - Canvas engine (React Flow)
- **@dnd-kit** - Drag and drop
- **zustand** - State management
- **zundo** - Undo/redo
- **lz-string** - Data compression
- **lucide-react** - Icons
- **pdfjs-dist** - PDF rendering
- **react-window** - Virtualization
- **motion** - Animations

### Data Flow:
1. User interaction → Component action
2. Action → Store update (Zustand)
3. Store → Auto-save trigger (StorageManager)
4. StorageManager → File System API
5. IndexedDB → Handle persistence

---

*Document Generated: April 8, 2026*  
*Project: Chnk it v0.0.0*  
*Total Lines of Code: ~15,000+ (estimated)*  
*Total Components: 80+*  
*Total Features: 13 Epics*
