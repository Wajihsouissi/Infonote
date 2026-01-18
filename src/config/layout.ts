/**
 * Centralized layout constants and utility functions for the Infonote grid system.
 * BASE_UNIT is 56px.
 * SNAP_STEP is 112px (2 * BASE_UNIT).
 * GRID_GAP is 16px.
 */

export const BASE_UNIT = 56;
export const GRID_GAP = 16;
export const SNAP_STEP = 112;

export const MAX_HEIGHT_UNITS = 20;
export const MAX_WIDTH_UNITS = 12;

export const MAX_HEIGHT = (MAX_HEIGHT_UNITS * BASE_UNIT) - GRID_GAP; // 1104px
export const MAX_WIDTH = (MAX_WIDTH_UNITS * BASE_UNIT) - GRID_GAP; // 656px

export const MIN_EXPANDED_SIZE = (8 * BASE_UNIT) - GRID_GAP; // 432px
export const ICON_SIZE = (2 * BASE_UNIT) - GRID_GAP; // 96px
export const MEDIUM_SIZE = (4 * BASE_UNIT) - GRID_GAP; // 208px

// Canvas generation constants
export const CANVAS_HORIZONTAL_GAP = 40;
export const CANVAS_VERTICAL_GAP = 60;
export const MAX_ITEMS_PER_ROW = 4;

/**
 * Snaps a dimension to the grid system.
 * Useful for resizing or placing elements.
 */
export const snapToGrid = (value: number): number => {
    // Determine the closest step
    // We want to snap to multiples of SNAP_STEP (e.g. 112, 224, 336...) minus GRID_GAP?
    // The visual grid is cells of 96px with 16px gaps? Or 112px pitch?
    // BASE_UNIT 56. SNAP_STEP 112.
    // 112 - 16 = 96.
    // 224 - 16 = 208.
    // So visual sizes are 96, 208, 320, 432...
    // Formula: (N * SNAP_STEP) - GRID_GAP.

    // Reverse engineer N:
    // val = N*112 - 16
    // val + 16 = N*112
    // N = (val + 16) / 112.

    const normalized = value + GRID_GAP;
    const snapped = Math.round(normalized / SNAP_STEP) * SNAP_STEP;
    return Math.max(SNAP_STEP, snapped) - GRID_GAP; // Ensure min size is at least one step?
};

/**
 * Calculates note dimensions and view mode based on raw width/height.
 * Used by NoteCard.tsx for strict size enforcement and mode switching.
 */
export const calculateNoteLayout = (rawWidth: number, rawHeight: number) => {
    const normalizedW = rawWidth + GRID_GAP;
    const normalizedH = rawHeight + GRID_GAP;
    const largerDim = Math.max(normalizedW, normalizedH);

    let targetWidth = ICON_SIZE;
    let targetHeight = ICON_SIZE;
    let mode: 'icon' | 'medium' | 'expanded' = 'icon';

    // Thresholds:
    // Icon: < 3 units (168px - 16 = 152px)
    // Medium: < 6 units (336px - 16 = 320px)
    // Expanded: >= 6 units
    if (largerDim < 168) {
        targetWidth = ICON_SIZE;
        targetHeight = ICON_SIZE;
        mode = 'icon';
    } else if (largerDim < 336) {
        targetWidth = MEDIUM_SIZE;
        targetHeight = MEDIUM_SIZE;
        mode = 'medium';
    } else {
        mode = 'expanded';
        // Snap to grid steps
        // Use logic from snapToGrid but inline for both dims
        const snapW = Math.round(normalizedW / SNAP_STEP) * SNAP_STEP;
        const snapH = Math.round(normalizedH / SNAP_STEP) * SNAP_STEP;

        let w = snapW - GRID_GAP;
        let h = snapH - GRID_GAP;

        // Apply expanded constraints
        w = Math.max(MIN_EXPANDED_SIZE, Math.min(w, MAX_WIDTH));
        h = Math.max(MIN_EXPANDED_SIZE, Math.min(h, MAX_HEIGHT));

        targetWidth = w;
        targetHeight = h;
    }

    return { width: targetWidth, height: targetHeight, mode };
};

/**
 * Simple dimension snapper for components that don't need mode switching.
 * Used by FusedNoteNode.tsx.
 */
export const snapDimensions = (rawWidth: number, rawHeight: number, minSize = ICON_SIZE) => {
    // Use the same grid logic: (N * SNAP_STEP) - GRID_GAP
    // Ensure minSize is respected

    // Normalize
    const normW = rawWidth + GRID_GAP;
    const normH = rawHeight + GRID_GAP;

    const snapW = Math.round(normW / SNAP_STEP) * SNAP_STEP;
    const snapH = Math.round(normH / SNAP_STEP) * SNAP_STEP;

    let w = snapW - GRID_GAP;
    let h = snapH - GRID_GAP;

    // Min size constraint
    if (w < minSize) w = minSize; // Or calculate closest valid step >= minSize
    if (h < minSize) h = minSize;

    return { width: w, height: h };
};
