/**
 * Generates the palette-study artboards.
 *
 * The three screens are the same canvas recreation in three grounds, so they
 * are written from one template here rather than kept as three hand-edited
 * copies that would drift apart. Edit this file, re-run it, re-seed the canvas.
 *
 *   node design/palettes/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

/* Ladders computed in oklch: the four rungs hold one hue and chroma per
   version and step only in lightness. The tertiaries follow their own rule —
   see below. */
const TINT_NAMES = ['red', 'amber', 'citrine', 'olive', 'jade', 'teal', 'azure', 'indigo', 'purple', 'magenta'];

/* One row for all three grounds now. Each hue rides its own cusp — the
   lightness where sRGB holds the most chroma for it — pulled 62% toward a
   common L 0.76 and taking 88% of the chroma available there. Lightness varies
   by hue on purpose: a single flat lightness is what made the earlier rows pale
   and made hues sRGB cannot saturate (teal, azure) drift toward each other.
   Citrine takes a lighter pull than the rest: yellow's cusp is very high, and
   the standard pull landed it in gold rather than yellow. */
const PALETTES = [
    {
        id: 'g1',
        num: '01',
        name: 'Graphite 01',
        character: 'One step under the Graphite you saw. Cards still lift off the desk.',
        ladder: { workspace: '#131313', frame: '#1c1c1c', well: '#1f1f1f', node: '#242424' },
        tints: ['#f67a61', '#f49b37', '#eebf3f', '#b3d740', '#45df95', '#46dbdb', '#4cbaf6', '#7284f2', '#bd77f4', '#f66eae'],
    },
    {
        id: 'g2',
        num: '02',
        name: 'Graphite Deep',
        character: 'The middle setting. Chrome recedes and the tints carry the colour.',
        ladder: { workspace: '#101010', frame: '#191919', well: '#1b1b1b', node: '#202020' },
        tints: ['#f67a61', '#f49b37', '#eebf3f', '#b3d740', '#45df95', '#46dbdb', '#4cbaf6', '#7284f2', '#bd77f4', '#f66eae'],
    },
    {
        id: 'g3',
        num: '03',
        name: 'Graphite Deepest',
        character: 'As far as this goes before the desk turns black — #0d0d0d is 13 of 255.',
        ladder: { workspace: '#0d0d0d', frame: '#161616', well: '#181818', node: '#1d1d1d' },
        tints: ['#f67a61', '#f49b37', '#eebf3f', '#b3d740', '#45df95', '#46dbdb', '#4cbaf6', '#7284f2', '#bd77f4', '#f66eae'],
    },
];

/* Lifted from src/styles/design-system.css so the mockup is the app, not an
   impression of it. */
const APP = {
    accent: '#ff5040',
    textMain: '#ffffff',
    textSoft: '#e6e6e6',
    textFaint: '#a3a3a3',
    line: 'rgba(255,255,255,0.10)',
    lineStrong: 'rgba(255,255,255,0.18)',
    hoverWash: 'rgba(255,255,255,0.08)',
    rPanel: '32px',
    rSurface: '16px',
    rLg: '24px',
    rMd: '12px',
    topbar: 56,
    inset: 12,
    shellRadius: '40px',
    font: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const HEAD = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>`;
const FOOT = `</x-dc>
</body>
</html>
`;

const helmet = (extra = '') => `<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: ${APP.font}; -webkit-font-smoothing: antialiased; }
    a { color: ${APP.accent}; text-decoration: none; }
    a:hover { color: #ff7566; }
    ${extra}
  </style>
</helmet>`;

/* ---- icons: stroke SVG on a 24 grid, one weight throughout ---- */
const icon = (paths, size = 18, stroke = 1.6) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const I = {
    grid: icon('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
    undo: icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-3"/>'),
    redo: icon('<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h3"/>'),
    folder: icon('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2a2 2 0 0 1 1.5.7l1 1.2a2 2 0 0 0 1.5.7h5.8A2.5 2.5 0 0 1 21 10.1v6.4A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>'),
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>'),
    list: icon('<path d="M4 16h16M4 11h12M8 6l4-3 4 3"/>'),
    keyboard: icon('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 13.5h.01M17 13.5h.01M9.5 13.5h5"/>'),
    search: icon('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
    plus: icon('<path d="M12 5v14M5 12h14"/>', 20, 2),
    panel: icon('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18"/>'),
    gear: icon('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.4a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z"/>', 26, 1.4),
    sparkle: icon('<path d="M12 3.2 13.7 8 18.5 9.7 13.7 11.4 12 16.2 10.3 11.4 5.5 9.7 10.3 8z"/><path d="M18.4 15.2 19.2 17.4 21.4 18.2 19.2 19 18.4 21.2 17.6 19 15.4 18.2 17.6 17.4z"/>', 20, 1.5),
    zoomIn: icon('<path d="M12 5v14M5 12h14"/>', 16, 2),
    zoomOut: icon('<path d="M5 12h14"/>', 16, 2),
    fit: icon('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>', 16, 1.8),
    lock: icon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>', 16, 1.8),
    canvasMark: icon('<path d="M4 9.5 12 4l8 5.5v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>', 15, 1.8),
};

const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}, ${b})`;

/* ---- one screen, in one palette ---- */
function screen(p) {
    const L = p.ladder;
    const t = (name) => p.tints[TINT_NAMES.indexOf(name)];
    const chromeBtn = (svg, extra = '') =>
        `<div style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: ${APP.rMd}; color: ${APP.textSoft}; ${extra}">${svg}</div>`;

    const swatch = (name, i) => {
        const selected = name === 'purple';
        return `<div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; ${selected ? `box-shadow: 0 0 0 2px ${L.frame}, 0 0 0 3.5px ${p.tints[i]};` : ''}">
              <span style="display: block; width: 22px; height: 22px; border-radius: 999px; background: ${p.tints[i]};"></span>
            </div>`;
    };

    return `${HEAD}
${helmet()}
<div style="position: relative; width: 1440px; height: 1340px; background: ${L.frame}; color: ${APP.textMain}; overflow: hidden;">

  <!-- top bar -->
  <div style="display: flex; align-items: center; justify-content: space-between; height: ${APP.topbar}px; padding: 0 20px;">
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: ${APP.rSurface}; background: ${mix('#ffffff', '4%', L.frame)};">
        ${chromeBtn(I.grid, `color: ${APP.textMain};`)}
        ${chromeBtn(I.undo, `color: ${APP.textFaint};`)}
        ${chromeBtn(I.redo, `color: ${APP.textFaint};`)}
      </div>
      <div style="display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 15px; border-radius: ${APP.rSurface}; background: ${mix(APP.accent, '14%', L.frame)}; color: ${APP.accent}; font-size: 15px; font-weight: 600;">
        ${I.canvasMark}<span>Canvas</span>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="padding: 4px; border-radius: ${APP.rSurface}; background: ${mix('#ffffff', '4%', L.frame)};">${chromeBtn(I.folder)}</div>
      <div style="display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: ${APP.rSurface}; background: ${mix('#ffffff', '4%', L.frame)};">
        ${chromeBtn(I.sun)}${chromeBtn(I.list)}${chromeBtn(I.keyboard)}
      </div>
    </div>
  </div>

  <!-- the desk -->
  <div style="position: absolute; left: ${APP.inset}px; right: ${APP.inset}px; top: ${APP.topbar}px; bottom: ${APP.inset}px; border-radius: ${APP.shellRadius}; background: ${L.workspace}; background-image: radial-gradient(${APP.line} 1.2px, transparent 1.2px); background-size: 30px 30px; background-position: 14px 14px; overflow: hidden;">

    <!-- Project Goal -->
    <div style="position: absolute; left: 132px; top: 244px; width: 700px; height: 700px; display: flex; flex-direction: column; border-radius: ${APP.rPanel}; background: ${L.node}; border: 1px solid ${APP.line};">
      <div style="padding: 22px 26px 14px; font-size: 21px; font-weight: 600; letter-spacing: -0.01em;">Project Goal</div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; flex: 1; margin: 0 8px 8px; border-radius: ${APP.rLg}; background: ${L.well};">
        <div style="font-size: 17px; font-weight: 600;">Click to start writing</div>
        <div style="font-size: 14px; color: ${APP.textFaint};">Your first block will appear here.</div>
      </div>
    </div>

    <!-- Features, tinted jade -->
    <div style="position: absolute; left: 928px; top: 244px; width: 340px; height: 330px; display: flex; flex-direction: column; border-radius: ${APP.rPanel}; background: ${mix(t('jade'), '14%', L.node)}; border: 1px solid ${mix(t('jade'), '34%', 'transparent')};">
      <div style="padding: 20px 24px 10px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em;">Features</div>
      <div style="flex: 1; margin: 0 8px 8px; padding: 16px 18px; border-radius: ${APP.rLg}; background: ${mix(t('jade'), '12%', L.well)}; font-size: 14.5px; line-height: 1.55; color: ${APP.textSoft};">
        Core features include atomic notes, infinite canvas, and smart linking between notes
      </div>
    </div>

    <!-- Tech Stack, tinted violet -->
    <div style="position: absolute; left: 928px; top: 546px; width: 156px; height: 148px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: ${APP.rPanel}; background: ${mix(t('purple'), '14%', L.node)}; border: 1px solid ${mix(t('purple'), '34%', 'transparent')};">
      <span style="color: ${t('purple')};">${I.gear}</span>
      <span style="font-size: 15px; font-weight: 600;">Tech Stack</span>
    </div>

    <!-- card colour picker: the ten tertiaries where they get used -->
    <div style="position: absolute; left: 1104px; top: 546px; width: 226px; padding: 14px; border-radius: ${APP.rSurface}; background: ${mix('#ffffff', '6%', L.frame)}; border: 1px solid ${APP.lineStrong}; box-shadow: 0 18px 40px rgba(0,0,0,0.45);">
      <div style="margin-bottom: 11px; font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: ${APP.textFaint};">Card colour</div>
      <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px;">
        ${TINT_NAMES.map((n, i) => swatch(n, i)).join('\n        ')}
      </div>
    </div>

    <!-- cards counter -->
    <div style="position: absolute; left: 24px; bottom: 24px; padding: 9px 16px; border-radius: ${APP.rMd}; background: ${mix('#ffffff', '6%', L.frame)}; font-size: 13.5px; color: ${APP.textSoft};">3/25 cards</div>

    <!-- dock -->
    <div style="position: absolute; left: 50%; bottom: 32px; transform: translateX(-50%); display: flex; align-items: center; gap: 18px;">
      <div style="display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: ${APP.rSurface}; background: ${mix(APP.accent, '12%', L.frame)}; border: 1px solid ${mix(APP.accent, '30%', 'transparent')}; color: ${APP.accent}; box-shadow: 0 0 28px ${mix(APP.accent, '22%', 'transparent')};">${I.sparkle}</div>
      <div style="display: flex; align-items: center; gap: 14px; height: 68px; padding: 0 22px; border-radius: 999px; background: ${mix('#ffffff', '6%', L.frame)}; border: 1px solid ${APP.line};">
        ${chromeBtn(I.search, `color: ${APP.textSoft};`)}
        <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: ${APP.rSurface}; background: ${APP.accent}; color: #ffffff; box-shadow: 0 0 26px ${mix(APP.accent, '45%', 'transparent')};">${I.plus}</div>
        ${chromeBtn(I.panel, `color: ${APP.textSoft};`)}
        <span style="width: 1px; height: 26px; background: ${APP.lineStrong};"></span>
        ${chromeBtn(I.grid, `color: ${APP.textSoft};`)}
      </div>
    </div>

    <!-- minimap -->
    <div style="position: absolute; right: 24px; bottom: 24px; display: flex; align-items: stretch; gap: 8px;">
      <div style="position: relative; width: 250px; height: 156px; border-radius: ${APP.rMd}; background: ${mix('#000000', '55%', L.workspace)}; border: 1px solid ${APP.line}; overflow: hidden;">
        <span style="position: absolute; left: 12px; top: 26px; width: 96px; height: 104px; border-radius: 4px; background: ${APP.accent};"></span>
        <span style="position: absolute; left: 130px; top: 26px; width: 56px; height: 46px; border-radius: 4px; background: ${APP.accent};"></span>
        <span style="position: absolute; left: 130px; top: 78px; width: 30px; height: 26px; border-radius: 4px; background: ${APP.accent};"></span>
      </div>
      <div style="display: flex; flex-direction: column; justify-content: space-between; width: 38px; padding: 5px 0; border-radius: ${APP.rMd}; background: ${mix('#ffffff', '6%', L.frame)}; border: 1px solid ${APP.line}; color: ${APP.textSoft};">
        <div style="display: flex; justify-content: center;">${I.zoomIn}</div>
        <div style="display: flex; justify-content: center;">${I.zoomOut}</div>
        <div style="display: flex; justify-content: center;">${I.fit}</div>
        <div style="display: flex; justify-content: center;">${I.lock}</div>
      </div>
    </div>
  </div>

  <!-- palette caption, off-canvas chrome so it never sits on the mockup -->
  <div style="position: absolute; left: 32px; top: 14px; display: none;">${p.name}</div>
</div>
${FOOT}`;
}

/* ---- the spec sheet ---- */
function tokens() {
    const rung = (label, token, hex, border) => `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="width: 46px; height: 34px; border-radius: 9px; background: ${hex}; border: 1px solid ${border};"></span>
          <span style="flex: 1; min-width: 0;">
            <span style="display: block; font-size: 13px; font-weight: 600; color: #f2f2f2;">${label}</span>
            <span style="display: block; font-size: 11.5px; color: #8f8f8f;">${token}</span>
          </span>
          <span style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12.5px; color: #c9c9c9;">${hex}</span>
        </div>`;

    const column = (p) => `
      <div style="display: flex; flex-direction: column; gap: 18px; padding: 24px; border-radius: 20px; background: ${p.ladder.frame}; border: 1px solid rgba(255,255,255,0.09);">
        <div>
          <div style="display: flex; align-items: baseline; gap: 9px;">
            <span style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; color: #7d7d7d;">${p.num}</span>
            <span style="font-size: 20px; font-weight: 600; letter-spacing: -0.01em;">${p.name}</span>
          </div>
          <div style="margin-top: 5px; font-size: 13px; line-height: 1.45; color: #9c9c9c;">${p.character}</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${rung('Desk &amp; panel bodies', '--bg-workspace', p.ladder.workspace, 'rgba(255,255,255,0.12)')}
          ${rung('Shell, top bar, panel chrome', '--bg-frame', p.ladder.frame, 'rgba(255,255,255,0.12)')}
          ${rung('Note well', '--bg-node-well', p.ladder.well, 'rgba(255,255,255,0.12)')}
          ${rung('Card', '--bg-node', p.ladder.node, 'rgba(255,255,255,0.12)')}
        </div>

        <div>
          <div style="margin-bottom: 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: #7d7d7d;">Ten tertiaries — --a-&lt;name&gt;</div>
          <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px 10px;">
            ${TINT_NAMES.map((n, i) => `<div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="height: 34px; border-radius: 9px; background: ${p.tints[i]};"></span>
              <span style="font-size: 11px; font-weight: 600; color: #d6d6d6;">${n}</span>
              <span style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; color: #8f8f8f;">${p.tints[i]}</span>
            </div>`).join('\n            ')}
          </div>
        </div>

        <div style="display: flex; gap: 10px;">
          ${['red', 'jade', 'purple'].map((n) => {
        const hex = p.tints[TINT_NAMES.indexOf(n)];
        return `<div style="flex: 1; padding: 12px 13px; border-radius: 14px; background: ${mix(hex, '14%', p.ladder.node)}; border: 1px solid ${mix(hex, '34%', 'transparent')};">
            <span style="display: block; width: 9px; height: 9px; margin-bottom: 8px; border-radius: 999px; background: ${hex};"></span>
            <span style="display: block; font-size: 12px; font-weight: 600; color: #ededed;">Card</span>
            <span style="display: block; font-size: 10.5px; color: #9c9c9c;">14% wash</span>
          </div>`;
    }).join('\n          ')}
        </div>
      </div>`;

    return `${HEAD}
${helmet()}
<div style="width: 1440px; min-height: 1020px; padding: 40px; box-sizing: border-box; background: #131313; color: #ffffff;">
  <div style="margin-bottom: 28px;">
    <div style="font-size: 26px; font-weight: 600; letter-spacing: -0.015em;">Three Graphites, ten tertiaries each</div>
    <div style="margin-top: 7px; max-width: 880px; font-size: 14px; line-height: 1.55; color: #9c9c9c;">
      One neutral hue, one set of four rungs, and only the lightness moves: 01 → 03 gets darker while every relationship holds, and the deepest desk stops at #0d0d0d rather than going to black. The ten tertiaries no longer share one lightness. Each hue rides its own cusp — the lightness where sRGB holds the most chroma for it — which is what stops the row going pale and stops the hues sRGB cannot saturate collapsing into each other. Lightness varies by hue on purpose: citrine and olive sit high, indigo low. They fill the <span style="font-family: ui-monospace, monospace; font-size: 13px; color: #d6d6d6;">--a-&lt;name&gt;</span> slots that already exist, with <span style="font-family: ui-monospace, monospace; font-size: 13px; color: #d6d6d6;">--a-rose</span> → red and <span style="font-family: ui-monospace, monospace; font-size: 13px; color: #d6d6d6;">--a-violet</span> → purple.
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px;">
    ${PALETTES.map(column).join('\n    ')}
  </div>

  <div style="margin-top: 26px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.09); font-size: 12.5px; line-height: 1.6; color: #8f8f8f;">
    The accent stays <span style="font-family: ui-monospace, monospace; color: ${APP.accent};">#ff5040</span> in all three — it is the brand, not part of the ground.
    <span style="font-family: ui-monospace, monospace; color: #d6d6d6;">--a-&lt;name&gt;-wash</span> and <span style="font-family: ui-monospace, monospace; color: #d6d6d6;">--a-&lt;name&gt;-edge</span> keep deriving at 12% and 34%, so only the ten base hues change.
  </div>
</div>
${FOOT}`;
}

const files = {
    'Main.dc.html': screen(PALETTES[0]),
    'GraphiteDeep.dc.html': screen(PALETTES[1]),
    'GraphiteDeepest.dc.html': screen(PALETTES[2]),
    'Tokens.dc.html': tokens(),
    'canvas.json': JSON.stringify({
        artboards: [
            { file: 'Main.dc.html', x: 0, y: 0, w: 1440, h: 1340, title: '01 Graphite' },
            { file: 'GraphiteDeep.dc.html', x: 1560, y: 0, w: 1440, h: 1340, title: '02 Graphite Deep' },
            { file: 'GraphiteDeepest.dc.html', x: 3120, y: 0, w: 1440, h: 1340, title: '03 Graphite Deepest' },
            { file: 'Tokens.dc.html', x: 1560, y: 1520, w: 1440, h: 1020, title: 'Tokens', print: 'flow' },
        ],
        annotations: [
            { id: 'read-me', x: 0, y: 1520, w: 380, text: 'Three Graphites, each darker than the last. Same neutral hue, same four rungs — only the lightness moves, so the relationships hold all the way down. 03 stops at #0d0d0d rather than going to black.\n\nThe ten tertiaries sit lower and stronger than the first round. That is what buys a real red and a real purple: at the old lightness, hue 24 is salmon and hue 306 is lavender no matter what you name them.\n\nThe Features card carries the jade wash, Tech Stack the purple, and the popover is where all ten live. Every hex is on the sheet below.' },
        ],
        launch: { view: 'canvas' },
    }, null, 2) + '\n',
};

for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(OUT, name), body, 'utf8');
    console.log(`wrote ${name} (${body.length} bytes)`);
}
