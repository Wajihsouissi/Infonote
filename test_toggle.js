const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
    <!DOCTYPE html>
    <div id="host" contenteditable="true">
        <code>hello word</code>
    </div>
`);
const window = dom.window;
const document = window.document;
const host = document.getElementById('host');

// simulate selection
const codeEl = host.querySelector('code');
const range = document.createRange();
range.selectNodeContents(codeEl);
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);

const tag = 'code';
let targetToUnwrap = null;

let n = range.commonAncestorContainer;
while (n && n !== host) {
    if (n.nodeType === 1 && n.tagName.toLowerCase() === tag) {
        targetToUnwrap = n;
        break;
    }
    n = n.parentNode;
}

if (!targetToUnwrap) {
    const containedNodes = [];
    const allMarks = Array.from(host.querySelectorAll(tag));
    for (const node of allMarks) {
        const nodeRange = document.createRange();
        nodeRange.selectNode(node);
        const isInside = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
                         range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
        if (isInside) containedNodes.push(node);
    }
    if (containedNodes.length === 1) {
        const node = containedNodes[0];
        if (range.toString().trim() === (node.textContent || '').trim()) {
            targetToUnwrap = node;
        }
    }
}

console.log("targetToUnwrap found:", !!targetToUnwrap);
if (targetToUnwrap) {
    const parent = targetToUnwrap.parentNode;
    const frag = document.createDocumentFragment();
    while (targetToUnwrap.firstChild) frag.appendChild(targetToUnwrap.firstChild);
    parent.replaceChild(frag, targetToUnwrap);
}

console.log("DOM after unwrap:", host.innerHTML);
