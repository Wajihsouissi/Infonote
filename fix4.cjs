const fs = require('fs');
let c = fs.readFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', 'utf8');

c = c.replace(/fontWeight="bold"\s*/g, '');

fs.writeFileSync('src/The-website/illustrations/SecondBrainIllustration.tsx', c);
console.log("Removed custom fontWeight.");
