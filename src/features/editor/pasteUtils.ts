import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockType } from './types';

export const parseClipboardData = async (e: React.ClipboardEvent): Promise<Block[]> => {
    const blocks: Block[] = [];
    const clipboardData = e.clipboardData;

    // 1. Handle Files (Images/Videos)
    if (clipboardData.files && clipboardData.files.length > 0) {
        const filePromises = Array.from(clipboardData.files).map(file => {
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

        // If files exist, return them.
        if (blocks.length > 0) return blocks;
    }

    // 2. Handle HTML
    const html = clipboardData.getData('text/html');
    if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Helper to flatten nodes
        const processNodes = (nodes: NodeListOf<ChildNode> | HTMLElement[]) => {
            Array.from(nodes).forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const el = node as HTMLElement;
                const tagName = el.tagName.toLowerCase();

                if (tagName === 'ul' || tagName === 'ol') {
                    // Iterate children LIs
                    Array.from(el.children).forEach(li => {
                        if (li.tagName.toLowerCase() === 'li') {
                            blocks.push({
                                id: uuidv4(),
                                type: tagName === 'ul' ? 'bullet' : 'numbered',
                                content: li.textContent?.trim() || ''
                            });
                        }
                    });
                } else {
                    const block = domNodeToBlock(el);
                    if (block) blocks.push(block);
                }
            });
        };

        if (doc.body.children.length > 0) {
            processNodes(Array.from(doc.body.children) as HTMLElement[]);
            if (blocks.length > 0) return blocks;
        }
    }

    // 3. Fallback: Handle Plain Text
    const text = clipboardData.getData('text/plain');
    if (text) {
        const lines = text.split(/\r\n|\r|\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            // Markdown list detection
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                blocks.push({
                    id: uuidv4(),
                    type: 'bullet',
                    content: trimmed.substring(2)
                });
            } else if (/^\d+\.\s/.test(trimmed)) {
                blocks.push({
                    id: uuidv4(),
                    type: 'numbered',
                    content: trimmed.replace(/^\d+\.\s/, '')
                });
            } else if (trimmed.startsWith('[] ') || trimmed.startsWith('[ ] ')) {
                blocks.push({
                    id: uuidv4(),
                    type: 'todo',
                    content: trimmed.replace(/^\[ ?\]\s/, '')
                });
            } else if ((trimmed.startsWith('> '))) {
                blocks.push({
                    id: uuidv4(),
                    type: 'quote',
                    content: trimmed.substring(2)
                });
            } else if (trimmed.length === 0) {
                blocks.push({
                    id: uuidv4(),
                    type: 'text',
                    content: ''
                });
            } else {
                blocks.push({
                    id: uuidv4(),
                    type: 'text',
                    content: line
                });
            }
        });
        return blocks;
    }

    return [];
};

function domNodeToBlock(node: HTMLElement): Block | null {
    const id = uuidv4();
    const cleanContent = node.innerText?.trim() || node.textContent?.trim() || '';

    // Ignore empty non-media tags?
    if (!cleanContent && !node.querySelector('img')) return null;

    switch (node.tagName.toLowerCase()) {
        case 'h1':
            return { id, type: 'heading1', content: cleanContent };
        case 'h2':
            return { id, type: 'heading2', content: cleanContent };
        case 'h3':
            return { id, type: 'heading3', content: cleanContent };
        case 'p':
        case 'div':
            // Logic: Check for images inside
            const img = node.querySelector('img');
            if (img && img.src) {
                return { id, type: 'image', content: img.src };
            }
            return { id, type: 'text', content: cleanContent };
        case 'blockquote':
            return { id, type: 'quote', content: cleanContent };
        case 'img':
            return { id, type: 'image', content: (node as HTMLImageElement).src };
        case 'pre':
            return { id, type: 'text', content: cleanContent };
        default:
            return { id, type: 'text', content: cleanContent };
    }
}
