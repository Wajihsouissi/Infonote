/**
 * Generates the Properties-panel layout study.
 *
 * Four artboards — what ships today, plus three directions — written from one
 * file so they share the app's real tokens and field primitives and cannot
 * drift apart. Edit here, re-run, re-seed the canvas.
 *
 *   node design/metadata-panel/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

/* Lifted from design-system.css and SidePeek/MetadataPanel .module.css so these
   are the app, not an impression of it. */
const T = {
    frame: '#191919',
    body: '#101010',
    card: '#1a1a1a',
    inset: '#141414',
    raised: '#242424',
    line: 'rgba(255,255,255,0.10)',
    lineStrong: 'rgba(255,255,255,0.18)',
    hover: 'rgba(255,255,255,0.08)',
    main: '#ffffff',
    soft: '#e6e6e6',
    faint: '#a3a3a3',
    accent: '#ff5040',
    jade: '#45df95',
    amber: '#f49b37',
    azure: '#4cbaf6',
    rControl: '8px',
    rMd: '12px',
    rSurface: '16px',
    rPanel: '32px',
    font: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "ui-monospace, 'SF Mono', Menlo, monospace",
};

const W = 620;
const H = 1180;

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

const helmet = () => `<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: ${T.font}; -webkit-font-smoothing: antialiased; }
    a { color: ${T.accent}; text-decoration: none; }
    a:hover { color: #ff7566; }
  </style>
</helmet>`;

const icon = (paths, size = 16, stroke = 1.6) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const I = {
    image: icon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5 3 3L15 12l5 5"/>'),
    close: icon('<path d="M6 6l12 12M18 6L6 18"/>', 15),
    chevron: icon('<path d="m6 9 6 6 6-6"/>', 15),
    calendar: icon('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 15),
    plus: icon('<path d="M12 5v14M5 12h14"/>', 14, 2),
    target: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', 20),
    check: icon('<path d="m4 12 5 5L20 6"/>', 14, 2.2),
    tag: icon('<path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.4"/>', 15),
    flag: icon('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 15),
    dot: icon('<circle cx="12" cy="12" r="5"/>', 12),
};

/* ---- shared chrome: the SidePeek shell every option lives in ---- */
const shell = (inner, { note }) => `<div style="position: relative; width: ${W}px; height: ${H}px; background: ${T.body}; color: ${T.main}; overflow: hidden; display: flex; flex-direction: column;">

  <div style="display: flex; align-items: center; justify-content: space-between; height: 44px; flex-shrink: 0; padding: 0 24px;">
    <span style="font-size: 12.5px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: ${T.soft};">Properties</span>
    <span style="display: grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; background: ${T.hover}; color: ${T.faint};">${I.close}</span>
  </div>

  <div style="flex: 1; min-height: 0; margin: 12px; padding: 26px 22px; border-radius: ${T.rPanel}; background: ${T.card}; overflow: hidden;">
    ${inner}
  </div>

  <div style="flex-shrink: 0; padding: 0 22px 14px; font-size: 11px; line-height: 1.5; color: #6f6f6f;">${note}</div>
</div>`;

/* ---- field primitives ---- */
const label = (text, extra = '') =>
    `<span style="font-size: 10px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; color: ${T.faint}; opacity: 0.75;">${text}${extra}</span>`;

const input = (value, { placeholder = false, icon: ic = '', height = 46 } = {}) =>
    `<div style="display: flex; align-items: center; gap: 9px; height: ${height}px; padding: 0 13px; border: 1px solid ${T.line}; border-radius: ${T.rMd}; background: ${T.inset}; color: ${placeholder ? T.faint : T.main}; font-size: 15px;">${ic ? `<span style="color: ${T.faint};">${ic}</span>` : ''}<span style="flex: 1; min-width: 0;">${value}</span></div>`;

const select = (value) =>
    `<div style="display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 13px; border: 1px solid ${T.line}; border-radius: ${T.rMd}; background: ${T.inset}; color: ${T.main}; font-size: 15px;"><span style="flex: 1;">${value}</span><span style="color: ${T.faint};">${I.chevron}</span></div>`;

const stackField = (name, control) =>
    `<div style="display: flex; flex-direction: column; gap: 5px;">${label(name)}${control}</div>`;

/* A value chip — the shared vocabulary of options B and C. */
const chip = (text, tone, ic = '') =>
    `<span style="display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: 999px; background: color-mix(in srgb, ${tone} 16%, transparent); border: 1px solid color-mix(in srgb, ${tone} 34%, transparent); color: ${tone}; font-size: 12.5px; font-weight: 600;">${ic}${text}</span>`;

const coverSlot = (h = 96) => `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; height: ${h}px; border: 1px dashed ${T.lineStrong}; border-radius: ${T.rSurface}; color: ${T.faint}; font-size: 13.5px;">${I.image}<span>Add Cover Image</span></div>`;

const titleRow = () => `<div style="display: flex; align-items: center; gap: 13px;">
      <span style="display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: ${T.rMd}; background: color-mix(in srgb, ${T.accent} 15%, transparent); color: ${T.accent};">${I.target}</span>
      <span style="font-size: 21px; font-weight: 600; letter-spacing: -0.014em;">Project Goal</span>
    </div>`;

const DESC = 'A comprehensive note-taking application with infinite canvas capabilities';

/* ---------------------------------------------------------------- current */
function current() {
    return `${HEAD}
${helmet()}
${shell(`<div style="display: flex; flex-direction: column; gap: 17px;">
      ${coverSlot()}
      ${titleRow()}
      ${stackField('Description', `<div style="min-height: 74px; padding: 10px 13px; border: 1px solid ${T.line}; border-radius: ${T.rMd}; background: ${T.inset}; font-size: 14.5px; line-height: 1.5; color: ${T.soft};">${DESC}</div>`)}
      <span style="height: 1px; background: ${T.line};"></span>
      ${stackField('Status', select('To Do'))}
      ${stackField('Priority', select('Medium'))}
      ${stackField('Tags', input('Add tag…', { placeholder: true }))}
      ${stackField('Date', input('02/09/2026, 9:54', { icon: I.calendar }))}
      ${stackField('Due date', input('Set due date', { placeholder: true, icon: I.calendar }))}
      ${stackField('Tasks', `<div style="font-size: 13.5px; line-height: 1.5; color: ${T.faint};">No tasks yet. Type a checklist in the note, or add one here.</div>`)}
    </div>`, { note: 'Today. Every field is a label over a full-width control, so eight short values fill 1100px and the panel always scrolls — Tasks sits below the fold on any laptop.' })}
${FOOT}`;
}

/* ------------------------------------------------------------- option A */
/* Two columns: the label moves beside the value instead of above it. */
function optionA() {
    const row = (name, value, { tone = null, ic = '', muted = false } = {}) => `<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 14px; min-height: 38px;">
        ${label(name)}
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14.5px; color: ${muted ? T.faint : T.main};">${tone ? chip(value, tone, ic) : `${ic ? `<span style="color: ${T.faint};">${ic}</span>` : ''}<span>${value}</span>`}</div>
      </div>`;

    return `${HEAD}
${helmet()}
${shell(`<div style="display: flex; flex-direction: column; gap: 20px;">
      ${coverSlot(88)}
      ${titleRow()}
      <div style="font-size: 14.5px; line-height: 1.55; color: ${T.soft};">${DESC}</div>

      <div style="display: flex; flex-direction: column; border-top: 1px solid ${T.line};">
        <div style="padding: 6px 0; border-bottom: 1px solid ${T.line};">${row('Status', 'To Do', { tone: T.azure, ic: I.dot })}</div>
        <div style="padding: 6px 0; border-bottom: 1px solid ${T.line};">${row('Priority', 'Medium', { tone: T.amber, ic: I.flag })}</div>
        <div style="padding: 6px 0; border-bottom: 1px solid ${T.line};">${row('Tags', 'Add tag…', { muted: true, ic: I.tag })}</div>
        <div style="padding: 6px 0; border-bottom: 1px solid ${T.line};">${row('Date', '2 Sep 2026, 9:54', { ic: I.calendar })}</div>
        <div style="padding: 6px 0; border-bottom: 1px solid ${T.line};">${row('Due date', 'Set due date', { muted: true, ic: I.calendar })}</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          ${label('Tasks')}
          <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: ${T.faint};">${I.plus}Add</span>
        </div>
        <div style="font-size: 13.5px; line-height: 1.5; color: ${T.faint};">No tasks yet. Type a checklist in the note, or add one here.</div>
      </div>
    </div>`, { note: 'A — Property sheet. Label beside value on one 38px row, hairline-separated. Eight fields cost ~300px instead of ~700, so everything including Tasks is above the fold. Values read as text until you click one.' })}
${FOOT}`;
}

/* ------------------------------------------------------------- option B */
/* Segmented: the app's own Tabs component splits the panel into three short
   screens instead of one long one. */
function optionB() {
    const tab = (name, active) =>
        `<span style="display: inline-flex; align-items: center; justify-content: center; height: 30px; padding: 0 15px; border-radius: ${T.rControl}; background: ${active ? T.raised : 'transparent'}; color: ${active ? T.main : T.faint}; font-size: 13px; font-weight: 600;">${name}</span>`;

    return `${HEAD}
${helmet()}
${shell(`<div style="display: flex; flex-direction: column; gap: 20px;">
      ${coverSlot(88)}
      ${titleRow()}

      <div style="display: inline-flex; align-items: center; gap: 3px; padding: 3px; border-radius: ${T.rMd}; background: ${T.inset}; align-self: flex-start;">
        ${tab('Details', true)}${tab('Planning', false)}${tab('Tasks', false)}
      </div>

      <div style="display: flex; flex-direction: column; gap: 17px;">
        ${stackField('Description', `<div style="min-height: 92px; padding: 11px 13px; border: 1px solid ${T.line}; border-radius: ${T.rMd}; background: ${T.inset}; font-size: 14.5px; line-height: 1.55; color: ${T.soft};">${DESC}</div>`)}
        ${stackField('Tags', `<div style="display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-height: 46px; padding: 8px 11px; border: 1px solid ${T.line}; border-radius: ${T.rMd}; background: ${T.inset};">${chip('research', T.jade)}${chip('beta', T.azure)}<span style="font-size: 14px; color: ${T.faint};">Add tag…</span></div>`)}
      </div>

      <div style="margin-top: 4px; padding: 15px 16px; border-radius: ${T.rSurface}; background: ${T.inset}; border: 1px solid ${T.line};">
        <div style="margin-bottom: 10px;">${label('On the other tabs')}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${chip('To Do', T.azure, I.dot)}${chip('Medium', T.amber, I.flag)}${chip('2 Sep', '#a3a3a3', I.calendar)}${chip('0/0 tasks', '#a3a3a3', I.check)}
        </div>
        <div style="margin-top: 11px; font-size: 12.5px; line-height: 1.5; color: ${T.faint};">A read-only summary so switching tabs is never the only way to see what is set.</div>
      </div>
    </div>`, { note: 'B — Segmented. Details / Planning / Tasks, using the app’s own Tabs control. No screen scrolls, and Tasks gets real room. The cost: two of the three groups are always hidden, so the summary strip exists to soften that.' })}
${FOOT}`;
}

/* ------------------------------------------------------------- option C */
/* Summary-first: reading is the common case, so the panel opens as a set of
   value chips and only expands into controls on demand. */
function optionC() {
    const disclosure = (name, value, open = false) => `<div style="border-bottom: 1px solid ${T.line};">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 46px;">
          <span style="font-size: 14.5px; color: ${T.soft};">${name}</span>
          <span style="display: flex; align-items: center; gap: 8px; color: ${value ? T.main : T.faint}; font-size: 14.5px;">${value || 'Empty'}<span style="color: ${T.faint}; transform: rotate(${open ? '0' : '-90'}deg); display: inline-flex;">${I.chevron}</span></span>
        </div>
        ${open ? `<div style="padding: 2px 0 14px;">${select('To Do')}</div>` : ''}
      </div>`;

    return `${HEAD}
${helmet()}
${shell(`<div style="display: flex; flex-direction: column; gap: 22px;">
      <div style="position: relative; height: 132px; border-radius: ${T.rSurface}; overflow: hidden; background:
          radial-gradient(circle at 24% 18%, oklch(from ${T.accent} 0.72 0.17 h) 0%, transparent 58%),
          radial-gradient(circle at 82% 34%, oklch(from ${T.accent} 0.62 0.16 calc(h + 34)) 0%, transparent 56%),
          ${T.inset};">
        <div style="position: absolute; left: 16px; bottom: 14px; display: flex; align-items: center; gap: 12px;">
          <span style="display: grid; place-items: center; width: 40px; height: 40px; border-radius: ${T.rMd}; background: rgba(0,0,0,0.34); color: #fff;">${I.target}</span>
          <span style="font-size: 20px; font-weight: 600; letter-spacing: -0.014em; color: #fff;">Project Goal</span>
        </div>
        <span style="position: absolute; right: 12px; top: 12px; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: 999px; background: rgba(0,0,0,0.4); color: #fff; font-size: 12px; font-weight: 600;">${I.image}Change</span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${chip('To Do', T.azure, I.dot)}${chip('Medium', T.amber, I.flag)}${chip('2 Sep 2026', '#a3a3a3', I.calendar)}${chip('No due date', '#6f6f6f', I.calendar)}${chip('Add tag', '#6f6f6f', I.plus)}
      </div>

      <div style="font-size: 14.5px; line-height: 1.55; color: ${T.soft};">${DESC}</div>

      <div style="display: flex; flex-direction: column;">
        <div style="margin-bottom: 6px;">${label('Properties')}</div>
        ${disclosure('Status', chip('To Do', T.azure, I.dot), true)}
        ${disclosure('Priority', chip('Medium', T.amber, I.flag))}
        ${disclosure('Date', '2 Sep 2026, 9:54')}
        ${disclosure('Due date', '')}
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          ${label('Tasks')}
          <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: ${T.faint};">${I.plus}Add</span>
        </div>
        <div style="font-size: 13.5px; line-height: 1.5; color: ${T.faint};">No tasks yet. Type a checklist in the note, or add one here.</div>
      </div>
    </div>`, { note: 'C — Summary first. The cover becomes a hero that carries the card’s own colour, and the values you glance at most are chips at the top. Full controls open in place. Most visits are reads, not edits.' })}
${FOOT}`;
}

const files = {
    'Main.dc.html': optionA(),
    'OptionB.dc.html': optionB(),
    'OptionC.dc.html': optionC(),
    'Current.dc.html': current(),
    'canvas.json': JSON.stringify({
        artboards: [
            { file: 'Current.dc.html', x: 0, y: 0, w: W, h: H, title: 'Today' },
            { file: 'Main.dc.html', x: 740, y: 0, w: W, h: H, title: 'A · Property sheet' },
            { file: 'OptionB.dc.html', x: 1480, y: 0, w: W, h: H, title: 'B · Segmented' },
            { file: 'OptionC.dc.html', x: 2220, y: 0, w: W, h: H, title: 'C · Summary first' },
        ],
        annotations: [
            { id: 'brief', x: 0, y: 1280, w: 620, text: 'Three directions for the Properties panel, each pushing a different axis.\n\nA — density. The label moves beside the value, so the whole card fits on one screen.\nB — segmentation. Three short tabs instead of one long column, using the Tabs control the app already has.\nC — progressive disclosure. Chips for the values you scan; controls open only when you edit.\n\n"Today" on the left is the current panel at the same scale, for comparison. All four use the real Ink tokens.' },
        ],
        launch: { view: 'canvas' },
    }, null, 2) + '\n',
};

for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(OUT, name), body, 'utf8');
    console.log(`wrote ${name} (${body.length} bytes)`);
}
