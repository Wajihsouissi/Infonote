import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import { cleanLatex, hasLatex } from './latex';

/**
 * Pasted HTML to blocks: the structure a web page or a document carries —
 * tables, code, lists, headings, quotes, rules — kept rather than flattened.
 */

/**
 * Recursively process DOM nodes from pasted HTML into Block[].
 * Handles tables, code blocks, lists, headings, blockquotes, horizontal rules, etc.
 */
export function processNodes(nodes: ChildNode[], blocks: Block[]) {
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
    const listStart = listType === 'numbered'
        ? Math.max(1, Number.parseInt(listEl.getAttribute('start') || '1', 10) || 1)
        : undefined;
    let listOffset = 0;
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
            indent,
            ...(listStart !== undefined ? { metadata: { listNumber: listStart + listOffset } } : {})
        });
        listOffset++;

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
