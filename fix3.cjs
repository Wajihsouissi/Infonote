const fs = require('fs');
let c = fs.readFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', 'utf8');

c = c.replace(/fontSize="[0-9]+"/g, '');

fs.writeFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', c);
console.log("Removed custom fontSize.");
