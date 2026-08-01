/**
 * Utility functions for color manipulation to ensure readability and accessibility
 */

/**
 * Convert a vibrant color to a soft pastel version
 * This reduces saturation and increases lightness for better readability
 * @param color The input color
 * @param isLightMode If true, produces a slightly darker pastel for better visibility on light backgrounds
 */
export function toPastelColor(color: string, isLightMode: boolean = false): string {
    // Parse the color to RGB
    const rgb = parseColor(color);
    if (!rgb) return color;

    // Convert RGB to HSL
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // Adjust to vibrant pastel
    // Dark mode: High lightness (85%) to pop against dark bg but retain color depth
    // Light mode: Slightly darker (75%) to be visible against white bg
    const lightness = isLightMode ? 75 : 85;

    const pastelHsl = {
        h: hsl.h,
        s: Math.min(hsl.s, 85), // Increased saturation cap from 40% to 85% for much more vibrant colors
        l: lightness
    };

    // Convert back to RGB and then to hex
    return hslToHex(pastelHsl.h, pastelHsl.s, pastelHsl.l);
}

/**
 * Parse a color string (hex or rgb) to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
    // Handle hex colors
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        } else if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return { r, g, b };
        }
    }

    // Handle rgb/rgba colors
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3])
        };
    }

    return null;
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to Hex
 */
function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
        r = c; g = 0; b = x;
    }

    const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Darken a color by a specific percentage (0-100)
 */
export function darkenColor(color: string, percent: number): string {
    const rgb = parseColor(color);
    if (!rgb) return color;

    const factor = 1 - (percent / 100);
    const r = Math.max(0, Math.floor(rgb.r * factor));
    const g = Math.max(0, Math.floor(rgb.g * factor));
    const b = Math.max(0, Math.floor(rgb.b * factor));

    // Convert back to hex
    const toHex = (n: number) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
