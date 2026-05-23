# Test Specifications: Create Notes with Blocks

**Project:** Chnk it  
**Module:** Editor & Canvas  
**Role:** QA Tester  
**Date:** 2026-01-14

## Overview
This document outlines the test specifications for verifying the functionality of creating notes and manipulating content blocks within the Chnk it application. It covers note creation, block insertion, formatting, media handling, and interaction logic.

---

## Test Suite 1: Note Creation

### TS-001: Create Note on Canvas
**Objective:** Verify a new note can be created and positioned on the infinite canvas.
**Pre-requisites:** Application is loaded, Canvas is active.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the "Add Note" or "Block" tool from the sidebar/UI. | Tool is visible and interactive. |
| 2 | Drag the "Note" or "Text" icon onto the canvas. | A ghost image or cursor indicator follows the drag. |
| 3 | Drop the item onto an empty space on the canvas. | A new Note Node appears at the drop location. |
| 4 | Click inside the note to focus. | The cursor appears, ready for text input. |

### TS-002: Create Card in Kanban Column
**Objective:** Verify a new card (note) can be added to a specific Kanban column.
**Pre-requisites:** A Kanban board exists with at least one column.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the "+" (plus) button in a Kanban column header. | Button is visible. |
| 2 | Click the "+" button. | A new card appears at the bottom (or top) of the column list. |
| 3 | Initial State Check. | The new card should be empty/untitled and ready for editing. |
| 4 | Verify Status. | The internal status of the card should match the column's defined status ID. |

---

## Test Suite 2: basic Block Editing

### TS-003: Add Text Block (Typing & Enter)
**Objective:** Validate the standard flow of writing text and creating new paragraphs.
**Pre-requisites:** An active note with focus.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type "Hello World" in the empty block. | Text appears immediately. |
| 2 | Press `Enter`. | Visual cursor moves to a new line below. A new text block is created. |
| 3 | Type "Second Line". | Text appears in the second block. |
| 4 | Verify DOM. | Two distinct block elements exist in the editor. |

### TS-004: Delete Block (Backspace Methods)
**Objective:** Ensure blocks can be deleted and content merged correctly.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Place cursor at the **start** of the second block (from TS-003). | Cursor is at position 0. |
| 2 | Press `Backspace`. | The second block is removed. Its content ("Second Line") is appended to the first block ("Hello World"). |
| 3 | Resulting Text. | "Hello WorldSecond Line" (or with space if applicable) in a single block. |
| 4 | Clear all text in a block and press `Backspace`. | The empty block is removed, and focus moves to the previous block. |

### TS-005: Reorder Blocks via Drag & Drop
**Objective:** specific blocks can be rearranged.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create three blocks: "Block A", "Block B", "Block C". | Blocks appear in order A, B, C. |
| 2 | Hover over "Block A" to reveal the drag handle (dots icon). | Drag handle is visible. |
| 3 | Click and drag the handle of "Block A" below "Block C". | A drop indicator shows the new position. |
| 4 | Release the mouse. | Order changes to: Block B, Block C, Block A. |

---

## Test Suite 3: Block Types & Formatting

### TS-006: Markdown Shortcuts
**Objective:** precise markdown syntax automatically converts block types.

| Step | Action | Verify Conversion To |
|------|--------|----------------------|
| 1 | Type `# ` (hash + space). | **Heading 1** |
| 2 | Type `## ` (double hash + space). | **Heading 2** |
| 3 | Type `### ` (triple hash + space). | **Heading 3** |
| 4 | Type `- ` (dash + space) or `[] ` (brackets + space). | **Todo / Checkbox** |
| 5 | Type `> ` (greater than + space). | **Quote Block** |
| 6 | Type `1. ` (one + dot + space). | **Numbered List** |
| 7 | Type `---` (three dashes). | **Divider** |

### TS-007: Slash Command Menu
**Objective:** Verify the slash menu can change block types.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type `/` in an empty block. | A popup menu ("Slash Menu") appears nearby. |
| 2 | Type `image`. | Menu filters to show "Image". |
| 3 | Press `Enter` or click "Image". | The current text block becomes an **Image Block** (showing placeholder). |

### TS-008: Toggle List Behavior
**Objective:** Verify content hiding/showing in toggle blocks.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a Toggle block (Type `>> `). | Triangle icon appears. |
| 2 | Type "Parent Toggle". Press `Enter`. | New block appears indented (or sibling, depending on impl). Indent it manually if needed (`Tab`). |
| 3 | Type "Child Content". | Content is nested under the toggle. |
| 4 | Click the Triangle icon on "Parent Toggle". | "Child Content" becomes hidden. Triangle points right. |
| 5 | Click Triangle again. | "Child Content" becomes visible. Triangle points down. |

---

## Test Suite 4: Media & Files

### TS-009: Image Block Handling
**Objective:** Verify image upload and resizing.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create an Image Block. | Shows "Add Image" placeholder. |
| 2 | Click "Upload" or paste an image URL. | Image renders in the block. |
| 3 | Hover over the image. | Resize handles and alignment controls appear. |
| 4 | Drag the right resize handle. | Image width changes responsively. |
| 5 | Click alignment (Center/Right). | Image aligns within the block container accordingly. |

### TS-010: File Block (PDF)
**Objective:** Verify file attachment and PDF preview.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a File Block (`/file`). | Shows file placeholder. |
| 2 | Upload a PDF file (e.g., `document.pdf`). | Block displays file icon, name, and size. |
| 3 | Click the file block. | PDF Viewer modal opens displaying the content. |
| 4 | Close the PDF Viewer. | Returns to editor context. |

---

## Test Suite 5: Advanced Interaction

### TS-011: Indentation (Tab/Shift+Tab)
**Objective:** Verify nesting level logic.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create "Item 1". Press `Enter`. | "Item 2" created. |
| 2 | Type "Item 2". Press `Tab`. | "Item 2" indents (moves right). It is now a child of "Item 1". |
| 3 | Press `Shift + Tab`. | "Item 2" outdents (moves left). It is now a sibling of "Item 1". |
| 4 | Verify constraint: Indent "Item 1" without a parent. | Should NOT indent (cannot indent the first item or deeper than parent+1). |

### TS-012: Multi-Select Actions
**Objective:** Verify actions on multiple selected blocks.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select text across "Block A" and "Block B" (or drag select blocks). | Both blocks are highlighted/selected. |
| 2 | Press `Backspace` / `Delete`. | Both blocks are deleted. |
| 3 | (Alternative) Right-click selection -> "Turn into" -> "Bulleted List". | Both "Block A" and "Block B" convert to bullet points simultaneously. |

### TS-013: Node Splitting (Migration)
**Objective:** Verify long notes automatically split on canvas (if enabled).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In a "Note Card", create a Heading 1 ("Chapter 1"). | Block created. |
| 2 | Add paragraph content. | Content added. |
| 3 | Create another Heading 1 ("Chapter 2"). | Block created. |
| 4 | (Trigger specific to app configuration, e.g., on Sync or specific command). | The Note might split into two distinct nodes on the canvas, or visually separate if "Fused Note" logic activates. |
| 5 | Verify original data integrity. | No text is lost during the split/render process. |
