# Chnk it - Information Architecture

## 📋 Project Overview

**Chnk it** is an infinite canvas note-taking application built with React, TypeScript, and Vite. It provides a visual, spatial approach to organizing information through interconnected note cards on an infinite canvas.

### Tech Stack
- **Framework**: React 19.2.0 + TypeScript
- **Build Tool**: Vite 5.4.11
- **Canvas Engine**: @xyflow/react 12.10.0 (React Flow)
- **State Management**: Zustand 5.0.9
- **Drag & Drop**: @dnd-kit (core, sortable, utilities)
- **Icons**: Lucide React 0.562.0
- **Document Processing**: pdfjs-dist 5.4.530
- **Styling**: CSS Modules (Premium dark theme with glassmorphism)

---

## 🏗️ Architecture Overview

### Application Structure

```
Chnk it/
├── src/
│   ├── App.tsx                    # Root component with ReactFlowProvider
│   ├── main.tsx                   # Application entry point
│   ├── types.ts                   # Global type definitions
│   │
│   ├── store/
│   │   └── useStore.ts           # Zustand state management
│   │
│   ├── features/                 # Feature-based modules
│   │   ├── canvas/              # Infinite canvas implementation
│   │   ├── card/                # Note card components
│   │   ├── editor/              # Block-based editor
│   │   ├── block/               # Block node components
│   │   ├── navigation/          # Navigation components
│   │   └── ui/                  # Shared UI components
│   │
│   ├── styles/
│   │   └── index.css            # Global styles & design tokens
│   │
│   ├── hooks/                   # Custom React hooks
│   ├── utils/                   # Utility functions
│   └── assets/                  # Static assets
│
├── public/                      # Public assets
└── dist/                        # Build output
```

---

## 🎯 Core Concepts

### 1. **Node Types**

The application uses three primary node types:

#### **NoteNode** (`type: 'note'`)
- Primary content container
- Supports multiple view modes: `icon`, `medium`, `expanded`, `chromeless`
- Contains rich metadata (tags, status, priority, dates, etc.)
- Can be navigated into (acts as a container for child nodes)

#### **BlockNode** (`type: 'block'`)
- Standalone block content on canvas
- Contains array of blocks (text, headings, images, etc.)

#### **FusedNoteNode** (`type: 'fused-note'`)
- Hybrid note with embedded block editor
- Combines note metadata with block-based content

---

## 📊 Data Model

### NoteData Type
```typescript
{
  // Core Properties
  label: string                    // Note title
  type?: 'text' | 'image' | 'task' // Content type
  content?: string | Block[]       // Note content
  viewMode?: ViewMode              // Display mode
  
  // Visual Properties
  icon?: string                    // Lucide icon name
  coverImage?: string              // Cover image URL
  color?: string                   // Custom color
  
  // Metadata
  description?: string             // Note description
  category?: string                // Category/folder
  tags?: string[]                  // Tags array
  
  // Task Management
  status?: 'todo' | 'in-progress' | 'review' | 'done'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string                 // ISO date string
  assignee?: string                // Assigned user
  
  // Timestamps
  date?: string                    // Manual date
  createdAt?: string               // Auto-generated
  updatedAt?: string               // Auto-updated
  
  // Layout
  layout?: {
    columns?: 1 | 2 | 3 | 4       // Column layout
  }
  
  // External
  url?: string                     // External URL reference
}
```

### Block Type
```typescript
{
  id: string                       // Unique identifier
  type: BlockType                  // Block type (see below)
  content: string                  // Block content
  metadata?: Record<string, any>   // Additional metadata
}
```

### Supported Block Types
- **Text**: `text`, `heading1`, `heading2`, `heading3`
- **Lists**: `bullet`, `numbered`, `todo`, `toggle`
- **Rich Content**: `callout`, `quote`, `table`, `divider`
- **Media**: `image`, `video`, `file`
- **Structural**: `page`, `container`, `columns`

---

## 🎨 View Modes & Sizing

### Grid System
- **Base Unit**: 56px
- **Grid Gap**: 16px
- **Snap Step**: 112px (2 grid units)

### View Mode Dimensions

| View Mode | Size (units) | Dimensions (px) | Use Case |
|-----------|--------------|-----------------|----------|
| **Icon** | 2×2 | 112×112 | Compact representation |
| **Medium** | 4×4 | 224×224 | Preview with metadata |
| **Expanded** | 8×8+ | 448×448+ | Full content editing |
| **Chromeless** | Variable | Custom | Fullscreen/modal view |

### Size Constraints
- **Minimum Expanded**: 448px × 448px (8×8 grid units)
- **Maximum Width**: 672px (12 grid units)
- **Maximum Height**: 1120px (20 grid units)
- **Resize Increment**: 112px (2 grid units)

---

## 🧩 Feature Modules

### 1. Canvas (`features/canvas/`)

**Components:**
- `CanvasBoard.tsx` - Main infinite canvas container
- `CustomGrid.tsx` - Custom grid background

**Responsibilities:**
- Manages React Flow instance
- Handles node/edge changes
- Coordinates modal states (fullscreen, side panel, center modal)
- Provides drag-and-drop functionality
- Manages viewport and zoom

**Key Features:**
- Infinite panning and zooming
- Custom grid background
- Mini-map navigation
- Zoom controls
- Node/edge connections

---

### 2. Card (`features/card/`)

**Components:**
- `NoteCard.tsx` - Main note card component
- `NoteExpandedContent.tsx` - Expanded view content
- `FusedNoteNode.tsx` - Fused note with block editor
- `IconPicker.tsx` - Icon selection interface
- `iconMap.ts` - Lucide icon mappings

**Responsibilities:**
- Render notes in different view modes
- Handle card resizing with grid snapping
- Manage metadata display
- Provide interaction handlers (double-click, menu actions)
- Auto-grow content in expanded mode

**View Mode Behaviors:**
- **Icon**: Shows only icon and label
- **Medium**: Shows icon, label, description, and metadata chips
- **Expanded**: Full content with block editor, metadata section, and scrollable content

**Interaction Patterns:**
- Double-click: Navigate into card (if has children)
- Menu actions: Center peek, side peek, fullscreen
- Resize handles: Custom 8px circular handles
- Drag handles: For repositioning

---

### 3. Editor (`features/editor/`)

**Components:**
- `BlockEditor.tsx` - Main block editor component
- `BlockComponents.tsx` - Individual block renderers
- `SortableBlockWrapper.tsx` - Drag-and-drop wrapper
- `SlashMenu.tsx` - Command menu for block insertion
- `SelectionPopover.tsx` - Text selection toolbar
- `MediaPlaceholder.tsx` - Media upload interface
- `ContainerBlock.tsx` - Container block component
- `ColumnsBlock.tsx` - Multi-column layout

**Block Types Implemented:**
- Text blocks (paragraph, headings)
- List blocks (bullet, numbered, todo)
- Rich blocks (quote, callout, divider)
- Media blocks (image, video, file)
- Structural blocks (page, container, columns)

**Key Features:**
- Slash commands (`/`) for quick block insertion
- Drag-and-drop reordering
- Keyboard navigation (Enter, Backspace, Arrow keys)
- File drag-and-drop support
- Auto-focus management
- Minimal mode for compact editing

---

### 4. Navigation (`features/navigation/`)

**Components:**
- `Breadcrumbs.tsx` - Hierarchical navigation

**Responsibilities:**
- Display current navigation path
- Allow navigation up the hierarchy
- Show "Home" as root level
- Glassmorphic styling

---

### 5. UI (`features/ui/`)

**Components:**
- `BottomMenu.tsx` - Bottom toolbar with actions
- `MetadataMenu.tsx` - Metadata editing interface
- `ChipInput.tsx` - Tag/chip input component
- `FullscreenModal.tsx` - Fullscreen modal overlay
- `CenterModal.tsx` - Center modal overlay
- `SidePanel.tsx` - Side panel overlay
- `NoteContentPanel.tsx` - Note content display

**Bottom Menu Actions:**
- Add Note (icon/medium/expanded)
- Add Block
- Metadata editing
- View mode toggles

**Metadata Menu Features:**
- Icon selection
- Cover image upload
- Title/description editing
- Tags management
- Status/priority selection
- Due date picker
- Category assignment

---

## 🔄 State Management (Zustand)

### Global State Structure

```typescript
{
  // Node & Edge State
  nodes: AppNode[]                 // All nodes in the canvas
  edges: Edge[]                    // All connections
  
  // Navigation State
  currentParentId: string | null   // Current navigation context
  breadcrumbs: Breadcrumb[]        // Navigation history
  
  // Modal State
  fullscreenId: string | null      // Fullscreen modal node ID
  sidePanelId: string | null       // Side panel node ID
  centerPanelId: string | null     // Center modal node ID
  activeIconMenuId: string | null  // Active icon picker
  
  // Actions
  onNodesChange()                  // Handle node changes
  onEdgesChange()                  // Handle edge changes
  onConnect()                      // Handle new connections
  addNode()                        // Add new node
  navigateToNode()                 // Navigate to node
  updateNodeData()                 // Update node data
  setFullscreenId()                // Set fullscreen modal
  setSidePanelId()                 // Set side panel
  setCenterPanelId()               // Set center modal
  setActiveIconMenuId()            // Set active icon picker
}
```

### Navigation System

**Breadcrumb Navigation:**
- Root level: `{ id: null, label: 'Home' }`
- Child levels: `{ id: nodeId, label: nodeLabel }`
- Clicking breadcrumb navigates to that level
- Entering a node adds to breadcrumb trail

**Parent-Child Relationships:**
- Nodes have `parentId` property
- `currentParentId` determines visible nodes
- Only nodes with matching `parentId` are shown
- Edges also track `parentId` in their data

---

## 🎨 Design System

### Color Palette (Dark Theme)

```css
--color-bg-base: #0f1115        /* Deep void background */
--color-bg-surface: #1c1e26     /* Soft surface */
--color-bg-card: #252836        /* Card background */

--color-primary: #8b5cf6        /* Violet */
--color-primary-glow: rgba(139, 92, 246, 0.4)
--color-secondary: #06b6d4      /* Cyan */

--color-text-main: #f3f4f6      /* Main text */
--color-text-muted: #9ca3af     /* Muted text */
--color-border: #333645         /* Border color */
```

### Glassmorphism

```css
--glass-bg: rgba(28, 30, 38, 0.7)
--glass-border: rgba(255, 255, 255, 0.08)
--backdrop-blur: 16px
```

### Typography

- **Font Family**: Poppins (Google Fonts)
- **Weights**: 300, 400, 500, 600, 700

### Animations

```css
--transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1)
--transition-smooth: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)
```

---

## 🔧 Key Interactions

### Card Resizing
1. User drags resize handle
2. `activeResize` ref prevents auto-corrections
3. On release, dimensions snap to grid (112px increments)
4. View mode updates based on final size
5. Minimum/maximum constraints enforced

### Auto-Grow (Expanded Mode)
1. ResizeObserver monitors content height
2. Calculates required height including chrome
3. Snaps to next 112px increment
4. Only grows (never shrinks automatically)
5. Respects maximum height constraint

### Navigation Flow
1. User double-clicks card
2. `navigateToNode(nodeId)` called
3. `currentParentId` updates
4. Breadcrumb added to trail
5. Canvas filters to show only children
6. Breadcrumbs allow navigation back up

### Block Editing
1. User types in block
2. Slash command (`/`) opens menu
3. Select block type from menu
4. Block inserted and focused
5. Drag handle allows reordering
6. Keyboard shortcuts for navigation

---

## 📁 File Organization

### CSS Modules Pattern
- Each component has corresponding `.module.css`
- Scoped styles prevent conflicts
- Consistent naming: `ComponentName.module.css`

### Feature-Based Structure
- Related components grouped by feature
- Clear separation of concerns
- Easy to locate and maintain

### Type Definitions
- Global types in `src/types.ts`
- Feature-specific types in feature folders
- Shared types exported and reused

---

## 🚀 User Workflows

### Creating a Note
1. Click "Add Note" in bottom menu
2. Select view mode (icon/medium/expanded)
3. Note appears at cursor position
4. Click to edit metadata
5. Double-click to add content

### Organizing Notes
1. Drag notes to reposition
2. Connect notes with edges
3. Navigate into notes to create hierarchy
4. Use breadcrumbs to navigate back
5. Tag and categorize for filtering

### Editing Content
1. Open note in expanded view
2. Use block editor for rich content
3. Slash commands for quick formatting
4. Drag-and-drop to reorder blocks
5. Add media via drag-and-drop or upload

### Task Management
1. Set status (todo/in-progress/review/done)
2. Assign priority (low/medium/high/urgent)
3. Set due dates
4. Add assignees
5. Track progress visually

---

## 🎯 Design Principles

### 1. **Spatial Organization**
- Visual, spatial layout over hierarchical lists
- Freedom to arrange notes as needed
- Connections show relationships

### 2. **Progressive Disclosure**
- Icon view: Minimal information
- Medium view: Key metadata
- Expanded view: Full content
- Fullscreen: Distraction-free editing

### 3. **Atomic Notes**
- Each note is self-contained
- Can be linked and referenced
- Reusable across contexts

### 4. **Flexible Structure**
- Notes can contain other notes (hierarchy)
- Notes can link to other notes (network)
- Blocks provide rich content within notes

### 5. **Premium Aesthetics**
- Dark theme with vibrant accents
- Glassmorphism for depth
- Smooth animations
- Custom controls and handles

---

## 🔮 Future Considerations

Based on the conversation history, potential future enhancements:

1. **Search & Filtering**
   - Full-text search across notes
   - Filter by tags, status, priority
   - Saved searches/views

2. **Collaboration**
   - Real-time multi-user editing
   - Comments and mentions
   - Activity history

3. **Templates**
   - Pre-built note templates
   - Custom template creation
   - Template library

4. **Export/Import**
   - Export to Markdown, PDF
   - Import from other note apps
   - Backup and sync

5. **Advanced Linking**
   - Backlinks
   - Graph view
   - Link suggestions

6. **Mobile Support**
   - Responsive design
   - Touch gestures
   - Mobile-optimized UI

7. **AI Features**
   - Auto-tagging
   - Content suggestions
   - Smart summaries

---

## 📚 Dependencies Reference

### Core Dependencies
- **@xyflow/react**: Canvas and node management
- **zustand**: Lightweight state management
- **@dnd-kit**: Drag-and-drop functionality
- **lucide-react**: Icon library
- **uuid**: Unique ID generation
- **pdfjs-dist**: PDF rendering

### Development
- **TypeScript**: Type safety
- **Vite**: Fast build tool
- **ESLint**: Code linting

---

## 🏁 Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

---

## 📝 Notes

- **Grid System**: All sizing is based on 56px grid units with 16px gaps
- **View Modes**: Automatically determined by card dimensions
- **Parent-Child**: Navigation creates hierarchical contexts
- **Modals**: Three modal types (fullscreen, side, center) are mutually exclusive
- **Auto-Grow**: Only applies to expanded mode, only grows (never shrinks)
- **Resize Snapping**: All resizing snaps to 112px (2 grid unit) increments

---

*Last Updated: January 3, 2026*
