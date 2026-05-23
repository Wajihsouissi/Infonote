# User Expectations & Test Specifications: Editor Blocks

## 1. User Expectations Report

### Overview
Users interact with "Blocks" as the fundamental units of content within Chnk it. A block represents any distinct piece of content—a paragraph, a heading, an image, a list item, etc. The block-based model allows for flexible, drag-and-drop organization similar to Notion.

### Key User Capabilities
1.  **Content Creation**: Users expect to type naturally. Pressing `Enter` should create a new text block. They expect "Slash Commands" (`/`) to quickly insert special content types.
2.  **Organization**: Users expect to structure content hierarchically using indentation (`Tab`) and to visually rearrange content using Drag & Drop.
3.  **Rich Media**: Users expect to embed images, videos, and files by dragging them directly from their desktop into the editor.
4.  **Formatting**: Users expect context-appropriate tools (Floating Toolbar) for bold, italic, and color capabilities.
5.  **Layout**: Users expect to create advanced layouts, such as multiple columns, to organize information side-by-side.

---

## 2. Jira Test Specifications

### EPIC: Block Editor Core Functionality

#### TICKET: BE-QA-001 Create Block via Slash Menu
**Type:** Test Case
**Priority:** High
**Component:** Editor / SlashMenu

**Description:**
Verify that users can create various block types using the Slash Menu triggered by typing `/`.

**Pre-conditions:**
1.  User is on a page with the Block Editor active.
2.  Editor is focused.

**Test Steps:**
1.  Click into an empty text block.
2.  Type `/`.
3.  Verify the Slash Menu popover appears.
4.  Type `heading1` to filter the list.
5.  Press `Enter` or click the "Heading 1" option.
6.  Type "Test Header".

**Expected Result:**
*   slash menu appears immediately upon typing `/`.
*   Selecting "Heading 1" converts the current text block into a Heading 1 block.
*   Focus remains in the block.

---

#### TICKET: BE-QA-002 Markdown Shortcuts
**Type:** Test Case
**Priority:** Medium
**Component:** Editor / Shortcuts

**Description:**
Verify that markdown shortcuts automatically convert text blocks into their respective formatted block types.

**Test Steps:**
1.  Create a new empty text block.
2.  Type `#` followed by a `Space`.
3.  (New Line) Type `>` followed by a `Space`.
4.  (New Line) Type `-` followed by a `Space`.
5.  (New Line) Type `[]` followed by a `Space`.

**Expected Result:**
*   `# ` converts block to **Heading 1**.
*   `> ` converts block to **Quote**.
*   `- ` converts block to **Bulleted List**.
*   `[] ` converts block to **ToDo List**.
*   The trigger characters (e.g., `#`, `>`) are removed from the visible content.

---

#### TICKET: BE-QA-003 Block Indentation & Nesting
**Type:** Test Case
**Priority:** High
**Component:** Editor / Typography

**Description:**
Verify that users can indent and outdent blocks to create hierarchical structures.

**Test Steps:**
1.  Create a list of 3 items (A, B, C).
2.  Place cursor at start of item "B".
3.  Press `Tab`.
4.  Place cursor at start of item "C".
5.  Press `Tab` twice.
6.  Press `Shift + Tab` on item "C".

**Expected Result:**
*   Item "B" indents visually to the right (Level 1).
*   Item "C" indents twice (Level 2) then outdents back to Level 1.
*   Check that "B" is treated as a child of "A" in visual hierarchy (guidelines match).

---

#### TICKET: BE-QA-004 List Auto-Continuation
**Type:** Test Case
**Priority:** Medium
**Component:** Editor / Lists

**Description:**
Verify that pressing Enter in a list block continues the list type.

**Test Steps:**
1.  Create a Bulleted List block.
2.  Type "Item 1".
3.  Press `Enter`.
4.  Type "Item 2".
5.  Press `Enter` twice.

**Expected Result:**
*   Step 3: A new line is created, and it is also a Bulleted List.
*   Step 5: The first Enter creates an empty bullet. The second Enter breaks out of the list, converting the empty block to a standard Text block (or outdenting it).

---

#### TICKET: BE-QA-005 Drag and Drop Reordering
**Type:** Test Case
**Priority:** Critical
**Component:** Editor / D&D

**Description:**
Verify that blocks can be reordered via the drag handle.

**Test Steps:**
1.  Create Block A (Text: "Audio").
2.  Create Block B (Text: "Video").
3.  Hover over Block A to reveal the "six-dot" drag handle.
4.  Click and hold the handle.
5.  Drag Block A below Block B until a horizontal blue line appears.
6.  Release the mouse.

**Expected Result:**
*   Block A moves below Block B.
*   The drag ghost image accurately represents the block being moved.
*   Drop target indicator (blue line) appears clearly.

---

#### TICKET: BE-QA-006 Image Drag & Drop Upload
**Type:** Test Case
**Priority:** High
**Component:** Editor / Media

**Description:**
Verify that dragging an image file from the OS into the editor creates an Image Block.

**Test Steps:**
1.  Have an image file (jpg/png) ready on the Desktop.
2.  Drag the file into the editor area.
3.  Release the file.

**Expected Result:**
*   A new Image Block is created at the drop location.
*   The image displays correctly.
*   (Optional) A loading state appears while processing.
*   Metadata (file name/type) is preserved if applicable.

---

#### TICKET: BE-QA-007 Multi-Block Selection & Actions
**Type:** Test Case
**Priority:** Medium
**Component:** Editor / Selection

**Description:**
Verify that users can select multiple blocks and perform batch actions.

**Test Steps:**
1.  Create 3 blocks.
2.  Hold Left Click on the empty background and drag a selection box over two blocks.
3.  Verify they are highlighted (blue background).
4.  Press `Backspace` or `Delete`.

**Expected Result:**
*   Both selected blocks are deleted.
*   Selection box visual is accurate.
*   Focus returns to the nearest remaining block.

---

#### TICKET: BE-QA-008 Convert Block Type (Turn Into)
**Type:** Test Case
**Priority:** Medium
**Component:** Editor / BlockMenu

**Description:**
Verify that an existing block can be converted to a different type.

**Test Steps:**
1.  Create a Text block with content "Transform Me".
2.  Click the drag handle (six dots) to open the Block Menu.
3.  Select "Turn Into".
4.  Select "Callout".

**Expected Result:**
*   The block becomes a Callout block.
*   The text "Transform Me" is preserved inside the callout.
*   Default icon/style is applied.

---

#### TICKET: BE-QA-009 Column Layouts
**Type:** Test Case
**Priority:** medium
**Component:** Editor / Layout

**Description:**
Verify creation and behavior of column blocks.

**Test Steps:**
1.  Type `/columns` and select "2 Columns".
2.  Verify two empty drop zones appear side-by-side.
3.  Type "Left" in column 1.
4.  Type "Right" in column 2.
5.  Resize window if possible (or check mobile view).

**Expected Result:**
*   Two independent editor areas exist side-by-side.
*   Content is retained in each column.
*   Responsive behavior: Columns should stack or adjust on smaller screens (verify implementation).

---

#### TICKET: BE-QA-010 Floating Toolbar Formatting
**Type:** Test Case
**Priority:** Low
**Component:** Editor / Toolbar

**Description:**
Verify text formatting via the floating toolbar.

**Test Steps:**
1.  Type "Select this text".
2.  Highlight the word "this" with the mouse cursor.
3.  Wait for the Floating Toolbar to appear.
4.  Click the **B** (Bold) icon.
5.  Click the Red Color circle (if available) or Text Color option.

**Expected Result:**
*   "this" becomes **bold**.
*   "this" text color changes to red.
*   Selection is maintained after formatting.

### EPIC: Global Drag & Drop Workflows

#### TICKET: BE-QA-011 Bottom Menu to Canvas (Creation)
**Type:** Test Case
**Priority:** High
**Component:** UI / DragDrop

**Description:**
Verify that dragging a block icon from the Bottom Menu onto an empty area of the Canvas creates a new Block Node.

**Pre-conditions:**
1.  Bottom Menu is visible.
2.  Canvas has empty space.

**Test Steps:**
1.  Hover over the "Grid" icon in the Bottom Menu to reveal the block types.
2.  Click and drag the "Heading 1" icon.
3.  Drop it onto an empty space on the Canvas.

**Expected Result:**
*   A new Block Node appears at the exact drop coordinates.
*   The node contains a Heading 1 block.
*   The node is selected/focused.

---

#### TICKET: BE-QA-012 Bottom Menu to Existing Card (Append)
**Type:** Test Case
**Priority:** Medium
**Component:** UI / DragDrop

**Description:**
Verify that dragging a block icon from the Bottom Menu onto an existing Note Card appends the block to that card's content.

**Test Steps:**
1.  Identify an existing Note Card on the canvas.
2.  Drag a "Text" block icon from the Bottom Menu.
3.  Drop it directly ON TOP of the Note Card.

**Expected Result:**
*   **No new node** is created on the canvas.
*   The Note Card flashes or indicates reception.
*   Opening the Note Card shows the new Text block appended to the bottom of its content.

---

#### TICKET: BE-QA-013 Canvas Block to Note Card (Nesting)
**Type:** Test Case
**Priority:** High
**Component:** Canvas / Interaction

**Description:**
Verify that dragging a standalone Block Node from the canvas onto a Note Card merges it into the card.

**Test Steps:**
1.  Create a standard Note Card (Card A).
2.  Create a standalone Block Node (Block B) with some text.
3.  Drag Block B and drop it ON TOP of Card A.

**Expected Result:**
*   **Block B disappears** from the canvas.
*   Card A's content now includes the text from Block B.
*   (Data Validation): Block B's content is appended to Card A's data array.

---

#### TICKET: BE-QA-014 Note Card to Canvas (Ejection / Drag Out)
**Type:** Test Case
**Priority:** High
**Component:** Canvas / Interaction

**Description:**
Verify that a nested node (a child inside a parent context) can be dragged out to the root canvas.

**Pre-conditions:**
1.  User is viewing a Parent Node that contains Children (e.g., viewing a Board or inside a Page).
2.  OR: User drags a node that is visually "inside" a container.

**Test Steps:**
1.  (Scenario A): If UI supports "nested view": Drag a child node from the parent container area to the "outside" or breadcrumb area.
2.  (Scenario B - Current Impl): Drag a node that is technically parented (like a Kanban card) OUT of the board area into empty canvas space.

**Expected Result:**
*   The node detaches from its parent.
*   The node appears on the root canvas at the drop position.
*   The node's `parentId` is cleared in the data model.

---

#### TICKET: BE-QA-015 Block Fusion (Block to Block)
**Type:** Test Case
**Priority:** Medium
**Component:** Canvas / Interaction

**Description:**
Verify that dragging one Block Node onto another Block Node fuses them into a single "Fused Note".

**Test Steps:**
1.  Create Block Node A (Text: "Hello").
2.  Create Block Node B (Text: "World").
3.  Drag Block Node A onto Block Node B.

**Expected Result:**
*   Block Node A disappears.
*   Block Node B transforms into a `FusedNoteNode` (or remains a Block Node with multiple items).
*   The resulting node contains BOTH "World" and "Hello" (order depends on drop logic, usually append).

---

#### TICKET: BE-QA-016 Note to Kanban (Status Assignment)
**Type:** Test Case
**Priority:** Critical
**Component:** Canvas / Kanban

**Description:**
Verify that dragging a Note Card onto a Kanban Board automatically assigns it to the correct column/status.

**Test Steps:**
1.  Have a Kanban Board with columns "Todo" and "Done".
2.  Have a free Note Card on the canvas.
3.  Drag the Note Card over the "Done" column of the Kanban Board.
4.  Release the mouse.

**Expected Result:**
*   The Note Card "snaps" into the Kanban Board's "Done" column list.
*   The Note Card's status metadata is updated to `done`.
*   The Note Card is visually childed to the Kanban Board (moves with it).

#### TICKET: BE-QA-017 Editor Content to Canvas (Extract)
**Type:** Test Case
**Priority:** Low
**Component:** Editor / Interaction

**Description:**
Verify that specific blocks inside a Note Card's editor can be dragged out to the canvas to create a new independent node.

**Pre-conditions:**
1.  Open a Note Card (Expanded/Side Panel) containing blocks (e.g., a paragraph).

**Test Steps:**
1.  Hover over the block in the editor to see the drag handle (six dots).
2.  Click and drag the handle OUT of the card/panel area.
3.  Drop it onto the empty Canvas.

**Expected Result:**
*   A new Block/Fused Node appears on the Canvas.
*   The content of the new node matches the dragged block.
*   The original block is removed from the source Note Card (Move operation) OR duplicated (Copy operation) - *Verify implementation behavior*.

#### TICKET: BE-QA-018 Kanban Card Reordering
**Type:** Test Case
**Priority:** High
**Component:** Kanban

**Description:**
Verify that cards can be reordered within a single Kanban column and moved between columns.

**Test Steps:**
1.  Create two cards in "Column A" of a Kanban board.
2.  Drag the bottom card and drop it above the top card.
3.  Drag the top card and move it to "Column B".

**Expected Result:**
*   Step 2: Cards swap positions in Column A.
*   Step 3: Card moves to Column B and updates status metadata.

#### TICKET: BE-QA-019 File to Canvas Upload
**Type:** Test Case
**Priority:** Medium
**Component:** Canvas / Interaction

**Description:**
Verify that dragging a file (Image/Text) from the Operating System onto the Canvas creates a new node.

**Test Steps:**
1.  Drag an image file from Desktop to the Canvas background.

**Expected Result:**
*   A new Block Node (Image Type) is created at the drop location.
*   The image is displayed.


