const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src', 'The-website', 'MarketingPage.tsx');
let content = fs.readFileSync(file, 'utf8');
let lines = content.split('\n');

// imports
const importStatements = `import { ChunkingIllustration } from './illustrations/ChunkingIllustration';
import { LocalSecurityIllustration } from './illustrations/LocalSecurityIllustration';
import { NodeConnectionsIllustration } from './illustrations/NodeConnectionsIllustration';
import { InfiniteCanvasIllustration } from './illustrations/InfiniteCanvasIllustration';`;

const importIndex = lines.findIndex(l => l.includes('import { useNavigate }'));
if (importIndex !== -1 && !content.includes('ChunkingIllustration')) {
  lines.splice(importIndex + 1, 0, importStatements);
}

// Write the lines back to string to use regex replacement
content = lines.join('\n');

// 1. Replace ChunkingIllustration
// Start: <div className={styles.ftHeroVisualInner}>
// End: </div> </div> </div> </div>
// Wait, regex might be tricky. Let's do it by slicing lines.
lines = content.split('\n');

function replaceBetween(lines, startStr, endStr, replacementLines) {
  const start = lines.findIndex(l => l.includes(startStr));
  if (start === -1) return lines;
  
  // Find the matching end. It might be tricky due to nesting, but let's assume the end string is unique enough in that context.
  // Actually, I can just use line indexes manually since I know them approximately.
  return lines;
}

// Let's just find the indexes.
let startIndex1 = lines.findIndex(l => l.includes('<div className={styles.ftHeroVisualInner}>'));
let endIndex1 = -1;
for (let i = startIndex1 + 1; i < lines.length; i++) {
  if (lines[i].includes('</div>') && lines[i+1].includes('</div>') && lines[i+2].includes('</div>') && lines[i+3].includes('</section>')) {
    endIndex1 = i - 2; // Keep the two closing divs for the parent
    break;
  }
}
if (startIndex1 !== -1 && endIndex1 !== -1) {
  lines.splice(startIndex1, endIndex1 - startIndex1 + 1, `            <div className={styles.ftHeroVisualInner}><ChunkingIllustration /></div>`);
}

let startIndex2 = lines.findIndex(l => l.includes('<!-- LAYER 1: Source Document Card (Largest) -->') || l.includes('Local Storage and Security')) + 15;
// For LocalSecurityIllustration, let's look for "<!-- Floating ambient particles -->"
startIndex2 = lines.findIndex(l => l.includes('<div className={styles.ftDualVisual}>') && lines[l-10] && lines[l-10].includes('Your data stays on your device'));
let endIndex2 = -1;
if (startIndex2 !== -1) {
  for (let i = startIndex2 + 1; i < lines.length; i++) {
    if (lines[i].includes('</div>') && lines[i+1] && lines[i+1].includes('<div className={styles.ftDualCard}>')) {
      endIndex2 = i;
      break;
    }
  }
}
if (startIndex2 !== -1 && endIndex2 !== -1) {
  lines.splice(startIndex2 + 1, endIndex2 - startIndex2 - 1, `              <LocalSecurityIllustration />`);
}

let startIndex3 = lines.findIndex(l => l.includes('<div className={styles.ftDualVisual}>') && lines[l-10] && lines[l-10].includes('Take notes & plan in one flow'));
let endIndex3 = -1;
if (startIndex3 !== -1) {
  for (let i = startIndex3 + 1; i < lines.length; i++) {
    if (lines[i].includes('</div>') && lines[i+1] && lines[i+1].includes('</div>') && lines[i+2] && lines[i+2].includes('<div className={styles.ftSplitRow}>')) {
      endIndex3 = i;
      break;
    }
  }
}
if (startIndex3 !== -1 && endIndex3 !== -1) {
  lines.splice(startIndex3 + 1, endIndex3 - startIndex3 - 1, `              <NodeConnectionsIllustration />`);
}

let startIndex4 = lines.findIndex(l => l.includes('<div className={`${styles.ftDualVisual} ${styles.ftSplitVisualModifier}`}>'));
let endIndex4 = -1;
if (startIndex4 !== -1) {
  for (let i = startIndex4 + 1; i < lines.length; i++) {
    if (lines[i].includes('</div>') && lines[i+1] && lines[i+1].includes('</div>') && lines[i+2] && lines[i+2].includes('<!-- ── Bottom Feature Bar ── -->')) {
      endIndex4 = i;
      break;
    }
  }
}
if (startIndex4 !== -1 && endIndex4 !== -1) {
  lines.splice(startIndex4 + 1, endIndex4 - startIndex4 - 1, `            <InfiniteCanvasIllustration />`);
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Replaced lines successfully.');
