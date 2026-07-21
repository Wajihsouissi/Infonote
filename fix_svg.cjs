const fs = require('fs');
let c = fs.readFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', 'utf8');

c = c.replace(/style=\{\{ rx: '([^']+)' \}\}/g, 'rx="$1"');
c = c.replace(/style=\{\{ fontFamily: '([^']+)' \}\}/g, 'fontFamily="$1"');

fs.writeFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', c);
console.log("Fixed styles");
