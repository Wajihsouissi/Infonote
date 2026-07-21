const fs = require('fs');

let css = fs.readFileSync('src/The-website/MarketingPage.module.css', 'utf8');

// Colors
css = css.replace(/--color-bg-base/g, '--bg-base');
css = css.replace(/--color-text-main/g, '--text-main');
css = css.replace(/--color-border/g, '--line');

// Glows & Glassmorphism
css = css.replace(/box-shadow:[^;]+;/g, 'box-shadow: none;');
css = css.replace(/backdrop-filter:[^;]+;/g, 'backdrop-filter: none;');
css = css.replace(/-webkit-backdrop-filter:[^;]+;/g, '-webkit-backdrop-filter: none;');
css = css.replace(/background:\s*radial-gradient\([^)]+\)[^;]*;/g, 'background: transparent;');
css = css.replace(/background-image:\s*radial-gradient\([^)]+\)[^;]*;/g, 'background-image: none;');

// 3D Transforms
css = css.replace(/perspective\([^)]+\)/g, '');
css = css.replace(/rotateX\([^)]+\)/g, '');
css = css.replace(/rotateY\([^)]+\)/g, '');

// Radii
css = css.replace(/border-radius:\s*12px/g, 'border-radius: var(--radius-lg)');
css = css.replace(/border-radius:\s*16px/g, 'border-radius: var(--radius-lg)');
css = css.replace(/border-radius:\s*20px/g, 'border-radius: var(--radius-xl)');
css = css.replace(/border-radius:\s*24px/g, 'border-radius: var(--radius-xl)');
css = css.replace(/border-radius:\s*32px/g, 'border-radius: var(--radius-xl)');

// Specific Hex Colors matching
css = css.replace(/#111(111)?/g, 'var(--bg-card)');
css = css.replace(/#000(000)?/g, 'var(--bg-base)');
css = css.replace(/#fff(fff)?/g, 'var(--bg-card)'); // Depending on theme, let's map white to card or text. Paper is light.
css = css.replace(/#fafafa/g, 'var(--bg-base)');

fs.writeFileSync('src/The-website/MarketingPage.module.css', css);
console.log("CSS replacements complete!");
