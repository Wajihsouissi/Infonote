const fs = require('fs');
let c = fs.readFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', 'utf8');

c = c.replace(/strokeWidth="[0-9.]+"/g, '');
c = c.replace(/letterSpacing="[0-9.]+"/g, '');

fs.writeFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', c);
console.log("Cleaned up custom inline attributes.");
