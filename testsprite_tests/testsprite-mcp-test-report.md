# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata

- **Project Name:** Chnk it
- **Date:** 2026-04-11
- **Prepared by:** TestSprite AI Team (Antigravity)

---

## 2️⃣ Requirement Validation Summary

### 📂 Block Editor Basic Operations

#### Test TC001: Create a rich-text block and see it on the canvas
- **Test Code:** [TC001_Create_a_rich_text_block_and_see_it_on_the_canvas.py](./TC001_Create_a_rich_text_block_and_see_it_on_the_canvas.py)
- **Test Error:** TEST FAILURE
- **Description:** Creating and editing a new block did not work — the entered text was not saved or displayed on the canvas. A "New Note" node is present but its title/body still show placeholders (e.g., "New Note" / "Type something..."). Multiple typing attempts were made into the node title and body, but the exact text "Block A: brainstorm seed" never appeared.
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/584add37-3b1a-465b-8b93-4bc07e4d98b6)
- **Status:** ❌ Failed
- **Analysis / Findings:** State management or event propagation for `onChange` events in the rich text editor might be broken or failing to update the central Zustand/Redux store for node textual content.

#### Test TC006: Edit multiple blocks and keep edits through rearranging
- **Test Code:** [TC006_Edit_multiple_blocks_and_keep_edits_through_rearranging.py](./TC006_Edit_multiple_blocks_and_keep_edits_through_rearranging.py)
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/d3a98b43-499e-4796-909d-40ae7ae62fe0)
- **Status:** ✅ Passed
- **Analysis / Findings:** Basic edits made directly to the active components are partially persistent across DOM reordering.

#### Test TC010: Prevent creating an empty or whitespace-only block
- **Test Code:** [TC010_Prevent_creating_an_empty_or_whitespace_only_block.py](./TC010_Prevent_creating_an_empty_or_whitespace_only_block.py)
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/76358c3a-a98f-4ae5-b8e5-b058db5e803c)
- **Status:** ✅ Passed
- **Analysis / Findings:** Input validation correctly rejects empty block creation.

### 📂 Block Deletion

#### Test TC003: Delete a block and remove it everywhere
- **Test Code:** [TC003_Delete_a_block_and_remove_it_everywhere.py](./TC003_Delete_a_block_and_remove_it_everywhere.py)
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/b8bf1b03-4a83-4047-a111-ddcc0f7ee913)
- **Status:** ✅ Passed
- **Analysis / Findings:** Normal block deletion acts effectively across the UI.

#### Test TC009: Delete a block while it is being edited
- **Test Code:** [TC009_Delete_a_block_while_it_is_being_edited.py](./TC009_Delete_a_block_while_it_is_being_edited.py)
- **Test Error:** TEST FAILURE
- **Description:** Deleting a block while it is being edited did not work. Clicking the node's menu icons and the node container did not open a Delete option. The "New Note" node remained on the canvas and in the sidebar after multiple attempts. No UI control was available to remove the node while it stayed in edit mode.
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/deb2ed5f-94a6-4a20-b673-9e25b55855a1)
- **Status:** ❌ Failed
- **Analysis / Findings:** Event listeners (e.g. `onClick`) on menu icons or the delete button might be masked or bypassed by `stopPropagation` rules while the text editor input component is focused. 

### 📂 Block Rearrangement

#### Test TC004: Rearrange blocks and see positions reflected on the canvas
- **Test Code:** [TC004_Rearrange_blocks_and_see_positions_reflected_on_the_canvas.py](./TC004_Rearrange_blocks_and_see_positions_reflected_on_the_canvas.py)
- **Test Error:** TEST FAILURE
- **Description:** Rearranging nodes and verifying their updated positions did not work — the node contents are placeholders and repeated move attempts did not change the canvas order. Multiple keyboard move attempts and toggling interactivity did not produce a visible position change on the canvas.
- **Test Visualization and Result:** [Link](https://www.testsprite.com/dashboard/mcp/tests/4c0b32b8-7ed9-4b2a-b8d0-b3ccaf12a509/1604d912-1853-475f-bbbc-d1cd5c712734)
- **Status:** ❌ Failed
- **Analysis / Findings:** Either keyboard accessibility on dragging nodes is lacking support, or Dnd-kit (or similar library) drops events without syncing node coordinates dynamically to the store.

### 📂 Canvas Layout and Zoom Interactions

#### Test TC002: Create a node and place it on the canvas
- **Test Code:** [TC002_Create_a_node_and_place_it_on_the_canvas.py](./TC002_Create_a_node_and_place_it_on_the_canvas.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** Canvas integration for basic note population is correct.

#### Test TC005: Arrange multiple nodes and preserve relative spacing across zoom levels
- **Test Code:** [TC005_Arrange_multiple_nodes_and_preserve_relative_spacing_across_zoom_levels.py](./TC005_Arrange_multiple_nodes_and_preserve_relative_spacing_across_zoom_levels.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** React Flow's pan-zoom maintains consistent node padding and spacing dynamically.

#### Test TC007: Zoom in and out updates canvas scale without losing node positions
- **Test Code:** [TC007_Zoom_in_and_out_updates_canvas_scale_without_losing_node_positions.py](./TC007_Zoom_in_and_out_updates_canvas_scale_without_losing_node_positions.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** Viewport state management successfully encapsulates scaling matrices.

#### Test TC008: Rapid create-move-zoom interactions keep the board responsive
- **Test Code:** [TC008_Rapid_create_move_zoom_interactions_keep_the_board_responsive.py](./TC008_Rapid_create_move_zoom_interactions_keep_the_board_responsive.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** Performance metrics remain stable during spam interactions with bounding limits.

---

## 3️⃣ Coverage & Matching Metrics

- **70.00%** of tests passed

| Requirement                   | Total Tests | ✅ Passed | ❌ Failed  |
|-------------------------------|-------------|-----------|------------|
| Block Editor Basic Operations | 3           | 2         | 1          |
| Block Deletion                | 2           | 1         | 1          |
| Block Rearrangement           | 1           | 0         | 1          |
| Canvas Layout and Zoom        | 4           | 4         | 0          |
| **Total**                     | **10**      | **7**     | **3**      |

---

## 4️⃣ Key Gaps / Risks
1. **Broken Two-Way Binding on Editor:** The block editor fails to register typed content correctly in TC001. The component either controls input values incorrectly or fails to lift the updated state to the global store upon typing, leading to user input being ignored. This is a severe usability gap.
2. **Missing Deletion Controls During Edit Mode:** Test TC009 highlights an accessibility and usability issue where the user becomes "trapped" in edit mode and the node menu items (like delete options) become unreachable or unclickable.
3. **Faulty Node Repositioning / Rearrangement:** Test TC004 failed because attempting to rearrange list notes and moving them did not stick or visually relocate them. This points to bugs in either the drag-and-drop context's state reconciler or its intersection collision configuration.
