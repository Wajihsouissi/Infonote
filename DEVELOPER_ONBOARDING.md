# Developer Onboarding: Infonote

Welcome to the **Infonote** project! This document is designed to get any new developer up to speed quickly on the codebase, architecture, and core paradigms of the application.

## 🎯 What is Infonote?
Infonote is a spatial, infinite-canvas note-taking application. Instead of standard lists or folders, users interact with cards representing notes on an infinite 2D plane. Notes can contain rich text (block format), metadata, and even other notes inside them (hierarchical navigation).

---

## 🛠 Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite 5
- **Styling**: Tailwind CSS v4 coupled with CSS Modules for scoped styles (`.module.css`).
- **Canvas/Nodes engine**: `React Flow` (`@xyflow/react`)
- **State Management**: `Zustand` 5 + `Zundo` (for undo/redo)
- **Drag and Drop**: `@dnd-kit` (core, sortable, utilities)
- **Icons**: `lucide-react`
- **Animations**: `Framer Motion`
- **Other utilities**: `lz-string` (for storage compression), `react-window` (for virtualization), `pdfjs-dist` (for PDF rendering within notes).

---

## 📁 Architecture & Folder Structure

The project starts at `src/main.tsx` and `src/App.tsx`, which wraps the application in the `ReactFlowProvider`.
Most of the logic is broken down by feature in the `src/features/` folder.

```text
src/
├── features/                 # Modular, feature-contained code
│   ├── canvas/               # React Flow board, infinite grid setup, map interaction
│   ├── card/                 # Core Note cards, properties, icons visually rendered on canvas
│   ├── editor/               # Block-based rich text editor for the contents of notes
│   ├── kanban/               # Kanban/Calendar view abstractions
│   ├── ui/                   # Shared UI, Panels, Modals, Menus
│   └── navigation/           # Drill-down/Breadcrumbs logic
├── store/                    # Global State (Zustand)
│   ├── slices/
│   │   ├── nodeSlice.ts      # Core CRUD logic for generic nodes & canvas edges
│   │   ├── navigationSlice.ts# Handles infinite canvas "drill-down" contextual history
│   │   ├── uiSlice.ts        # Overlay/Panel/Modal states
│   │   └── storageSlice.ts   # LocalStorage sync (often utilizing lz-string)
│   └── useStore.ts           # Root store index merging the slices
├── config/                   # Configuration items like layout dimensions & grid setups
├── assets/                   # Static images
├── styles/                   # Global CSS (`index.css`) containing theme tokens (dark mode)
└── types.ts                  # Shared TS definitions across features
```

---

## 🧠 Core Mental Models

Understanding how Infonote renders data is critical. There are three major domains:

### 1. Canvas & React Flow
Every note starts as a `Node` rendered via React Flow. The screen is essentially an infinite coordinate system where each node has `x` and `y` properties. The user can drag them, resize them (snaps to a 56px grid), and connect them with edges.

### 2. Note View Modes & Drill-down
Notes dynamically adjust their detail level based on size:
- **Icon**: Minimal info (112x112px).
- **Medium**: Includes title/tags/status.
- **Expanded**: Displays the block editor alongside metadata.

When a user double-clicks an Expanded note, they "**drill down**" into it. The `navigationSlice` updates the `currentParentId`. The canvas re-renders to only show nodes whose `parentId` matches the current context, effectively turning every note into its own infinite canvas workspace.

### 3. Editor Blocks
Inside a note (when expanded), content is built using a block-based editor. 
We utilize `@dnd-kit` to allow users to drag and drop text paragraphs, images, videos, or PDFs around within the note.

---

## 🚦 Getting Started

Ensure you are using **Node 20+** or **Node 22+**.

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the dev server:**
   ```bash
   npm run dev
   ```
3. **Linting:**
   ```bash
   npm run lint
   ```
4. **Build for production:**
   ```bash
   npm run build
   ```

---

## 📖 Further Reading
For a deep dive into exact properties (e.g. `NoteData` TS definitions), grid sizing, and more specific architectural decisions, please refer to the `INFORMATION_ARCHITECTURE.md` file in the root directory.
