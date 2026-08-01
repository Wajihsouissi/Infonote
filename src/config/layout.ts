/**
 * Centralized layout constants and utility functions for the Chnk it grid system.
 * BASE_UNIT is 56px.
 * SNAP_STEP is 112px (2 * BASE_UNIT).
 * GRID_GAP is 16px.
 */

export const BASE_UNIT = 56;
export const GRID_GAP = 16;
export const SNAP_STEP = 56; // Unified to 56 for consistency

export const MAX_HEIGHT_UNITS = 20;
export const MAX_WIDTH_UNITS = 12;

export const MAX_HEIGHT = (MAX_HEIGHT_UNITS * BASE_UNIT) - GRID_GAP;
export const MAX_WIDTH = (MAX_WIDTH_UNITS * BASE_UNIT) - GRID_GAP;

export const MIN_EXPANDED_SIZE = (8 * BASE_UNIT) - GRID_GAP; // 432px (8 units)
export const ICON_SIZE = (2 * BASE_UNIT) - GRID_GAP; // 96px
export const MEDIUM_SIZE = (4 * BASE_UNIT) - GRID_GAP; // 208px

// Helper for position snapping
export const snapToGridValue = (val: number) => Math.round(val / BASE_UNIT) * BASE_UNIT;

// Fused Note Scaling Steps (4x4, 6x6, 8x8, 10x10, 12x12 units)
// We jump in steps of 2 units (112px) for a premium modular feel
export const MODULE_SNAP_STEP = BASE_UNIT * 2; // 112px
export const MIN_FUSED_SIZE = MIN_EXPANDED_SIZE;

/**
 * Snaps a dimension to the grid system using strict gap logic.
 * Formula: (N * SNAP_STEP) - GRID_GAP
 */
export const getStrictSize = (value: number): number => {
    // Calculate the nearest "logical slot" (multiples of SNAP_STEP)
    const logicalSlot = Math.round((value + GRID_GAP) / SNAP_STEP) * SNAP_STEP;
    // Return width = logicalWidth - GRID_GAP
    // Ensure min size is at least one step (SNAP_STEP)
    return Math.max(SNAP_STEP, logicalSlot) - GRID_GAP;
};

export const calculateNoteLayout = (rawWidth: number, rawHeight: number) => {
    const normalizedW = rawWidth + GRID_GAP;
    const normalizedH = rawHeight + GRID_GAP;
    const largerDim = Math.max(normalizedW, normalizedH);

    let targetWidth = ICON_SIZE;
    let targetHeight = ICON_SIZE;
    let mode: 'icon' | 'medium' | 'expanded' = 'icon';

    // Thresholds: 
    // < 3 units -> Icon (96px)
    // < 7 units -> Medium (208px)
    // >= 7 units -> Expanded (Min 432px)
    if (largerDim < 3 * BASE_UNIT) {
        targetWidth = ICON_SIZE;
        targetHeight = ICON_SIZE;
        mode = 'icon';

    } else if (largerDim < 7 * BASE_UNIT) {
        targetWidth = MEDIUM_SIZE;
        targetHeight = MEDIUM_SIZE;
        mode = 'medium';
    } else {
        mode = 'expanded';
        // Snap to module grid steps (2-unit increments for consistency with FusedNodes)
        const snapStep = MODULE_SNAP_STEP;

        let w = Math.round((rawWidth + GRID_GAP) / snapStep) * snapStep - GRID_GAP;
        let h = Math.round((rawHeight + GRID_GAP) / snapStep) * snapStep - GRID_GAP;

        // Apply expanded constraints - Min 8x8
        w = Math.max(MIN_EXPANDED_SIZE, Math.min(w, MAX_WIDTH));
        h = Math.max(MIN_EXPANDED_SIZE, Math.min(h, MAX_HEIGHT));

        targetWidth = w;
        targetHeight = h;
    }

    return { width: targetWidth, height: targetHeight, mode };
};

// Fused Note Dimensions are now variable.
/**
 * Snaps fused note dimensions to specific grid steps: 4x4, 6x6, 8x8, 10x10, 12x12 units.
 * Both dimensions are kept equal to maintain a square shape following the user's vision.
 */
export const snapFusedDimensions = (rawWidth: number, rawHeight: number) => {
    const step = BASE_UNIT;

    // Width logic: min 8 units, max 12 units
    let width = Math.round(rawWidth / step) * step - GRID_GAP;
    if (width < MIN_EXPANDED_SIZE) width = MIN_EXPANDED_SIZE;
    if (width > MAX_WIDTH) width = MAX_WIDTH;

    // Height logic: min 4 units, max 20 units
    let height = Math.round(rawHeight / step) * step - GRID_GAP;
    const minHeight = (4 * BASE_UNIT) - GRID_GAP;
    if (height < minHeight) height = minHeight;
    if (height > MAX_HEIGHT) height = MAX_HEIGHT;

    return { width, height };
};
