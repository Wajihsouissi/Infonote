export const NAMED_COLORS: Record<string, string> = {
    // basic
    "#000000": "Black",
    "#FFFFFF": "White",
    "#FF0000": "Red",
    "#00FF00": "Lime",
    "#0000FF": "Blue",
    "#FFFF00": "Yellow",
    "#00FFFF": "Cyan",
    "#FF00FF": "Magenta",
    "#C0C0C0": "Silver",
    "#808080": "Gray",
    "#800000": "Maroon",
    "#808000": "Olive",
    "#008000": "Green",
    "#800080": "Purple",
    "#008080": "Teal",
    "#000080": "Navy",

    // Extended
    "#F0F8FF": "AliceBlue",
    "#FAEBD7": "AntiqueWhite",
    "#7FFFD4": "Aquamarine",
    "#F0FFFF": "Azure",
    "#F5F5DC": "Beige",
    "#FFE4C4": "Bisque",
    "#FFEBCD": "BlanchedAlmond",
    "#8A2BE2": "BlueViolet",
    "#A52A2A": "Brown",
    "#DEB887": "BurlyWood",
    "#5F9EA0": "CadetBlue",
    "#7FFF00": "Chartreuse",
    "#D2691E": "Chocolate",
    "#FF7F50": "Coral",
    "#6495ED": "CornflowerBlue",
    "#FFF8DC": "Cornsilk",
    "#DC143C": "Crimson",
    "#00008B": "DarkBlue",
    "#008B8B": "DarkCyan",
    "#B8860B": "DarkGoldenRod",
    "#A9A9A9": "DarkGray",
    "#006400": "DarkGreen",
    "#BDB76B": "DarkKhaki",
    "#8B008B": "DarkMagenta",
    "#556B2F": "DarkOliveGreen",
    "#FF8C00": "DarkOrange",
    "#9932CC": "DarkOrchid",
    "#8B0000": "DarkRed",
    "#E9967A": "DarkSalmon",
    "#8FBC8F": "DarkSeaGreen",
    "#483D8B": "DarkSlateBlue",
    "#2F4F4F": "DarkSlateGray",
    "#00CED1": "DarkTurquoise",
    "#9400D3": "DarkViolet",
    "#FF1493": "DeepPink",
    "#00BFFF": "DeepSkyBlue",
    "#696969": "DimGray",
    "#1E90FF": "DodgerBlue",
    "#B22222": "FireBrick",
    "#FFFAF0": "FloralWhite",
    "#228B22": "ForestGreen",
    "#DCDCDC": "Gainsboro",
    "#F8F8FF": "GhostWhite",
    "#FFD700": "Gold",
    "#DAA520": "GoldenRod",
    "#ADFF2F": "GreenYellow",
    "#F0FFF0": "Honeydew",
    "#FF69B4": "HotPink",
    "#CD5C5C": "IndianRed",
    "#4B0082": "Indigo",
    "#FFFFF0": "Ivory",
    "#F0E68C": "Khaki",
    "#E6E6FA": "Lavender",
    "#FFF0F5": "LavenderBlush",
    "#7CFC00": "LawnGreen",
    "#FFFACD": "LemonChiffon",
    "#ADD8E6": "LightBlue",
    "#F08080": "LightCoral",
    "#E0FFFF": "LightCyan",
    "#FAFAD2": "LightGoldenRodYellow",
    "#D3D3D3": "LightGray",
    "#90EE90": "LightGreen",
    "#FFB6C1": "LightPink",
    "#FFA07A": "LightSalmon",
    "#20B2AA": "LightSeaGreen",
    "#87CEFA": "LightSkyBlue",
    "#778899": "LightSlateGray",
    "#B0C4DE": "LightSteelBlue",
    "#FFFFE0": "LightYellow",
    "#32CD32": "LimeGreen",
    "#FAF0E6": "Linen",
    "#66CDAA": "MediumAquaMarine",
    "#0000CD": "MediumBlue",
    "#BA55D3": "MediumOrchid",
    "#9370DB": "MediumPurple",
    "#3CB371": "MediumSeaGreen",
    "#7B68EE": "MediumSlateBlue",
    "#00FA9A": "MediumSpringGreen",
    "#48D1CC": "MediumTurquoise",
    "#C71585": "MediumVioletRed",
    "#191970": "MidnightBlue",
    "#F5FFFA": "MintCream",
    "#FFE4E1": "MistyRose",
    "#FFE4B5": "Moccasin",
    "#FFDEAD": "NavajoWhite",
    "#FDF5E6": "OldLace",
    "#6B8E23": "OliveDrab",
    "#FFA500": "Orange",
    "#FF4500": "OrangeRed",
    "#DA70D6": "Orchid",
    "#EEE8AA": "PaleGoldenRod",
    "#98FB98": "PaleGreen",
    "#AFEEEE": "PaleTurquoise",
    "#DB7093": "PaleVioletRed",
    "#FFEFD5": "PapayaWhip",
    "#FFDAB9": "PeachPuff",
    "#CD853F": "Peru",
    "#FFC0CB": "Pink",
    "#DDA0DD": "Plum",
    "#B0E0E6": "PowderBlue",
    "#BC8F8F": "RosyBrown",
    "#4169E1": "RoyalBlue",
    "#8B4513": "SaddleBrown",
    "#FA8072": "Salmon",
    "#F4A460": "SandyBrown",
    "#2E8B57": "SeaGreen",
    "#FFF5EE": "SeaShell",
    "#A0522D": "Sienna",
    "#87CEEB": "SkyBlue",
    "#6A5ACD": "SlateBlue",
    "#708090": "SlateGray",
    "#FFFAFA": "Snow",
    "#00FF7F": "SpringGreen",
    "#4682B4": "SteelBlue",
    "#D2B48C": "Tan",
    "#D8BFD8": "Thistle",
    "#FF6347": "Tomato",
    "#40E0D0": "Turquoise",
    "#EE82EE": "Violet",
    "#F5DEB3": "Wheat",
    "#F5F5F5": "WhiteSmoke",
    "#9ACD32": "YellowGreen",
    "#333333": "Jet",
    "#1E944A": "Eucalyptus",
};


export const normalizeHex = (value: string) => {
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (withHash.length === 4) {
        return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
    }
    return withHash.toUpperCase();
};

export const hexToRgb = (hex: string) => {
    const normalized = normalizeHex(hex);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

export const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

export const rgbToRgbaString = (rgb: { r: number; g: number; b: number }, alpha = 1) => {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

export const rgbToHslString = (rgb: { r: number; g: number; b: number }) => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max === r) {
            h = ((g - b) / delta) % 6;
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
};

// Find nearest named color
export function getNearestColorName(hex: string): string {
    let nearestName = "Custom Color";
    let minDistance = Infinity;

    const target = hexToRgb(hex);

    for (const [colorHex, name] of Object.entries(NAMED_COLORS)) {
        const current = hexToRgb(colorHex);
        // Euclidean distance
        const distance = Math.sqrt(
            Math.pow(current.r - target.r, 2) +
            Math.pow(current.g - target.g, 2) +
            Math.pow(current.b - target.b, 2)
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearestName = name;
        }
    }

    return nearestName;
}
