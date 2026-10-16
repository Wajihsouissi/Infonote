/**
 * LaTeX that arrives as text.
 *
 * Pasting from a paper, a wiki or a chat answer routinely brings maths with it.
 * The editor has no formula block, so the next best thing is to render what can
 * be rendered with Unicode and leave the rest legible, rather than pasting
 * backslash soup.
 */

/**
 * LaTeX command → Unicode mapping for ChatGPT math content.
 */
const LATEX_MAP: Record<string, string> = {
    '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\longrightarrow': '→',
    '\\leftarrow': '←', '\\Leftarrow': '⇐', '\\longleftarrow': '←',
    '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔',
    '\\uparrow': '↑', '\\downarrow': '↓',
    '\\mapsto': '↦', '\\hookrightarrow': '↪',
    '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\bullet': '•',
    '\\neq': '≠', '\\leq': '≤', '\\geq': '≥', '\\approx': '≈',
    '\\equiv': '≡', '\\sim': '∼', '\\pm': '±', '\\mp': '∓',
    '\\infty': '∞', '\\sum': '∑', '\\prod': '∏', '\\int': '∫',
    '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
    '\\subseteq': '⊆', '\\supseteq': '⊇', '\\cup': '∪', '\\cap': '∩',
    '\\emptyset': '∅', '\\neg': '¬', '\\land': '∧', '\\lor': '∨',
    '\\oplus': '⊕', '\\otimes': '⊗',
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
    '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
    '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
    '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
    '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    '\\Delta': 'Δ', '\\Gamma': 'Γ', '\\Lambda': 'Λ', '\\Sigma': 'Σ',
    '\\Omega': 'Ω', '\\Pi': 'Π', '\\Phi': 'Φ', '\\Psi': 'Ψ',
    '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
    '\\quad': '  ', '\\qquad': '    ', '\\;': ' ', '\\,': ' ',
    '\\star': '⋆', '\\circ': '∘', '\\degree': '°',
    '\\checkmark': '✓', '\\sqrt': '√',
};

/**
 * Convert LaTeX commands to Unicode and clean up LaTeX environment syntax.
 * Handles ChatGPT math content like \rightarrow, \begin{aligned}, etc.
 */
export function cleanLatex(text: string): string {
    let result = text;

    // Remove LaTeX environment wrappers
    result = result.replace(/\\begin\{[^}]+\}/g, '');
    result = result.replace(/\\end\{[^}]+\}/g, '');

    // Replace \text{...} with just the content
    result = result.replace(/\\text\{([^}]*)\}/g, '$1');
    result = result.replace(/\\textbf\{([^}]*)\}/g, '$1');
    result = result.replace(/\\textit\{([^}]*)\}/g, '$1');
    result = result.replace(/\\mathrm\{([^}]*)\}/g, '$1');
    result = result.replace(/\\mathbf\{([^}]*)\}/g, '$1');

    // Simple \frac{a}{b} → a/b
    result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2');

    // Replace all known LaTeX commands (sort by length desc to match longer ones first)
    const sortedKeys = Object.keys(LATEX_MAP).sort((a, b) => b.length - a.length);
    for (const cmd of sortedKeys) {
        // Use word boundary after command to avoid partial matches
        const escaped = cmd.replace(/\\/g, '\\\\');
        const regex = new RegExp(escaped + '(?![a-zA-Z])', 'g');
        result = result.replace(regex, LATEX_MAP[cmd]);
    }

    // Clean up LaTeX alignment characters
    result = result.replace(/&/g, ' ');  // alignment markers
    result = result.replace(/\\\\/g, '\n'); // \\ line breaks → newlines

    // Clean up remaining curly braces from LaTeX (e.g. ^{2} → 2)
    result = result.replace(/\^\{([^}]*)\}/g, '$1');
    result = result.replace(/_\{([^}]*)\}/g, '$1');
    result = result.replace(/[{}]/g, '');

    // Clean up excess whitespace
    result = result.replace(/[ \t]+/g, ' ');
    result = result.split('\n').map(l => l.trim()).filter((l, i, arr) => {
        // Remove consecutive empty lines
        if (l === '' && i > 0 && arr[i - 1] === '') return false;
        return true;
    }).join('\n');

    return result.trim();
}

/**
 * Detect if text contains LaTeX commands.
 */
export function hasLatex(text: string): boolean {
    return /\\(rightarrow|leftarrow|begin|end|frac|text|alpha|beta|gamma|times|div|neq|leq|geq|quad|sum|int|infty|sqrt|cdot)/i.test(text);
}
