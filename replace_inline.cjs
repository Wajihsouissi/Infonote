const fs = require('fs');

let content = fs.readFileSync('src/The-website/MarketingPage.tsx', 'utf8');

// Replace ImageBlockComponent boxShadow
content = content.replace(
  /boxShadow:\s*'0\s+12px\s+30px\s+rgba\(0,0,0,0.3\)'/g,
  `boxShadow: 'none'`
);

// Replace YouTubeModal backdropFilter
content = content.replace(
  /background:\s*'rgba\(0,0,0,0.85\)',\s*backdropFilter:\s*'blur\(8px\)'/g,
  `background: 'rgba(0,0,0,0.85)'`
);

// Replace YouTubeModal iframe container boxShadow
content = content.replace(
  /boxShadow:\s*'0\s+30px\s+80px\s+rgba\(0,0,0,0.8\)'/g,
  `boxShadow: 'none'`
);

fs.writeFileSync('src/The-website/MarketingPage.tsx', content);
console.log("Inline style replacements complete!");
