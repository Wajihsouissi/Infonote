import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockType } from './types';

// 1. Handle Files (Images/Videos) - ASYNC
export const parseFiles = async (files: FileList): Promise<Block[]> => {
    const blocks: Block[] = [];
    if (files && files.length > 0) {
        const filePromises = Array.from(files).map(file => {
            return new Promise<Block | null>((resolve) => {
                let type: BlockType = 'file';
                if (file.type.startsWith('image/')) type = 'image';
                else if (file.type.startsWith('video/')) type = 'video';

                // Allow all files

                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        resolve({
                            id: uuidv4(),
                            type,
                            content: event.target.result as string,
                            metadata: {
                                name: file.name,
                                size: file.size,
                                type: file.type
                            }
                        });
                    } else {
                        resolve(null);
                    }
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });
        });

        const fileBlocks = await Promise.all(filePromises);
        fileBlocks.forEach(b => {
            if (b) blocks.push(b);
        });
    }
    return blocks;
};

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
function cleanLatex(text: string): string {
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
function hasLatex(text: string): boolean {
    return /\\(rightarrow|leftarrow|begin|end|frac|text|alpha|beta|gamma|times|div|neq|leq|geq|quad|sum|int|infty|sqrt|cdot)/i.test(text);
}

export function isUrl(str: string): boolean {
    const trimmed = str.trim();
    // Match standard HTTP/HTTPS URLs or raw www. domains or valid domain patterns
    const urlPattern = /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
    return urlPattern.test(trimmed);
}

export function renderContentWithLinks(content: string): string {
    if (!content) return '';
    // Match:
    // 1. Markdown links: [Label](URL)
    // 2. Raw URLs: http://, https://, or www.
    const pattern = /\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s()<>]+(?:\([\w\d]+\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))\)|((?:https?:\/\/|www\.)[^\s()<>]+(?:\([\w\d]+\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/gi;
    
    return content.replace(pattern, (match, label, markdownUrl, rawUrl) => {
        if (label) {
            const href = markdownUrl.startsWith('http') ? markdownUrl : 'https://' + markdownUrl;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="editor-inline-link" style="color: var(--color-text-muted); text-decoration: underline; font-weight: 500;">${label}</a>`;
        } else if (rawUrl) {
            const href = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="editor-inline-link" style="color: var(--color-text-muted); text-decoration: underline; font-weight: 500;">${rawUrl}</a>`;
        }
        return match;
    });
}

// 2. Handle Text/HTML - SYNC
export const parseTextOrHtml = (e: React.ClipboardEvent): Block[] => {
    const blocks: Block[] = [];
    const clipboardData = e.clipboardData;
    const text = clipboardData.getData('text/plain')?.trim();

    // Smart Interceptor: If pasting a single direct URL
    if (text && isUrl(text)) {
        return [{
            id: uuidv4(),
            type: 'link',
            content: text.startsWith('http') ? text : 'https://' + text,
            metadata: {
                displayMode: 'bookmark',
                isLoading: true
            }
        }];
    }

    // Smart Interceptor: If pasting multiple URLs (one per line)
    if (text && text.includes('\n')) {
        const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
        const allUrls = lines.every(l => isUrl(l));
        if (allUrls) {
            return lines.map(line => ({
                id: uuidv4(),
                type: 'link',
                content: line.startsWith('http') ? line : 'https://' + line,
                metadata: {
                    displayMode: 'bookmark',
                    isLoading: true
                }
            }));
        }
    }

    // 2. Handle HTML
    const html = clipboardData.getData('text/html');
    if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        if (doc.body.children.length > 0) {
            processNodes(Array.from(doc.body.childNodes), blocks);
            if (blocks.length > 0) return blocks;
        }
    }

    // 3. Fallback: Handle Plain Text (including Markdown/LaTeX from ChatGPT)
    if (text) {
        // If text contains LaTeX, clean it first then parse
        const cleaned = hasLatex(text) ? cleanLatex(text) : text;
        return parsePlainText(cleaned);
    }

    return [];
};

interface ExtractedLink {
    url: string;
    label?: string;
}

function parseExactLinkLine(trimmedLine: string): ExtractedLink | null {
    // Strips common markdown line prefixes: * , - , • , > , 1. etc.
    const cleanLine = trimmedLine.replace(/^([-*•>\s]|\d+\.\s)+/, '').trim();
    
    // Check 1: Exact Markdown Link: [Label](URL)
    const markdownMatch = cleanLine.match(/^\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s()<>]+)\)$/i);
    if (markdownMatch) {
        return {
            url: markdownMatch[2],
            label: markdownMatch[1]
        };
    }
    
    // Check 2: Exact Raw URL: http://... or www....
    const rawMatch = cleanLine.match(/^((?:https?:\/\/|www\.)[^\s()<>]+(?:\([\w\d]+\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))$/i);
    if (rawMatch) {
        return {
            url: rawMatch[1]
        };
    }
    
    return null;
}

/**
 * Parse plain text content, with Markdown detection for ChatGPT-style output.
 * Handles headings, lists, code fences, tables, blockquotes, dividers, etc.
 */
function parsePlainText(text: string): Block[] {
    const blocks: Block[] = [];
    const lines = text.split(/\r\n|\r|\n/);

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // --- Standalone Link block conversion ---
        const exactLink = parseExactLinkLine(trimmed);
        if (exactLink) {
            blocks.push({
                id: uuidv4(),
                type: 'link',
                content: exactLink.url.startsWith('http') ? exactLink.url : 'https://' + exactLink.url,
                metadata: {
                    displayMode: 'bookmark',
                    isLoading: true,
                    customTitle: exactLink.label
                }
            });
            i++;
            continue;
        }

        // --- Fenced Code Block (``` ... ```) ---
        if (trimmed.startsWith('```')) {
            const codeLines: string[] = [];
            i++; // skip opening fence
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++; // skip closing fence
            blocks.push({
                id: uuidv4(),
                type: 'code',
                content: codeLines.join('\n')
            });
            continue;
        }

        // --- Markdown Table (lines starting with |) ---
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            const tableRows: string[][] = [];
            while (i < lines.length) {
                const tline = lines[i].trim();
                if (!tline.startsWith('|')) break;

                // Skip separator rows like |---|---|
                if (/^\|[\s\-:|\u2014]+\|$/.test(tline)) {
                    i++;
                    continue;
                }

                // Parse cells
                const cells = tline
                    .replace(/^\|/, '')
                    .replace(/\|$/, '')
                    .split('|')
                    .map(c => c.trim());
                tableRows.push(cells);
                i++;
            }

            if (tableRows.length > 0) {
                blocks.push({
                    id: uuidv4(),
                    type: 'table',
                    content: '',
                    metadata: {
                        rows: tableRows
                    }
                });
            }
            continue;
        }

        // --- Markdown Headings ---
        if (trimmed.startsWith('### ')) {
            blocks.push({ id: uuidv4(), type: 'heading3', content: trimmed.substring(4) });
            i++;
            continue;
        }
        if (trimmed.startsWith('## ')) {
            blocks.push({ id: uuidv4(), type: 'heading2', content: trimmed.substring(3) });
            i++;
            continue;
        }
        if (trimmed.startsWith('# ')) {
            blocks.push({ id: uuidv4(), type: 'heading1', content: trimmed.substring(2) });
            i++;
            continue;
        }

        // --- Horizontal Rule / Divider ---
        if (/^[-*_]{3,}$/.test(trimmed)) {
            blocks.push({ id: uuidv4(), type: 'divider', content: '' });
            i++;
            continue;
        }

        // --- Bullet List ---
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
            const prefixLen = trimmed.startsWith('• ') ? 2 : 2;
            blocks.push({
                id: uuidv4(),
                type: 'bullet',
                content: trimmed.substring(prefixLen)
            });
            i++;
            continue;
        }

        // --- Numbered List ---
        if (/^\d+\.\s/.test(trimmed)) {
            blocks.push({
                id: uuidv4(),
                type: 'numbered',
                content: trimmed.replace(/^\d+\.\s/, '')
            });
            i++;
            continue;
        }

        // --- Todo / Checkbox ---
        if (trimmed.startsWith('[] ') || trimmed.startsWith('[ ] ')) {
            blocks.push({
                id: uuidv4(),
                type: 'todo',
                content: trimmed.replace(/^\[ ?\]\s/, '')
            });
            i++;
            continue;
        }
        if (trimmed.startsWith('[x] ') || trimmed.startsWith('[X] ')) {
            blocks.push({
                id: uuidv4(),
                type: 'todo',
                content: trimmed.substring(4),
                metadata: { checked: true }
            });
            i++;
            continue;
        }

        // --- Blockquote ---
        if (trimmed.startsWith('> ')) {
            blocks.push({
                id: uuidv4(),
                type: 'quote',
                content: trimmed.substring(2)
            });
            i++;
            continue;
        }

        // --- Empty Line ---
        if (trimmed.length === 0) {
            // Only add empty text blocks if there's content before and after
            // to avoid excessive empty blocks
            if (blocks.length > 0 && i < lines.length - 1 && lines[i + 1]?.trim()) {
                blocks.push({ id: uuidv4(), type: 'text', content: '' });
            }
            i++;
            continue;
        }

        // --- Default: Plain Text ---
        blocks.push({
            id: uuidv4(),
            type: 'text',
            content: line
        });
        i++;
    }

    return blocks;
}

/**
 * Recursively process DOM nodes from pasted HTML into Block[].
 * Handles tables, code blocks, lists, headings, blockquotes, horizontal rules, etc.
 */
function processNodes(nodes: ChildNode[], blocks: Block[]) {
    for (const node of nodes) {
        // Handle text nodes directly (bare text between elements)
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text) {
                const cleaned = hasLatex(text) ? cleanLatex(text) : text;
                if (cleaned) blocks.push({ id: uuidv4(), type: 'text', content: cleaned });
            }
            continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // --- KaTeX / MathJax math elements (ChatGPT) ---
        if (el.classList?.contains('katex') || el.classList?.contains('katex-display') ||
            el.classList?.contains('math') || el.classList?.contains('MathJax') ||
            el.querySelector('.katex') || el.querySelector('.MathJax')) {
            // Extract rendered text from math elements
            const mathText = getCleanText(el);
            if (mathText) {
                blocks.push({ id: uuidv4(), type: 'text', content: mathText });
            }
            continue;
        }

        // --- Tables ---
        if (tagName === 'table') {
            const rows: string[][] = [];
            const trs = el.querySelectorAll('tr');
            trs.forEach(tr => {
                const cells: string[] = [];
                tr.querySelectorAll('th, td').forEach(cell => {
                    cells.push(cell.textContent?.trim() || '');
                });
                if (cells.length > 0) {
                    rows.push(cells);
                }
            });
            if (rows.length > 0) {
                blocks.push({
                    id: uuidv4(),
                    type: 'table',
                    content: '',
                    metadata: { rows }
                });
            }
            continue;
        }

        // --- Lists (ul/ol) ---
        if (tagName === 'ul' || tagName === 'ol') {
            processListItems(el, blocks, tagName === 'ul' ? 'bullet' : 'numbered', 0);
            continue;
        }

        // --- Code blocks (pre, pre > code) ---
        if (tagName === 'pre') {
            const codeEl = el.querySelector('code');
            const codeContent = codeEl ? codeEl.textContent || '' : el.textContent || '';
            blocks.push({
                id: uuidv4(),
                type: 'code',
                content: codeContent.replace(/\n$/, '') // trim trailing newline
            });
            continue;
        }

        // --- Horizontal rules ---
        if (tagName === 'hr') {
            blocks.push({ id: uuidv4(), type: 'divider', content: '' });
            continue;
        }

        // --- Headings ---
        if (tagName === 'h1') {
            blocks.push({ id: uuidv4(), type: 'heading1', content: getCleanText(el) });
            continue;
        }
        if (tagName === 'h2') {
            blocks.push({ id: uuidv4(), type: 'heading2', content: getCleanText(el) });
            continue;
        }
        if (tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
            blocks.push({ id: uuidv4(), type: 'heading3', content: getCleanText(el) });
            continue;
        }

        // --- Blockquote ---
        if (tagName === 'blockquote') {
            // A blockquote may contain multiple paragraphs
            const innerText = getCleanText(el);
            blocks.push({ id: uuidv4(), type: 'quote', content: innerText });
            continue;
        }

        // --- Paragraphs and divs ---
        if (tagName === 'p' || tagName === 'div') {
            // Check for standalone link inside paragraph/div
            const anchors = el.querySelectorAll('a');
            const innerText = el.textContent?.trim() || '';
            if (anchors.length === 1 && innerText === anchors[0].textContent?.trim()) {
                const href = anchors[0].getAttribute('href');
                if (href) {
                    blocks.push({
                        id: uuidv4(),
                        type: 'link',
                        content: href.startsWith('http') ? href : 'https://' + href,
                        metadata: {
                            displayMode: 'bookmark',
                            isLoading: true,
                            customTitle: anchors[0].textContent?.trim() || undefined
                        }
                    });
                    continue;
                }
            }

            // Check for embedded images
            const img = el.querySelector('img');
            if (img && img.src) {
                blocks.push({ id: uuidv4(), type: 'image', content: img.src });
                // Also capture any text alongside the image
                const textContent = getCleanText(el);
                if (textContent && textContent !== img.alt) {
                    blocks.push({ id: uuidv4(), type: 'text', content: textContent });
                }
                continue;
            }

            // Check if it's a code block styled with monospace
            const codeChild = el.querySelector('code');
            if (codeChild && el.children.length === 1 && el.children[0] === codeChild) {
                blocks.push({ id: uuidv4(), type: 'code', content: codeChild.textContent || '' });
                continue;
            }

            const text = getCleanText(el);
            if (text) {
                blocks.push({ id: uuidv4(), type: 'text', content: text });
            }
            continue;
        }

        // --- Standalone image ---
        if (tagName === 'img') {
            const src = (el as HTMLImageElement).src;
            if (src) {
                blocks.push({ id: uuidv4(), type: 'image', content: src });
            }
            continue;
        }

        // --- Line break ---
        if (tagName === 'br') {
            // Usually within text; skip standalone BRs
            continue;
        }

        // --- Standalone anchor ---
        if (tagName === 'a') {
            const href = el.getAttribute('href');
            const text = el.textContent?.trim() || '';
            if (href) {
                blocks.push({
                    id: uuidv4(),
                    type: 'link',
                    content: href.startsWith('http') ? href : 'https://' + href,
                    metadata: {
                        displayMode: 'bookmark',
                        isLoading: true,
                        customTitle: text || undefined
                    }
                });
                continue;
            }
        }

        // --- Inline elements (span, strong, em, code, etc.) ---
        // These shouldn't normally be top-level, but ChatGPT sometimes wraps content oddly
        if (['span', 'strong', 'em', 'b', 'i', 'code', 'mark', 'u', 's', 'del', 'sub', 'sup'].includes(tagName)) {
            const text = getCleanText(el);
            if (text) {
                blocks.push({ id: uuidv4(), type: 'text', content: text });
            }
            continue;
        }

        // --- Sections, articles, mains, headers, footers: recurse into children ---
        if (['section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'details', 'summary', 'figure', 'figcaption'].includes(tagName)) {
            processNodes(Array.from(el.childNodes), blocks);
            continue;
        }

        // --- Fallback: Extract text content ---
        const fallbackText = getCleanText(el);
        if (fallbackText) {
            blocks.push({ id: uuidv4(), type: 'text', content: fallbackText });
        }
    }
}

/**
 * Recursively process list items, supporting nested lists with indentation.
 */
function processListItems(listEl: HTMLElement, blocks: Block[], listType: 'bullet' | 'numbered', indent: number) {
    const children = Array.from(listEl.children);
    for (const child of children) {
        if (child.tagName.toLowerCase() !== 'li') continue;

        // Check for standalone link inside list item
        const anchors = child.querySelectorAll('a');
        const innerText = child.textContent?.trim() || '';
        if (anchors.length === 1 && innerText === anchors[0].textContent?.trim()) {
            const href = anchors[0].getAttribute('href');
            if (href) {
                blocks.push({
                    id: uuidv4(),
                    type: 'link',
                    content: href.startsWith('http') ? href : 'https://' + href,
                    metadata: {
                        displayMode: 'bookmark',
                        isLoading: true,
                        customTitle: anchors[0].textContent?.trim() || undefined
                    }
                });
                continue;
            }
        }

        // Clone the list item and convert anchor tags to markdown format to preserve URLs
        const clone = child.cloneNode(true) as HTMLElement;
        const cloneAnchors = clone.querySelectorAll('a');
        cloneAnchors.forEach(a => {
            const href = a.getAttribute('href');
            const text = a.textContent || '';
            
            if (href && text.trim()) {
                if (href !== text) {
                    const markdownLink = `[${text}](${href})`;
                    const textNode = clone.ownerDocument.createTextNode(markdownLink);
                    a.parentNode?.replaceChild(textNode, a);
                } else {
                    const textNode = clone.ownerDocument.createTextNode(href);
                    a.parentNode?.replaceChild(textNode, a);
                }
            }
        });

        // Get direct text content (excluding nested lists)
        let textContent = '';
        const nestedLists: HTMLElement[] = [];

        for (const liChild of Array.from(clone.childNodes)) {
            if (liChild.nodeType === Node.ELEMENT_NODE) {
                const childTag = (liChild as HTMLElement).tagName.toLowerCase();
                if (childTag === 'ul' || childTag === 'ol') {
                    const origIndex = Array.from(clone.childNodes).indexOf(liChild);
                    const origNestedList = child.childNodes[origIndex] as HTMLElement;
                    if (origNestedList) {
                        nestedLists.push(origNestedList);
                    }
                } else {
                    textContent += (liChild as HTMLElement).textContent || '';
                }
            } else if (liChild.nodeType === Node.TEXT_NODE) {
                textContent += liChild.textContent || '';
            }
        }

        blocks.push({
            id: uuidv4(),
            type: listType,
            content: textContent.trim(),
            indent
        });

        // Process nested lists with increased indent
        for (const nestedList of nestedLists) {
            const nestedType = nestedList.tagName.toLowerCase() === 'ul' ? 'bullet' : 'numbered';
            processListItems(nestedList, blocks, nestedType as 'bullet' | 'numbered', indent + 1);
        }
    }
}

/**
 * Extract clean text content from an element, converting internal <a> tags to markdown links to preserve URLs.
 */
function getCleanText(el: HTMLElement): string {
    // Clone the element and convert anchor tags to markdown format to preserve URLs
    const clone = el.cloneNode(true) as HTMLElement;
    const anchors = clone.querySelectorAll('a');
    anchors.forEach(a => {
        const href = a.getAttribute('href');
        const text = a.textContent || '';
        
        if (href && text.trim()) {
            if (href !== text) {
                const markdownLink = `[${text}](${href})`;
                const textNode = clone.ownerDocument.createTextNode(markdownLink);
                a.parentNode?.replaceChild(textNode, a);
            } else {
                const textNode = clone.ownerDocument.createTextNode(href);
                a.parentNode?.replaceChild(textNode, a);
            }
        }
    });

    const raw = (clone.innerText || clone.textContent || '').trim();
    return hasLatex(raw) ? cleanLatex(raw) : raw;
}

export const parseClipboardData = async (e: React.ClipboardEvent): Promise<Block[]> => {
    // Legacy support or combined usage
    const files = e.clipboardData.files;
    if (files && files.length > 0) {
        return parseFiles(files);
    }
    return parseTextOrHtml(e);
};
