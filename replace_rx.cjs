const fs = require('fs');

let content = fs.readFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', 'utf8');

content = content.replace(/rx="8"/g, `style={{ rx: 'var(--radius-md)' }}`);
content = content.replace(/rx="3"/g, `style={{ rx: 'var(--radius-xs)' }}`);
content = content.replace(/rx="2"/g, `style={{ rx: 'var(--radius-xs)' }}`);

fs.writeFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', content);
console.log("Replaced rx with styles");
