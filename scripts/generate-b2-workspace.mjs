/**
 * generate-b2-workspace.mjs
 * ---------------------------------------------------------------------------
 * Builds a complete "Deutsch B2" study workspace as a chnk-it canvas graph
 * ({ nodes, edges }) and writes it to deutsch-b2-workspace.json.
 *
 * The graph deliberately exercises the whole content model:
 *   - node types ..... note, block, fused-note, kanban
 *   - card views ..... expanded, medium, icon, titleview, chromeless
 *   - block types .... text, heading1..3, bullet, numbered, todo, toggle,
 *                      callout, quote, table, divider, image, video, file,
 *                      page, container, columns, code, color, link, ai
 *   - structure ...... nested canvas (page blocks -> child nodes), kanban
 *                      children, labelled/styled edges
 *
 * Load it with:  node scripts/generate-b2-workspace.mjs
 * then import the JSON into the app (see the companion loader snippet).
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// tiny builders
// ---------------------------------------------------------------------------

let seq = 0;
const bid = () => `b2blk-${(++seq).toString(36)}`;

/** Block factory. */
const B = (type, content = '', metadata, indent) => {
    const block = { id: bid(), type, content };
    if (metadata) block.metadata = metadata;
    if (indent) block.indent = indent;
    return block;
};

const text = (c) => B('text', c);
const h1 = (c) => B('heading1', c);
const h2 = (c) => B('heading2', c);
const h3 = (c) => B('heading3', c);
const bullet = (c, indent) => B('bullet', c, undefined, indent);
const numbered = (c) => B('numbered', c);
const quote = (c) => B('quote', c);
const divider = () => B('divider', '');
const callout = (c, icon = 'Lightbulb') => B('callout', c, { icon });
const code = (c, language = 'text') => B('code', c, { language });
const todo = (c, checked = false, dueDate) =>
    B('todo', c, dueDate ? { checked, dueDate } : { checked });
const table = (rows, alignments) =>
    B('table', '', {
        rows,
        alignments: alignments || rows[0].map(() => 'left'),
    });
const toggle = (summary, children, collapsed = true) => {
    const head = B('toggle', summary, { isCollapsed: collapsed });
    return [head, ...children.map((c) => ({ ...c, indent: (c.indent || 0) + 1 }))];
};
const columns = (cols) =>
    B('columns', '', {
        count: cols.length,
        columns: cols.map((content, i) => ({ id: `${bid()}-col${i}`, content })),
    });
const container = (children) => B('container', '', { blocks: children });
const color = (hex, name) => B('color', hex, { name });
const page = (title, nodeId) => B('page', title, { nodeId });
const ai = () => B('ai', '');

const link = (url, title, description, favicon) =>
    B('link', url, {
        title,
        description,
        favicon,
        displayMode: 'bookmark',
        isEmbeddable: false,
        isLoading: false,
    });

const svg = (body, w = 560, h = 260) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
            `<rect width="${w}" height="${h}" rx="14" fill="#FAF7F2"/>` +
            body +
            '</svg>',
    );

const image = (dataUri, height = 220) => B('image', dataUri, { height, alignment: 'center' });
const video = () => B('video', '', { alignment: 'center' });

const textFile = (name, body) => {
    const uri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(body);
    return B('file', uri, { name, type: 'text/plain', size: Buffer.byteLength(body, 'utf8') });
};

const ISO = (d) => new Date(d + 'T09:00:00.000Z').toISOString();
const CREATED = ISO('2026-07-20');
const UPDATED = ISO('2026-07-28');

/** Note card factory. */
const note = (id, { label, x, y, w = 656, h = 1104, view = 'expanded', content = [], parentId, ...rest }) => ({
    id,
    type: 'note',
    position: { x, y },
    style: { width: w, height: h },
    // parentId is a NODE-level field (which canvas the card lives on), never
    // part of data — putting it in data leaves the card on the root canvas.
    ...(parentId ? { parentId } : {}),
    data: {
        label,
        viewMode: view,
        content,
        showIcon: true,
        createdAt: CREATED,
        updatedAt: UPDATED,
        ...rest,
    },
});

const blockNode = (id, x, y, w, h, block, color) => ({
    id,
    type: 'block',
    position: { x, y },
    style: { width: w, height: h },
    data: { content: [block], isStandaloneBlock: true, ...(color ? { color } : {}) },
});

const edge = (source, target, label, opts = {}) => ({
    id: `e-${source}--${target}`,
    source,
    target,
    type: 'centered',
    data: {
        parentId: opts.parentId ?? null,
        edgeType: opts.edgeType || 'bezier',
        lineStyle: opts.lineStyle || 'solid',
        markerEndType: opts.markerEnd || 'arrow',
        ...(label ? { label } : {}),
        ...(opts.color ? { color: opts.color } : {}),
        ...(opts.animated ? { animated: true } : {}),
        ...(opts.strokeWidth ? { strokeWidth: opts.strokeWidth } : {}),
    },
});

const nodes = [];
const edges = [];

// ---------------------------------------------------------------------------
// SVG illustrations (self-contained, no network)
// ---------------------------------------------------------------------------

const INK = '#1C1A17';
const MUTED = '#6B655C';
const ACCENT = '#F95D2E';

const satzklammerSVG = svg(
    `<text x="28" y="42" font-family="Georgia,serif" font-size="17" fill="${INK}">Die Satzklammer — das Rückgrat des deutschen Satzes</text>
     <line x1="28" y1="58" x2="532" y2="58" stroke="${MUTED}" stroke-width="1" opacity="0.35"/>
     <text x="28" y="100" font-family="Georgia,serif" font-size="15" fill="${MUTED}">Position 1</text>
     <text x="150" y="100" font-family="Georgia,serif" font-size="15" fill="${ACCENT}">Verb 1</text>
     <text x="270" y="100" font-family="Georgia,serif" font-size="15" fill="${MUTED}">Mittelfeld</text>
     <text x="430" y="100" font-family="Georgia,serif" font-size="15" fill="${ACCENT}">Verb 2</text>
     <text x="28" y="132" font-family="Georgia,serif" font-size="17" fill="${INK}">Ich</text>
     <text x="150" y="132" font-family="Georgia,serif" font-size="17" font-weight="bold" fill="${ACCENT}">hätte</text>
     <text x="240" y="132" font-family="Georgia,serif" font-size="17" fill="${INK}">den Kurs früher</text>
     <text x="430" y="132" font-family="Georgia,serif" font-size="17" font-weight="bold" fill="${ACCENT}">gebucht.</text>
     <path d="M175 146 C 175 186, 452 186, 452 146" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="5,4"/>
     <text x="238" y="205" font-family="Georgia,serif" font-size="13" fill="${MUTED}">alles Weitere steht INNERHALB der Klammer</text>
     <text x="28" y="238" font-family="Georgia,serif" font-size="13" fill="${MUTED}">Nebensatz: beide Verbteile wandern ans Ende — „…, weil ich den Kurs früher gebucht hätte."</text>`,
    560,
    260,
);

const wiederholungSVG = svg(
    `<text x="28" y="40" font-family="Georgia,serif" font-size="17" fill="${INK}">Wiederholungsintervalle (verteiltes Lernen)</text>
     <line x1="48" y1="200" x2="524" y2="200" stroke="${MUTED}" stroke-width="1.5"/>
     <line x1="48" y1="200" x2="48" y2="66" stroke="${MUTED}" stroke-width="1.5"/>
     <path d="M48 78 C 130 150, 190 186, 300 192 C 380 196, 450 197, 520 198" fill="none" stroke="${MUTED}" stroke-width="2" opacity="0.45"/>
     <path d="M48 78 C 92 132, 110 150, 128 152 L128 92 C 176 140, 200 162, 232 164 L232 100 C 300 150, 330 172, 372 174 L372 112 C 452 158, 480 180, 520 182" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>
     <circle cx="128" cy="92" r="4" fill="${ACCENT}"/><circle cx="232" cy="100" r="4" fill="${ACCENT}"/>
     <circle cx="372" cy="112" r="4" fill="${ACCENT}"/><circle cx="520" cy="182" r="4" fill="${ACCENT}"/>
     <text x="112" y="228" font-family="Georgia,serif" font-size="12" fill="${MUTED}">Tag 1</text>
     <text x="216" y="228" font-family="Georgia,serif" font-size="12" fill="${MUTED}">Tag 3</text>
     <text x="356" y="228" font-family="Georgia,serif" font-size="12" fill="${MUTED}">Tag 7</text>
     <text x="494" y="228" font-family="Georgia,serif" font-size="12" fill="${MUTED}">Tag 21</text>
     <text x="12" y="70" font-family="Georgia,serif" font-size="12" fill="${MUTED}" transform="rotate(-90 12 70)">Behalten</text>
     <text x="28" y="252" font-family="Georgia,serif" font-size="12" fill="${MUTED}">grau = ohne Wiederholung · orange = jede Wiederholung flacht die Vergessenskurve ab</text>`,
    560,
    262,
);

const passivSVG = svg(
    `<text x="24" y="38" font-family="Georgia,serif" font-size="16" fill="${INK}">Passiv — die Formel</text>
     <rect x="24" y="58" width="132" height="44" rx="10" fill="#FFFFFF" stroke="${MUTED}" stroke-width="1"/>
     <text x="42" y="86" font-family="Georgia,serif" font-size="15" fill="${INK}">werden</text>
     <text x="168" y="86" font-family="Georgia,serif" font-size="20" fill="${ACCENT}">+</text>
     <rect x="196" y="58" width="176" height="44" rx="10" fill="#FFFFFF" stroke="${MUTED}" stroke-width="1"/>
     <text x="214" y="86" font-family="Georgia,serif" font-size="15" fill="${INK}">Partizip II</text>
     <text x="24" y="132" font-family="Georgia,serif" font-size="14" fill="${MUTED}">Der Antrag wird geprüft.</text>
     <text x="24" y="158" font-family="Georgia,serif" font-size="14" fill="${MUTED}">Der Antrag wurde geprüft.</text>
     <text x="24" y="184" font-family="Georgia,serif" font-size="14" fill="${MUTED}">Der Antrag ist geprüft worden.</text>`,
    400,
    210,
);

// ===========================================================================
// ROOT CANVAS
// ===========================================================================

const N_HUB = 'b2-hub';
const N_KONJ = 'b2-konjunktiv';
const N_PASSIV = 'b2-passiv';
const N_KONNEKT = 'b2-konnektoren';
const N_ARBEIT = 'b2-wortschatz-arbeit';
const N_UMWELT = 'b2-wortschatz-umwelt';
const N_SCHREIBEN = 'b2-schreiben';
const N_SPRECHEN = 'b2-sprechen';
const N_FEHLER = 'b2-fehlerlog';
const N_RESSOURCEN = 'b2-ressourcen';
const N_MODELLSATZ = 'b2-modellsatz';
const N_NOMINAL = 'b2-nominalisierung';
const N_SRS = 'b2-wiederholung';
const N_IDIOME = 'b2-idiome';
const N_PRUEFTAG = 'b2-pruefungstag';
const N_MERKSATZ = 'b2-merksatz';
const N_KANBAN = 'b2-kanban';
const N_FUSED = 'b2-fused-lernmethoden';

// --- 1. Hub -----------------------------------------------------------------

nodes.push(
    note(N_HUB, {
        label: 'Deutsch B2 — Lernzentrale',
        x: 0,
        y: 0,
        icon: 'Compass',
        description: 'Startpunkt: Ziel, Prüfungsformat, Wochenplan und Meilensteine.',
        tags: ['B2', 'Übersicht', 'Goethe'],
        priority: 'high',
        status: 'in-progress',
        progress: 35,
        category: 'Steuerung',
        startDate: ISO('2026-07-20'),
        dueDate: ISO('2026-12-05'),
        showMetadata: true,
        content: [
            h1('Deutsch B2 — Lernzentrale'),
            text(
                'Mein Arbeitsplatz für die Vorbereitung auf das **Goethe-Zertifikat B2**. Jede Karte auf dieser Fläche ist ein Baustein: Grammatik links, Wortschatz in der Mitte, Fertigkeiten rechts.',
            ),
            callout(
                'Ziel: Goethe-Zertifikat B2 am 5. Dezember 2026 — alle vier Module in einem Durchgang. Ausgangslage: solides B1+, Hörverstehen ist die Schwachstelle, Schreiben das größte Ausbaupotenzial.',
                'Target',
            ),
            divider(),
            h2('Prüfungsformat auf einen Blick'),
            table([
                ['Modul', 'Dauer', 'Aufgaben', 'Bestanden ab'],
                ['Lesen', '65 Min', '5 Teile — Blog, Zeitung, Meinung, Anleitung, Anzeigen', '60 %'],
                ['Hören', '40 Min', '4 Teile — Alltagsgespräch, Radio, Diskussion, Vortrag', '60 %'],
                ['Schreiben', '75 Min', '2 Aufgaben — Forumsbeitrag + halbformale Nachricht', '60 %'],
                ['Sprechen', '15 Min', '3 Teile — Präsentation, Diskussion, gemeinsame Planung', '60 %'],
            ]),
            text(
                'Jedes Modul ist **einzeln bestehbar** und einzeln wiederholbar. Das ändert die Strategie: kein Modul „mitschleifen", sondern das schwächste zuerst hochziehen.',
            ),
            divider(),
            h2('Wochenrhythmus'),
            table([
                ['Tag', 'Fokus', 'Konkrete Übung', 'Dauer'],
                ['Mo', 'Lesen', '1 Artikel (Zeit / SZ) + 10 neue Wörter ins Fehlerlogbuch', '45 Min'],
                ['Di', 'Schreiben', '1 Forumsbeitrag, 180 Wörter, unter Zeitdruck', '40 Min'],
                ['Mi', 'Sprechen', '5-Minuten-Monolog aufnehmen und selbst anhören', '30 Min'],
                ['Do', 'Grammatik', 'Ein Thema aus der Grammatik-Spalte, aktiv produzieren', '45 Min'],
                ['Fr', 'Hören', 'Podcast ohne Transkript, danach mit Transkript prüfen', '30 Min'],
                ['Sa', 'Sprechen', 'Tandem-Gespräch, nur auf Deutsch', '60 Min'],
                ['So', 'Wiederholung', 'Fehlerlogbuch durchgehen, Karten neu einplanen', '30 Min'],
            ]),
            callout(
                'Regel: täglich mindestens 15 Minuten Hören — auch an freien Tagen. Hörverstehen verfällt schneller als jede andere Fertigkeit.',
                'Headphones',
            ),
            divider(),
            h2('Meilensteine'),
            todo('Prüfungstermin beim Goethe-Institut buchen', true, ISO('2026-08-03')),
            todo('Woche 1–4: Konjunktiv II und Passiv aktiv beherrschen', false, ISO('2026-08-24')),
            todo('Woche 5–8: acht Forumsbeiträge schreiben und korrigieren lassen', false, ISO('2026-09-21')),
            todo('Woche 9–10: zwei komplette Modellsätze unter Prüfungsbedingungen', false, ISO('2026-10-12')),
            todo('Woche 11–12: dreimal pro Woche Tandem-Gespräch, nur auf Deutsch', false, ISO('2026-11-09')),
            todo('Letzte Woche: nur wiederholen, nichts Neues mehr anfangen', false, ISO('2026-11-30')),
            divider(),
            h2('Schnellzugriff'),
            link(
                'https://www.goethe.de/de/spr/prf/gzb2.html',
                'Goethe-Zertifikat B2 — Prüfungsübersicht',
                'Offizielle Modulbeschreibung, Modellsätze und Bewertungskriterien.',
                'https://www.goethe.de/favicon.ico',
            ),
            quote(
                'Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt. — Ludwig Wittgenstein',
            ),
        ],
    }),
);

// --- 2. Konjunktiv II -------------------------------------------------------

nodes.push(
    note(N_KONJ, {
        label: 'Konjunktiv II — Höflichkeit, Irrealität, Wunsch',
        x: 728,
        y: 0,
        icon: 'Layers',
        description: 'Bildung, die acht Originalformen, vier Funktionen, typische Fehler.',
        tags: ['Grammatik', 'B2', 'Konjunktiv'],
        priority: 'high',
        status: 'in-progress',
        progress: 60,
        category: 'Grammatik',
        content: [
            h1('Konjunktiv II'),
            text(
                'Der Konjunktiv II ist auf B2 kein Nebenthema, sondern das Register für **Höflichkeit, Distanz und Hypothese** — und damit die Form, die im Sprechen Teil 3 und im Schreiben den Unterschied macht.',
            ),
            callout(
                'Faustregel: Wer B1 spricht, sagt „Ich will …". Wer B2 spricht, sagt „Ich würde vorschlagen, dass …".',
                'Lightbulb',
            ),
            h2('1. Bildung — zwei Wege'),
            columns([
                [
                    h3('Gegenwart'),
                    code('würde + Infinitiv\n\nIch würde den Termin verschieben.\nWir würden lieber später anfangen.', 'text'),
                    text('Der Normalfall. Funktioniert bei praktisch jedem Verb.'),
                ],
                [
                    h3('Vergangenheit'),
                    code('hätte / wäre + Partizip II\n\nIch hätte den Termin verschoben.\nWir wären lieber später gekommen.', 'text'),
                    text('Es gibt **nur eine** Vergangenheitsform — kein „würde gemacht haben".'),
                ],
            ]),
            h2('2. Die Originalformen, die man wirklich braucht'),
            text('Bei diesen Verben klingt „würde" ungelenk. Sie werden auswendig gelernt:'),
            table([
                ['Infinitiv', 'Präteritum', 'Konjunktiv II', 'Beispielsatz'],
                ['sein', 'war', 'wäre', 'Es wäre besser, wir würden früher anfangen.'],
                ['haben', 'hatte', 'hätte', 'Hätten Sie kurz Zeit für mich?'],
                ['werden', 'wurde', 'würde', 'Ich würde das anders lösen.'],
                ['können', 'konnte', 'könnte', 'Könnten Sie mir das bitte erklären?'],
                ['müssen', 'musste', 'müsste', 'Eigentlich müsste ich längst zu Hause sein.'],
                ['dürfen', 'durfte', 'dürfte', 'Das dürfte etwa zwei Stunden dauern.'],
                ['sollen', 'sollte', 'sollte', 'Man sollte das nicht überstürzen.'],
                ['wissen', 'wusste', 'wüsste', 'Ich wüsste nicht, was dagegen spricht.'],
                ['geben', 'gab', 'gäbe', 'Es gäbe da noch eine andere Möglichkeit.'],
                ['kommen', 'kam', 'käme', 'Das käme mir sehr gelegen.'],
            ]),
            callout(
                'Merkhilfe: Präteritum nehmen, Umlaut aufsetzen, -e anhängen. wurde → würde, kam → käme, gab → gäbe.',
                'Zap',
            ),
            h2('3. Vier Funktionen — und ihre Signalwörter'),
            numbered('**Höflichkeit.** Könnten Sie … / Dürfte ich … / Wären Sie so freundlich, … — der Standard in jeder halbformalen Nachricht.'),
            numbered('**Irrealer Bedingungssatz.** Wenn ich mehr Zeit hätte, würde ich einen Abendkurs besuchen. → Beide Satzteile im Konjunktiv II.'),
            numbered('**Irrealer Wunsch.** Wenn ich nur früher angefangen hätte! / Hätte ich doch früher angefangen! — immer mit *doch*, *nur* oder *bloß*.'),
            numbered('**Vorsichtige Behauptung.** Das dürfte kaum zu schaffen sein. / Man könnte argumentieren, dass … — rettet jede Diskussion, in der man sich nicht festlegen will.'),
            ...toggle('Typische Fehler — hier verliere ich Punkte', [
                bullet('❌ *Ich würde gehabt haben* → ✅ **Ich hätte gehabt.** Es gibt keine zusammengesetzte Zukunftsform im Konjunktiv II.'),
                bullet('❌ *Wenn ich Zeit hätte, ich würde kommen* → ✅ **…, würde ich kommen.** Nach dem Nebensatz steht das Verb sofort.'),
                bullet('❌ *Wenn ich das gewusst hätte, hätte ich anders gehandelt haben* → ✅ **… hätte ich anders gehandelt.**'),
                bullet('❌ *Ich wünschte, ich habe mehr geübt* → ✅ **Ich wünschte, ich hätte mehr geübt.** Nach „ich wünschte" folgt zwingend Konjunktiv II.'),
                bullet('❌ *Könnte ich bitte …?* als Bitte an Freunde — zu steif. Unter Freunden reicht **Kannst du …?**'),
            ]),
            ...toggle('Fünf Sätze, die ich in der Prüfung sicher können will', [
                bullet('Ich hätte da noch eine Nachfrage.'),
                bullet('An Ihrer Stelle würde ich zunächst die Kosten prüfen.'),
                bullet('Es wäre sinnvoll, das Thema noch einmal aufzugreifen.'),
                bullet('Ohne diese Erfahrung wäre ich nie auf die Idee gekommen.'),
                bullet('Das ließe sich sicher anders lösen.'),
            ]),
            quote(
                'Wenn ich nicht angefangen hätte, hätte ich nie erfahren, wie weit ich komme. — mein Merksatz für den irrealen Bedingungssatz',
            ),
        ],
    }),
);

// --- 3. Passiv --------------------------------------------------------------

nodes.push(
    note(N_PASSIV, {
        label: 'Passiv & Passiversatzformen',
        x: 1456,
        y: 0,
        icon: 'RefreshCw',
        description: 'Vorgangs- und Zustandspassiv, Passiv mit Modalverben, vier Ersatzformen.',
        tags: ['Grammatik', 'B2', 'Passiv'],
        priority: 'high',
        status: 'todo',
        progress: 25,
        category: 'Grammatik',
        content: [
            h1('Passiv & Passiversatzformen'),
            text(
                'Das Passiv ist die Sprache von Berichten, Anleitungen und Sachtexten — also von genau den Textsorten, die im Modul **Lesen** auftauchen. Wer es nicht erkennt, verliert Zeit.',
            ),
            image(passivSVG, 200),
            h2('1. Vorgangspassiv — die Zeitformen'),
            table([
                ['Zeit', 'Aktiv', 'Passiv'],
                ['Präsens', 'Man prüft den Antrag.', 'Der Antrag **wird** geprüft.'],
                ['Präteritum', 'Man prüfte den Antrag.', 'Der Antrag **wurde** geprüft.'],
                ['Perfekt', 'Man hat den Antrag geprüft.', 'Der Antrag **ist** geprüft **worden**.'],
                ['Plusquamperfekt', 'Man hatte den Antrag geprüft.', 'Der Antrag **war** geprüft **worden**.'],
                ['Futur I', 'Man wird den Antrag prüfen.', 'Der Antrag **wird** geprüft **werden**.'],
            ]),
            callout(
                'Der klassische Stolperstein: im Perfekt heißt es „worden", nicht „geworden". „Geworden" gehört zum Vollverb *werden* (Er ist Lehrer geworden).',
                'AlertTriangle',
            ),
            h2('2. Vorgangspassiv vs. Zustandspassiv'),
            columns([
                [
                    h3('Vorgang — werden'),
                    text('Der Laden **wird** um 20 Uhr geschlossen.'),
                    text('Es passiert gerade etwas. Antwort auf: *Was geschieht?*'),
                ],
                [
                    h3('Zustand — sein'),
                    text('Der Laden **ist** seit 20 Uhr geschlossen.'),
                    text('Das Ergebnis zählt. Antwort auf: *Wie ist es jetzt?*'),
                ],
            ]),
            h2('3. Passiv mit Modalverben'),
            code(
                'Aktiv   : Man muss den Antrag bis Freitag einreichen.\nPassiv  : Der Antrag muss bis Freitag eingereicht werden.\n\nFormel  : Modalverb + Partizip II + werden\n\nPerfekt : Der Antrag hat eingereicht werden müssen.   (selten, aber prüfungsrelevant)',
                'text',
            ),
            h2('4. Passiversatzformen — vier Wege, dasselbe zu sagen'),
            text('Alle vier bedeuten: *Das kann/muss gemacht werden.* Wer sie aktiv benutzt, klingt sofort eine Stufe höher.'),
            columns([
                [
                    h3('sich lassen'),
                    text('Das Problem **lässt sich** lösen.'),
                    text('= kann gelöst werden'),
                ],
                [
                    h3('sein + zu + Infinitiv'),
                    text('Das Formular **ist** bis Freitag **abzugeben**.'),
                    text('= muss abgegeben werden'),
                ],
                [
                    h3('-bar / -lich'),
                    text('Die Schrift ist kaum **lesbar**.'),
                    text('= kann kaum gelesen werden'),
                ],
            ]),
            container([
                h3('Mini-Drill — Aktiv → Passiv'),
                numbered('Man renoviert das Gebäude. → Das Gebäude wird renoviert.'),
                numbered('Man hat die Regeln geändert. → Die Regeln sind geändert worden.'),
                numbered('Man kann den Fehler leicht beheben. → Der Fehler lässt sich leicht beheben.'),
                numbered('Man muss die Unterlagen bis Montag einreichen. → Die Unterlagen sind bis Montag einzureichen.'),
                text('*Immer prüfen: Wird „man" gestrichen? Wandert das Akkusativobjekt in den Nominativ?*'),
            ]),
            h2('5. Wann kein Passiv möglich ist'),
            bullet('Verben ohne Akkusativobjekt: *schlafen, gehen, bleiben* — kein persönliches Passiv.'),
            bullet('Reflexive Verben: *sich freuen* → kein Passiv.'),
            bullet('haben, kennen, wissen, bekommen — passivunfähig.'),
            bullet('Unpersönliches Passiv ist trotzdem möglich: **Es wird viel diskutiert.** / **Hier wird nicht geraucht.**'),
            callout('Im Modul Lesen zählt nur eines: Passiv beim Überfliegen erkennen. „wird … +ge…t" am Satzende ist das Signal.', 'Eye'),
        ],
    }),
);

// --- 4. Konnektoren ---------------------------------------------------------

nodes.push(
    note(N_KONNEKT, {
        label: 'Konnektoren & Satzbau',
        x: 2184,
        y: 0,
        icon: 'Link',
        description: 'Semantische Gruppen, drei Positionstypen, Satzklammer, Umformungen.',
        tags: ['Grammatik', 'B2', 'Satzbau'],
        priority: 'high',
        status: 'in-progress',
        progress: 45,
        category: 'Grammatik',
        content: [
            h1('Konnektoren & Satzbau'),
            text(
                'Auf B2 wird nicht mehr belohnt, *dass* man Sätze verbindet, sondern *wie* präzise. Derselbe Inhalt, drei Register: **weil** (neutral), **da** (schriftlich), **zumal** (steigernd).',
            ),
            image(satzklammerSVG, 240),
            h2('1. Die drei Positionstypen — der eigentliche Prüfungsstoff'),
            table([
                ['Typ', 'Wortstellung', 'Beispiele', 'Beispielsatz'],
                ['Nebensatzkonnektor', 'Verb ans **Ende**', 'weil, da, obwohl, damit, sodass, während, indem, falls', 'Ich lerne mehr, **weil** die Prüfung näher **rückt**.'],
                ['Hauptsatzkonnektor (Pos. 0)', 'Verb bleibt auf **Position 2**', 'denn, und, aber, oder, sondern', 'Ich lerne mehr, **denn** die Prüfung **rückt** näher.'],
                ['Adverbialkonnektor (Pos. 1)', 'Verb **direkt danach**', 'deshalb, trotzdem, dennoch, folglich, jedoch, allerdings', 'Die Prüfung rückt näher, **deshalb lerne** ich mehr.'],
            ]),
            callout(
                'Der häufigste Fehler in meinen Texten: *„Trotzdem ich müde war…"*. **Trotzdem** ist ein Adverb, kein Nebensatzkonnektor. Richtig: **Obwohl** ich müde war, … / Ich war müde. **Trotzdem** habe ich weitergemacht.',
                'AlertTriangle',
            ),
            h2('2. Nach Bedeutung sortiert'),
            table([
                ['Bedeutung', 'Nebensatz', 'Hauptsatz / Adverb', 'Präposition'],
                ['Grund (kausal)', 'weil, da, zumal', 'denn, nämlich', 'wegen + Gen., aufgrund + Gen.'],
                ['Gegensatz (konzessiv)', 'obwohl, obgleich, wenngleich', 'trotzdem, dennoch, allerdings', 'trotz + Gen.'],
                ['Folge (konsekutiv)', 'sodass, so …, dass', 'folglich, infolgedessen, daher', 'infolge + Gen.'],
                ['Absicht (final)', 'damit, um … zu', '—', 'zwecks + Gen., zu + Dat.'],
                ['Bedingung (konditional)', 'wenn, falls, sofern', 'sonst, andernfalls', 'bei + Dat., im Falle + Gen.'],
                ['Zeit (temporal)', 'während, bevor, nachdem, seitdem, sobald', 'davor, danach, seitdem', 'während + Gen., nach + Dat.'],
                ['Art & Weise (modal)', 'indem, dadurch dass, ohne dass', 'so, dadurch', 'durch + Akk., mittels + Gen.'],
            ]),
            h2('3. Zweiteilige Konnektoren — der schnellste Punktgewinn'),
            code(
                'nicht nur …, sondern auch …   Nicht nur die Kosten, sondern auch die Zeit sprechen dagegen.\nentweder … oder …            Entweder wir starten jetzt, oder wir verschieben alles.\nweder … noch …               Ich habe weder Zeit noch Lust dazu.\nzwar …, aber …               Der Kurs ist zwar teuer, aber er lohnt sich.\nje …, desto …                Je länger ich übe, desto sicherer werde ich.\nsowohl … als auch …          Sowohl Lesen als auch Hören müssen trainiert werden.',
                'text',
            ),
            callout('„Je …, desto …" ist der eine Konnektor, bei dem beide Teile die Wortstellung ändern: je + Nebensatz (Verb ans Ende), desto + Verb auf Position 2. **Je mehr ich lese, desto leichter fällt mir das Schreiben.**', 'Star'),
            ...toggle('Umformungsübung: derselbe Inhalt, vier Strukturen', [
                bullet('**Weil** es stark regnete, blieb die Veranstaltung leer.'),
                bullet('Es regnete stark, **deshalb** blieb die Veranstaltung leer.'),
                bullet('Es regnete stark, **denn** … — ✗ falsch, *denn* leitet den Grund ein, nicht die Folge.'),
                bullet('**Wegen** des starken Regens blieb die Veranstaltung leer.'),
                bullet('Es regnete so stark, **dass** die Veranstaltung leer blieb.'),
            ]),
            ...toggle('Satzklammer in vier Sätzen', [
                bullet('Hauptsatz: Ich **habe** gestern den Antrag **abgegeben**.'),
                bullet('Frage: **Hast** du den Antrag schon **abgegeben**?'),
                bullet('Nebensatz: …, weil ich den Antrag **abgegeben habe**.'),
                bullet('Modalverb im Nebensatz: …, weil ich den Antrag **abgeben musste**.'),
            ]),
            quote('Ein Text wird nicht dadurch besser, dass er länger wird, sondern dadurch, dass seine Teile aufeinander zeigen.'),
        ],
    }),
);

// --- 5. Wortschatz Arbeit ---------------------------------------------------

nodes.push(
    note(N_ARBEIT, {
        label: 'Wortschatz: Arbeit & Beruf',
        x: 0,
        y: 1176,
        icon: 'Briefcase',
        description: 'Kernwortschatz, Artikel-Farbcode, Kollokationen, Wortfamilien.',
        tags: ['Wortschatz', 'B2', 'Arbeit'],
        priority: 'medium',
        status: 'in-progress',
        progress: 50,
        category: 'Wortschatz',
        content: [
            h1('Wortschatz: Arbeit & Beruf'),
            text(
                'Das mit Abstand häufigste Themenfeld in B2-Prüfungen: Bewerbung, Homeoffice, Work-Life-Balance, Weiterbildung. Wörter werden hier **nie einzeln** gelernt, sondern als Kollokation.',
            ),
            h2('1. Artikel-Farbcode'),
            text('Ich markiere jedes neue Nomen sofort mit seiner Farbe. Nach zwei Wochen sitzt der Artikel ohne Nachdenken.'),
            columns([
                [color('#2E6BE6', 'Blau — der'), text('**der** Arbeitgeber, der Vertrag, der Lebenslauf, der Anspruch, der Zuschuss')],
                [color('#D64545', 'Rot — die'), text('**die** Bewerbung, die Kündigung, die Fortbildung, die Vergütung, die Belastung')],
                [color('#2E9E5B', 'Grün — das'), text('**das** Gehalt, das Zeugnis, das Praktikum, das Betriebsklima, das Vorstellungsgespräch')],
            ]),
            h2('2. Kernwortschatz'),
            table([
                ['Wort', 'Artikel / Plural', 'Bedeutung', 'Beispielsatz'],
                ['Bewerbung', 'die, -en', 'Unterlagen für eine Stelle', 'Ich habe die Bewerbung gestern abgeschickt.'],
                ['Vorstellungsgespräch', 'das, -e', 'Interview mit dem Arbeitgeber', 'Das Vorstellungsgespräch verlief besser als erwartet.'],
                ['Weiterbildung', 'die, -en', 'Qualifizierung neben dem Beruf', 'Der Betrieb übernimmt die Kosten der Weiterbildung.'],
                ['Betriebsklima', 'das, (kein Pl.)', 'Stimmung im Team', 'Ein gutes Betriebsklima wiegt ein höheres Gehalt oft auf.'],
                ['Fachkräftemangel', 'der, (kein Pl.)', 'zu wenige qualifizierte Arbeitskräfte', 'Der Fachkräftemangel verschärft sich in der Pflege.'],
                ['Vereinbarkeit', 'die, (kein Pl.)', 'Beruf und Familie zusammenbringen', 'Die Vereinbarkeit von Familie und Beruf bleibt schwierig.'],
                ['Arbeitsbelastung', 'die, -en', 'Menge und Druck der Arbeit', 'Die Arbeitsbelastung hat spürbar zugenommen.'],
                ['Befristung', 'die, -en', 'zeitlich begrenzter Vertrag', 'Nach zwei Befristungen muss entfristet werden.'],
                ['Kündigungsfrist', 'die, -en', 'Zeit bis zum Vertragsende', 'Die Kündigungsfrist beträgt drei Monate zum Quartalsende.'],
                ['Homeoffice', 'das, (kein Pl.)', 'Arbeit von zu Hause', 'Zwei Tage Homeoffice pro Woche sind inzwischen Standard.'],
            ]),
            h2('3. Kollokationen — so werden die Wörter benutzt'),
            bullet('eine Stelle **antreten** / **ausschreiben** / **besetzen**'),
            bullet('einen Vertrag **abschließen** / **verlängern** / **auflösen**'),
            bullet('Verantwortung **übernehmen**, Aufgaben **delegieren**, Fristen **einhalten**'),
            bullet('unter Zeitdruck **stehen**, Überstunden **leisten**, Urlaub **beantragen**'),
            bullet('sich auf eine Stelle **bewerben** (+ Akk.), sich um eine Stelle **bemühen** (+ Akk.)'),
            bullet('von zu Hause **aus** arbeiten (nicht: *„in Hause"*)'),
            h2('4. Wortfamilie *arbeiten*'),
            code(
                'arbeiten          → die Arbeit, der Arbeiter, arbeitsam\nbearbeiten        → die Bearbeitung   (etwas verändern / bearbeiten)\nverarbeiten       → die Verarbeitung  (Rohstoffe, aber auch Erlebnisse)\nerarbeiten        → die Erarbeitung   (sich etwas mühsam aneignen)\nüberarbeiten      → die Überarbeitung (verbessern) / sich überarbeiten (zu viel tun)\nzusammenarbeiten  → die Zusammenarbeit',
                'text',
            ),
            callout(
                'Prüfungstrick: Wer im Sprechen ein Nomen nicht findet, umschreibt es mit dem Verb. „Die … äh … die Person, die mich eingestellt hat" ist besser als eine Pause.',
                'Mic',
            ),
            h2('5. Redemittel für die Diskussion'),
            bullet('Aus meiner Sicht überwiegen die Vorteile, weil …'),
            bullet('Man darf allerdings nicht übersehen, dass …'),
            bullet('Das hängt stark davon ab, ob …'),
            bullet('Ich kann das aus eigener Erfahrung bestätigen: …'),
        ],
    }),
);

// --- 6. Wortschatz Umwelt ---------------------------------------------------

nodes.push(
    note(N_UMWELT, {
        label: 'Wortschatz: Umwelt & Klima',
        x: 728,
        y: 1176,
        icon: 'Cloud',
        description: 'Kernwortschatz, Statistik-Redemittel, Argumentationsbausteine.',
        tags: ['Wortschatz', 'B2', 'Umwelt'],
        priority: 'medium',
        status: 'todo',
        progress: 20,
        category: 'Wortschatz',
        content: [
            h1('Wortschatz: Umwelt & Klima'),
            text(
                'Das zweite Standardthema — und das mit den meisten **Zahlen**. Wer Statistiken beschreiben kann, hat im Sprechen Teil 1 schon die halbe Note.',
            ),
            h2('1. Kernwortschatz'),
            table([
                ['Wort', 'Artikel / Plural', 'Bedeutung', 'Beispielsatz'],
                ['Klimawandel', 'der, (kein Pl.)', 'langfristige Änderung des Klimas', 'Der Klimawandel trifft ärmere Regionen zuerst.'],
                ['Nachhaltigkeit', 'die, (kein Pl.)', 'Ressourcen schonend nutzen', 'Nachhaltigkeit ist mehr als ein Werbewort.'],
                ['Treibhausgas', 'das, -e', 'Gas, das die Erwärmung verstärkt', 'Die Treibhausgase müssen drastisch sinken.'],
                ['Erneuerbare Energien', 'die (Pl.)', 'Wind, Sonne, Wasser', 'Erneuerbare Energien decken einen wachsenden Anteil.'],
                ['Verkehrswende', 'die, (kein Pl.)', 'Umbau des Verkehrssystems', 'Ohne Verkehrswende sind die Ziele nicht erreichbar.'],
                ['Feinstaub', 'der, (kein Pl.)', 'gesundheitsschädliche Partikel', 'Die Feinstaubbelastung überschreitet die Grenzwerte.'],
                ['Mülltrennung', 'die, (kein Pl.)', 'Abfall sortieren', 'Die Mülltrennung ist in Deutschland streng geregelt.'],
                ['Verbrauch', 'der, -e', 'wie viel genutzt wird', 'Der Pro-Kopf-Verbrauch ist leicht gesunken.'],
                ['Ressource', 'die, -n', 'natürlicher Rohstoff', 'Wasser wird vielerorts zur knappen Ressource.'],
                ['Kreislaufwirtschaft', 'die, (kein Pl.)', 'Wiederverwenden statt Wegwerfen', 'Die Kreislaufwirtschaft soll Abfall überflüssig machen.'],
            ]),
            h2('2. Statistik beschreiben — das Baukastensystem'),
            code(
                'EINLEITEN\n  Die Grafik / Das Schaubild zeigt, wie sich … zwischen 2010 und 2025 entwickelt hat.\n  Die Zahlen stammen vom Umweltbundesamt.\n\nENTWICKLUNG\n  … ist um 12 Prozent gestiegen / gesunken / zurückgegangen.\n  … hat sich seit 2015 nahezu verdoppelt / halbiert.\n  … blieb weitgehend konstant / stagnierte auf hohem Niveau.\n\nVERGLEICHEN\n  Im Vergleich zu 2010 liegt der Wert deutlich höher.\n  Während … zunimmt, geht … zurück.\n  Den größten Anteil macht … aus, den kleinsten …\n\nDEUTEN\n  Das lässt darauf schließen, dass …\n  Ein möglicher Grund dafür könnte sein, dass …\n  Auffällig ist vor allem, dass …',
                'text',
            ),
            callout(
                'Prozent-Fallen: „um 10 Prozent gestiegen" (Veränderung) ≠ „auf 10 Prozent gestiegen" (Endwert). Und: **Prozentpunkte**, wenn man zwei Prozentwerte vergleicht.',
                'AlertTriangle',
            ),
            h2('3. Argumentationsbausteine'),
            bullet('**Pro:** Langfristig zahlt sich der Umstieg aus, auch wenn er kurzfristig teuer ist.'),
            bullet('**Contra:** Die Kosten treffen vor allem Haushalte mit geringem Einkommen.'),
            bullet('**Einräumen:** Zwar sind die Investitionen hoch, aber die Folgekosten des Nichtstuns sind höher.'),
            bullet('**Abwägen:** Entscheidend ist, ob die Belastung sozial gerecht verteilt wird.'),
            bullet('**Beispiel:** In meiner Heimatstadt wurde der Nahverkehr ausgebaut — die Innenstadt ist seitdem spürbar ruhiger.'),
            h2('4. Aufnahme meiner Statistik-Beschreibung'),
            text('Hier lade ich die Aufnahme hoch, sobald ich sie gemacht habe — dann kann ich mich beim Wiederholen selbst hören.'),
            video(),
            quote('Wir haben die Erde von unseren Kindern nur geborgt. — geflügeltes Wort, gutes Schlusszitat für Sprechen Teil 1'),
        ],
    }),
);

// --- 7. Schreiben -----------------------------------------------------------

const redemittelDatei = [
    'REDEMITTEL — SCHREIBEN B2 (Forumsbeitrag)',
    '==========================================',
    '',
    'EINLEITUNG',
    '  In dem Artikel geht es um die Frage, ob ...',
    '  Der Beitrag hat mich zum Nachdenken gebracht, weil ...',
    '  Ich verfolge die Diskussion seit Längerem und moechte einen Punkt ergaenzen.',
    '',
    'EIGENE MEINUNG',
    '  Meiner Ansicht nach ...',
    '  Ich bin der Ueberzeugung, dass ...',
    '  Dem kann ich nur teilweise zustimmen.',
    '',
    'BEISPIEL / ERFAHRUNG',
    '  Ein Beispiel aus meinem eigenen Umfeld: ...',
    '  Als ich selbst ... habe, ist mir aufgefallen, dass ...',
    '',
    'GEGENARGUMENT EINRAEUMEN',
    '  Natuerlich laesst sich einwenden, dass ...',
    '  Zwar trifft es zu, dass ..., allerdings ...',
    '',
    'SCHLUSS',
    '  Zusammenfassend laesst sich sagen, dass ...',
    '  Aus diesen Gruenden plaediere ich dafuer, ...',
].join('\n');

nodes.push(
    note(N_SCHREIBEN, {
        label: 'Schreiben: Forumsbeitrag in 75 Minuten',
        x: 1456,
        y: 1176,
        icon: 'PenTool',
        description: 'Aufbau, Gerüst zum Abschreiben, Bewertungsraster, Zeitplan.',
        tags: ['Schreiben', 'B2', 'Prüfung'],
        priority: 'urgent',
        status: 'in-progress',
        progress: 40,
        category: 'Fertigkeit',
        dueDate: ISO('2026-09-21'),
        content: [
            h1('Schreiben: Forumsbeitrag'),
            text(
                'Aufgabe 1 im Modul Schreiben: ein Kommentar in einem Online-Forum, **etwa 180 Wörter**, empfohlene Zeit **50 von 75 Minuten**. Die restlichen 25 Minuten gehören Aufgabe 2, der halbformalen Nachricht.',
            ),
            callout(
                'Zeitplan, an den ich mich halte: 5 Min planen · 30 Min schreiben · 10 Min überarbeiten · 5 Min Rechtschreibung. Die 10 Minuten Überarbeitung sind der Unterschied zwischen 70 % und 85 %.',
                'Clock',
            ),
            h2('1. Aufbau in fünf Schritten'),
            numbered('**Einleitung** — Bezug auf den Ausgangstext, eine These. *Nicht* mit „Ich möchte schreiben über…" beginnen.'),
            numbered('**Eigene Position** — klar Stellung beziehen. Prüfer suchen aktiv nach einer erkennbaren Meinung.'),
            numbered('**Begründung + Beispiel** — je ein Argument, jeweils mit einem konkreten Beispiel belegt.'),
            numbered('**Gegenargument einräumen und entkräften** — der Baustein, der B1 von B2 trennt.'),
            numbered('**Schluss** — Zusammenfassung oder Appell. Kein neues Argument mehr.'),
            h2('2. Gerüst zum Abschreiben'),
            code(
                'In dem Beitrag von @[Nutzername] geht es um die Frage, ob [Thema].\nDas Thema beschäftigt mich, weil [persönlicher Bezug].\n\nMeiner Ansicht nach [These]. Dafür spricht vor allem, dass [Argument 1].\nEin Beispiel aus meinem eigenen Umfeld: [konkrete Situation].\n\nHinzu kommt, dass [Argument 2]. Gerade weil [Begründung], halte ich es für\nnotwendig, dass [Forderung].\n\nNatürlich lässt sich einwenden, dass [Gegenargument]. Dieser Punkt ist\nberechtigt, allerdings [Entkräftung].\n\nZusammenfassend lässt sich sagen, dass [These wiederholen].\nDeshalb plädiere ich dafür, [Appell].',
                'markdown',
            ),
            h2('3. Bewertungsraster — was zählt'),
            table([
                ['Kriterium', 'Gewicht', 'Was der Prüfer sucht', 'Mein Status'],
                ['Erfüllung', '25 %', 'Alle Leitpunkte behandelt, Wortzahl erreicht', 'sicher'],
                ['Kohärenz', '25 %', 'Konnektoren, roter Faden, Absätze', 'gut'],
                ['Wortschatz', '25 %', 'Präzision, Variation, keine Wiederholungen', 'ausbaufähig'],
                ['Strukturen', '25 %', 'Nebensätze, Passiv, Konjunktiv II, korrekte Endungen', 'ausbaufähig'],
            ]),
            callout(
                'Wortzahl: unter 150 Wörter wird abgewertet, über 220 kostet nur Zeit. Ich zähle nach dem Schreiben eine Zeile ab und multipliziere — schneller als Wort für Wort.',
                'Info',
            ),
            h2('4. Meine Redemittel-Liste zum Mitnehmen'),
            textFile('Redemittel-Schreiben-B2.txt', redemittelDatei),
            h2('5. Fehler, die ich immer wieder mache'),
            bullet('Zu viele Sätze mit *„Ich denke, dass…"* — variieren mit *Meiner Ansicht nach*, *Ich bin überzeugt*, *Aus meiner Sicht*.'),
            bullet('Absätze fehlen. Vier Absätze sind das Minimum, sonst leidet die Note für Kohärenz.'),
            bullet('Das Gegenargument wird vergessen — der teuerste Einzelfehler.'),
            bullet('Anrede und Gruß in der halbformalen Nachricht vergessen (Aufgabe 2).'),
            quote('Schreib den ersten Satz so, dass der Prüfer weiß, wo du stehst. Alles danach ist Beweisführung.'),
        ],
    }),
);

// --- 8. Sprechen ------------------------------------------------------------

nodes.push(
    note(N_SPRECHEN, {
        label: 'Sprechen: Redemittel für alle drei Teile',
        x: 2184,
        y: 1176,
        icon: 'Mic',
        description: 'Präsentation, Diskussion, gemeinsame Planung — fertige Bausteine.',
        tags: ['Sprechen', 'B2', 'Redemittel'],
        priority: 'urgent',
        status: 'review',
        progress: 55,
        category: 'Fertigkeit',
        content: [
            h1('Sprechen — 15 Minuten, drei Teile'),
            text(
                'Der Prüfungsteil, in dem Vorbereitung am meisten bringt: Die Bausteine sind vorhersehbar. Wer 20 Sätze auswendig kann, gewinnt Denkzeit für den Inhalt.',
            ),
            callout(
                'Wichtigste Regel: **niemals stumm werden.** Ein Füllsatz („Da muss ich kurz überlegen…") kostet null Punkte, eine Pause von zehn Sekunden sehr wohl.',
                'Mic',
            ),
            h2('Teil 1 — Präsentation (ca. 4 Min)'),
            container([
                h3('Ablaufgerüst'),
                bullet('**Einstieg:** In meiner Präsentation geht es um … / Ich möchte Ihnen kurz … vorstellen.'),
                bullet('**Gliederung:** Ich gehe in drei Schritten vor: zuerst …, dann …, abschließend …'),
                bullet('**Eigene Erfahrung:** In meinem Heimatland ist es üblich, dass …'),
                bullet('**Vor- und Nachteile:** Für … spricht …, dagegen spricht allerdings …'),
                bullet('**Abschluss:** Zusammenfassend würde ich sagen, dass … Vielen Dank für Ihre Aufmerksamkeit.'),
            ]),
            ...toggle('Teil 2 — Diskussion: zustimmen, widersprechen, nachfragen', [
                bullet('**Zustimmen:** Da stimme ich Ihnen völlig zu. / Das sehe ich genauso, zumal …'),
                bullet('**Teilweise zustimmen:** In diesem Punkt gebe ich Ihnen recht, allerdings …'),
                bullet('**Höflich widersprechen:** Das kann ich so nicht ganz unterschreiben. / Da bin ich anderer Meinung, denn …'),
                bullet('**Nachfragen:** Könnten Sie das etwas genauer ausführen? / Habe ich Sie richtig verstanden, dass …?'),
                bullet('**Zeit gewinnen:** Das ist eine gute Frage — lassen Sie mich kurz überlegen.'),
                bullet('**Unterbrechen:** Wenn ich hier kurz einhaken darf …'),
            ]),
            ...toggle('Teil 3 — Gemeinsam etwas planen', [
                bullet('**Vorschlagen:** Wie wäre es, wenn wir … / Ich würde vorschlagen, dass wir zuerst …'),
                bullet('**Nachgeben:** Einverstanden, machen wir es so. / Damit kann ich gut leben.'),
                bullet('**Ablehnen:** Das halte ich für schwierig, weil … Vielleicht wäre es besser, …'),
                bullet('**Alternative:** Eine andere Möglichkeit wäre, … / Alternativ könnten wir …'),
                bullet('**Abschließen:** Halten wir also fest: … / Dann wären wir uns einig.'),
            ]),
            ...toggle('Füllwörter, die Zeit kaufen (und nicht dumm klingen)', [
                bullet('Also, im Grunde genommen …'),
                bullet('Wenn ich ehrlich bin, …'),
                bullet('Das kommt ganz darauf an, …'),
                bullet('Da fällt mir spontan ein Beispiel ein: …'),
                bullet('Wie soll ich sagen …'),
            ]),
            h2('Aussprache — meine drei Baustellen'),
            numbered('**ch** — zwei Varianten: *ich* (weich, nach e/i/ä/ö/ü) vs. *Buch* (hart, nach a/o/u/au).'),
            numbered('**Endung -ig** wird *-ich* gesprochen: *wichtig* → „wichtich".'),
            numbered('**Satzmelodie:** Aussagesatz fällt am Ende, Entscheidungsfrage steigt. Ohne das klingt alles wie eine Frage.'),
            h2('KI-Helfer für Übungsfragen'),
            text('Hier lasse ich mir spontane Diskussionsfragen zum Tagesthema generieren, wenn mir selbst nichts einfällt:'),
            ai(),
        ],
    }),
);

// --- 9. Fehlerlogbuch -------------------------------------------------------

nodes.push(
    note(N_FEHLER, {
        label: 'Fehlerlogbuch',
        x: 0,
        y: 2352,
        w: 656,
        h: 768,
        icon: 'AlertTriangle',
        description: 'Jeder korrigierte Fehler landet hier — mit Regel und Wiedervorlage.',
        tags: ['Wiederholung', 'B2'],
        priority: 'high',
        status: 'in-progress',
        progress: 65,
        category: 'System',
        content: [
            h1('Fehlerlogbuch'),
            text(
                'Der wichtigste Baustein des ganzen Systems. Regel: **Ein Fehler wird erst dann gestrichen, wenn ich ihn dreimal richtig produziert habe** — nicht, wenn ich ihn verstanden habe.',
            ),
            table([
                ['Mein Fehler', 'Korrekt', 'Regel dahinter', 'Datum'],
                ['*Ich freue mich auf dich zu sehen.*', 'Ich freue mich **darauf**, dich zu sehen.', 'Präpositionaladverb + Infinitivsatz', '21.07.'],
                ['*Trotzdem ich müde war…*', '**Obwohl** ich müde war, …', 'trotzdem = Adverb, obwohl = Konnektor', '22.07.'],
                ['*Ich habe ihn gestern getroffen in der Stadt.*', 'Ich habe ihn gestern **in der Stadt** getroffen.', 'Satzklammer — Partizip steht am Ende', '23.07.'],
                ['*Ich würde gehabt haben*', 'Ich **hätte gehabt**', 'Konjunktiv II Vergangenheit ist einteilig', '24.07.'],
                ['*wegen dem Regen*', '**wegen des Regens**', 'wegen + Genitiv (schriftsprachlich)', '25.07.'],
                ['*Ich bin interessiert in Politik.*', 'Ich **interessiere mich für** Politik.', 'feste Verb-Präposition', '26.07.'],
                ['*Das Buch, was ich gelesen habe*', 'Das Buch, **das** ich gelesen habe', 'Relativpronomen richtet sich nach dem Nomen', '27.07.'],
                ['*Seit zwei Jahren lernte ich Deutsch.*', 'Seit zwei Jahren **lerne** ich Deutsch.', 'seit + Präsens bei andauernder Handlung', '28.07.'],
            ]),
            divider(),
            h2('Wiedervorlage'),
            todo('Präpositionaladverbien (darauf, damit, dafür) — 20 Sätze bilden', true, ISO('2026-07-25')),
            todo('Genitivpräpositionen (wegen, trotz, während, aufgrund) drillen', false, ISO('2026-08-02')),
            todo('Verben mit fester Präposition — Liste auf 40 Einträge bringen', false, ISO('2026-08-09')),
            todo('Relativsätze mit Präposition (mit dem, für die, auf das)', false, ISO('2026-08-16')),
            callout('Sonntags 30 Minuten: Tabelle von oben durchgehen, laut sprechen, nicht nur lesen. Stilles Lesen fühlt sich produktiv an und bringt fast nichts.', 'RefreshCw'),
        ],
    }),
);

// --- 10. Ressourcen ---------------------------------------------------------

nodes.push(
    note(N_RESSOURCEN, {
        label: 'Ressourcen & Medien',
        x: 728,
        y: 2352,
        w: 656,
        h: 768,
        icon: 'Bookmark',
        description: 'Quellen, die wirklich B2-Niveau treffen — plus Wiederholungslogik.',
        tags: ['Ressourcen', 'B2'],
        priority: 'low',
        status: 'done',
        progress: 100,
        category: 'System',
        content: [
            h1('Ressourcen & Medien'),
            text('Weniger Quellen, dafür regelmäßig. Vier reichen — mehr führt nur zum Sammeln statt zum Lernen.'),
            link(
                'https://www.dw.com/de/deutsch-lernen/s-2055',
                'DW — Deutsch lernen',
                'Nachrichten in drei Geschwindigkeiten, Videoserien und Grammatikkurse bis C1. Kostenlos.',
                'https://www.dw.com/favicon.ico',
            ),
            link(
                'https://www.nachrichtenleicht.de/',
                'Nachrichtenleicht — Deutschlandfunk',
                'Wochennachrichten in vereinfachter Sprache. Guter Einstieg, wenn der Tagesschau-Text zu dicht ist.',
                'https://www.nachrichtenleicht.de/favicon.ico',
            ),
            link(
                'https://www.goethe.de/de/spr/ueb.html',
                'Goethe-Institut — Deutsch üben',
                'Kostenlose Übungen und die offiziellen Modellsätze zu jedem Prüfungsteil.',
                'https://www.goethe.de/favicon.ico',
            ),
            link(
                'https://www.deutschlandfunk.de/podcasts-100.html',
                'Deutschlandfunk — Podcasts',
                'Echtes Sprechtempo, ohne Lernvereinfachung. Ab Woche 6 der Härtetest fürs Hörverstehen.',
                'https://www.deutschlandfunk.de/favicon.ico',
            ),
            divider(),
            h2('Warum Wiederholung wichtiger ist als neues Material'),
            image(wiederholungSVG, 230),
            text(
                'Ohne Wiederholung ist nach einer Woche das meiste weg. Vier kurze Wiederholungen (Tag 1, 3, 7, 21) schlagen jede lange Lernsession — deshalb liegt der Sonntag im Wochenplan fest auf Wiederholung.',
            ),
            callout('Regel gegen das Sammeln: Eine neue Quelle darf nur dazukommen, wenn eine alte rausfliegt.', 'Filter'),
        ],
    }),
);

// --- 11. Modellsatz-Training (nested canvas parent) -------------------------

const N_MS_LESEN = 'b2-ms-lesen';
const N_MS_HOEREN = 'b2-ms-hoeren';
const N_MS_AUSWERTUNG = 'b2-ms-auswertung';
const N_MS_BLOCK_TIMER = 'b2-ms-block-timer';
const N_MS_BLOCK_REGEL = 'b2-ms-block-regel';
const N_MS_FUSED = 'b2-ms-fused';

nodes.push(
    note(N_MODELLSATZ, {
        label: 'Modellsatz-Training (Unterordner)',
        x: 1456,
        y: 2352,
        w: 432,
        h: 432,
        icon: 'Folder',
        description: 'Doppelklick öffnet die eigene Unterfläche mit den Auswertungen.',
        tags: ['Prüfung', 'B2', 'Unterordner'],
        priority: 'medium',
        status: 'in-progress',
        progress: 30,
        category: 'Prüfung',
        content: [
            page('Modellsatz 1 — Lesen', N_MS_LESEN),
            page('Modellsatz 1 — Hören', N_MS_HOEREN),
            page('Auswertung & Konsequenzen', N_MS_AUSWERTUNG),
        ],
    }),
);

// children of the nested canvas
nodes.push(
    note(N_MS_LESEN, {
        label: 'Modellsatz 1 — Lesen',
        x: 0,
        y: 0,
        w: 432,
        h: 544,
        icon: 'BookOpen',
        description: '22 von 30 Punkten — Teil 4 kostet die meisten Punkte.',
        tags: ['Modellsatz', 'Lesen'],
        status: 'done',
        progress: 100,
        parentId: N_MODELLSATZ,
        content: [
            h2('Modellsatz 1 — Lesen'),
            text('Durchgang am 26.07.2026, unter Zeit: 65 Minuten, kein Wörterbuch.'),
            table([
                ['Teil', 'Textsorte', 'Punkte', 'Zeit'],
                ['1', 'Blogtexte zuordnen', '8 / 9', '12 Min'],
                ['2', 'Zeitungsartikel — Multiple Choice', '5 / 6', '15 Min'],
                ['3', 'Meinungen zuordnen', '4 / 7', '14 Min'],
                ['4', 'Kommentar — Lückentext', '3 / 6', '18 Min'],
                ['5', 'Anzeigen / Regeln', '2 / 2', '5 Min'],
            ]),
            callout('Teil 4 ist die Baustelle: Der Lückentext prüft Konnektoren und Präpositionen, nicht Inhalt. Das ist reine Grammatik — also trainierbar.', 'Target'),
            bullet('Zeit reichte knapp — Teil 3 hat zu viel gekostet.'),
            bullet('Nächstes Mal: Teil 5 zuerst, dann Teil 1. Sichere Punkte einsammeln, bevor die Uhr drückt.'),
        ],
    }),
);

nodes.push(
    note(N_MS_HOEREN, {
        label: 'Modellsatz 1 — Hören',
        x: 504,
        y: 0,
        w: 432,
        h: 544,
        icon: 'Headphones',
        description: '17 von 30 Punkten — das schwächste Modul, klar unter Bestehensgrenze.',
        tags: ['Modellsatz', 'Hören'],
        status: 'review',
        progress: 60,
        priority: 'urgent',
        parentId: N_MODELLSATZ,
        content: [
            h2('Modellsatz 1 — Hören'),
            text('Durchgang am 27.07.2026. **17 / 30 — nicht bestanden.** Das ist das Modul, das den Termin gefährdet.'),
            table([
                ['Teil', 'Format', 'Punkte', 'Problem'],
                ['1', 'Alltagsgespräch, einmal hören', '5 / 10', 'Zahlen und Uhrzeiten überhört'],
                ['2', 'Radiobeitrag, zweimal hören', '6 / 6', 'kein Problem'],
                ['3', 'Diskussion, wer sagt was', '3 / 6', 'Sprecher nicht auseinandergehalten'],
                ['4', 'Vortrag, Notizen ergänzen', '3 / 8', 'zu langsam mitgeschrieben'],
            ]),
            callout('Diagnose: Nicht der Wortschatz fehlt, sondern die Geschwindigkeit. Ich übersetze noch im Kopf mit.', 'AlertTriangle'),
            h3('Gegenmaßnahme'),
            numbered('Täglich 15 Minuten Podcast bei **1,0×**, ohne Transkript — erst danach mitlesen.'),
            numbered('Zahlendiktate: 20 Uhrzeiten, Preise und Datumsangaben pro Woche.'),
            numbered('Shadowing: Satz hören, sofort nachsprechen, ohne den Sinn zu prüfen.'),
        ],
    }),
);

nodes.push(
    note(N_MS_AUSWERTUNG, {
        label: 'Auswertung & Konsequenzen',
        x: 1008,
        y: 0,
        w: 432,
        h: 544,
        icon: 'Activity',
        description: 'Was der erste Modellsatz für den Plan bedeutet.',
        tags: ['Modellsatz', 'Auswertung'],
        status: 'in-progress',
        progress: 45,
        parentId: N_MODELLSATZ,
        content: [
            h2('Auswertung Modellsatz 1'),
            table([
                ['Modul', 'Punkte', 'Prozent', 'Bestanden?'],
                ['Lesen', '22 / 30', '73 %', 'ja'],
                ['Hören', '17 / 30', '57 %', 'nein'],
                ['Schreiben', '19 / 30', '63 %', 'knapp'],
                ['Sprechen', '21 / 28', '75 %', 'ja'],
            ]),
            h3('Konsequenzen für den Wochenplan'),
            todo('Hören von 1× auf 2× täglich hochsetzen (morgens + abends je 15 Min)', true),
            todo('Lesen Teil 4 gezielt üben: 10 Lückentexte in zwei Wochen', false, ISO('2026-08-11')),
            todo('Schreiben: Überarbeitungsphase auf 15 Minuten verlängern', false, ISO('2026-08-04')),
            todo('Modellsatz 2 als Vergleichsmessung', false, ISO('2026-09-06')),
            callout('Entscheidung: Der Prüfungstermin bleibt. Hören ist ein Trainingsproblem, kein Niveauproblem — vier Monate reichen.', 'Check'),
        ],
    }),
);

nodes.push(
    blockNode(
        N_MS_BLOCK_TIMER,
        252,
        624,
        432,
        160,
        callout('Prüfungsbedingungen heißt: Handy aus, ein Blatt Papier, Timer läuft, kein Zurückblättern nach Ablauf.', 'Clock'),
    ),
);

nodes.push(
    blockNode(
        N_MS_BLOCK_REGEL,
        756,
        624,
        432,
        160,
        quote('Ein Modellsatz, den man mit Wörterbuch macht, misst nichts. — Regel Nr. 1'),
    ),
);

nodes.push({
    id: N_MS_FUSED,
    type: 'fused-note',
    position: { x: 504, y: 840 },
    style: { width: 656, height: 320 },
    parentId: N_MODELLSATZ,
    data: {
        content: [
            h3('Ablauf eines Modellsatz-Tages'),
            numbered('08:00 Lesen (65 Min) — ohne Pause durchziehen.'),
            numbered('09:15 Hören (40 Min) — Audio nur so oft, wie die Aufgabe erlaubt.'),
            numbered('10:15 Schreiben (75 Min) — handschriftlich, wie in der echten Prüfung.'),
            numbered('11:45 Sprechen — mit Tandempartner oder Aufnahme, 15 Min.'),
            text('Erst am **nächsten** Tag auswerten. Direkt danach ist man zu erschöpft, um ehrlich zu sein.'),
        ],
    },
});

// fix parentId on the two nested block nodes
nodes.find((n) => n.id === N_MS_BLOCK_TIMER).parentId = N_MODELLSATZ;
nodes.find((n) => n.id === N_MS_BLOCK_REGEL).parentId = N_MODELLSATZ;

// nested-canvas edges
edges.push(
    edge(N_MS_LESEN, N_MS_AUSWERTUNG, 'fließt ein', { parentId: N_MODELLSATZ, lineStyle: 'dashed' }),
    edge(N_MS_HOEREN, N_MS_AUSWERTUNG, 'fließt ein', { parentId: N_MODELLSATZ, lineStyle: 'dashed', color: '#F95D2E' }),
    edge(N_MS_AUSWERTUNG, N_MS_FUSED, 'nächster Durchgang', { parentId: N_MODELLSATZ }),
    edge(N_MS_BLOCK_TIMER, N_MS_FUSED, '', { parentId: N_MODELLSATZ, edgeType: 'smoothstep', markerEnd: 'circle' }),
    edge(N_MS_BLOCK_REGEL, N_MS_FUSED, '', { parentId: N_MODELLSATZ, edgeType: 'smoothstep', markerEnd: 'circle' }),
);

// --- 12/13. medium cards ----------------------------------------------------

nodes.push(
    note(N_NOMINAL, {
        label: 'Nominalisierung',
        x: 1960,
        y: 2352,
        w: 208,
        h: 208,
        view: 'medium',
        icon: 'Type',
        description: 'Verb → Nomen: der Registerwechsel für formelle Texte.',
        tags: ['Grammatik', 'Stil'],
        status: 'todo',
        category: 'Grammatik',
        content: [
            h3('Nominalisierung ↔ Verbalisierung'),
            text('Formelle Texte nominalisieren, gesprochene Sprache verbalisiert. Beides muss ich in beide Richtungen können.'),
            columns([
                [
                    text('**Verbal (gesprochen)**'),
                    bullet('Weil die Preise gestiegen sind, …'),
                    bullet('Nachdem wir das geprüft hatten, …'),
                    bullet('Damit die Kosten sinken, …'),
                ],
                [
                    text('**Nominal (schriftlich)**'),
                    bullet('Wegen des Preisanstiegs …'),
                    bullet('Nach der Prüfung …'),
                    bullet('Zur Senkung der Kosten …'),
                ],
            ]),
            callout('Signalwörter für Nominalstil: Genitivpräpositionen (wegen, trotz, während, aufgrund, mittels) + Nomen auf -ung, -heit, -keit, -nis.', 'Lightbulb'),
        ],
    }),
);

nodes.push(
    note(N_SRS, {
        label: 'Wiederholungsplan',
        x: 2240,
        y: 2352,
        w: 208,
        h: 208,
        view: 'medium',
        icon: 'RefreshCw',
        description: 'Intervalle 1 / 3 / 7 / 21 Tage — der Sonntagstermin.',
        tags: ['System', 'Wiederholung'],
        status: 'in-progress',
        progress: 70,
        category: 'System',
        content: [
            h3('Wiederholung nach Intervallen'),
            table([
                ['Intervall', 'Was', 'Wie lange'],
                ['Tag 1', 'neue Wörter laut lesen + je 1 Satz', '10 Min'],
                ['Tag 3', 'nur die Wörter, die gehakt haben', '8 Min'],
                ['Tag 7', 'in einen eigenen Text einbauen', '15 Min'],
                ['Tag 21', 'mündlich abfragen lassen', '10 Min'],
            ]),
            todo('Sonntag 19:00 — feste Wiederholungsstunde', true),
            todo('Karten, die 3× sitzen, aus dem Stapel nehmen', false),
        ],
    }),
);

// --- 14. icon card ----------------------------------------------------------

nodes.push(
    note(N_IDIOME, {
        label: 'Redewendungen',
        x: 1960,
        y: 2632,
        w: 96,
        h: 96,
        view: 'icon',
        icon: 'Star',
        description: 'Zehn Wendungen, die im Sprechen sofort auffallen.',
        tags: ['Wortschatz', 'Idiome'],
        color: '#F2B705',
        content: [
            h3('Redewendungen für Fortgeschrittene'),
            bullet('**etwas auf die lange Bank schieben** — aufschieben'),
            bullet('**die Daumen drücken** — Glück wünschen'),
            bullet('**ins Wasser fallen** — nicht stattfinden'),
            bullet('**den Nagel auf den Kopf treffen** — genau richtig liegen'),
            bullet('**mit dem Kopf durch die Wand wollen** — stur sein'),
            bullet('**das Handtuch werfen** — aufgeben'),
            bullet('**jemandem reinen Wein einschenken** — die Wahrheit sagen'),
            bullet('**unter vier Augen** — zu zweit, vertraulich'),
            bullet('**etwas aus dem Ärmel schütteln** — mühelos schaffen'),
            bullet('**auf dem Schlauch stehen** — gerade nicht verstehen'),
            callout('Höchstens zwei pro Gespräch. Wer zu viele Redewendungen stapelt, klingt auswendig gelernt.', 'AlertTriangle'),
        ],
    }),
);

// --- 15. titleview card -----------------------------------------------------

nodes.push(
    note(N_PRUEFTAG, {
        label: 'Prüfungstag — Checkliste',
        x: 2128,
        y: 2632,
        w: 432,
        h: 96,
        view: 'titleview',
        icon: 'CheckSquare',
        description: '5. Dezember 2026',
        tags: ['Prüfung'],
        priority: 'urgent',
        dueDate: ISO('2026-12-05'),
        content: [
            h3('Prüfungstag — Checkliste'),
            todo('Personalausweis / Reisepass'),
            todo('Anmeldebestätigung ausgedruckt'),
            todo('Zwei Kugelschreiber, blau oder schwarz'),
            todo('Wasser und etwas zu essen für die Pause'),
            todo('Eine Stunde vorher da sein — nicht auf die letzte Bahn setzen'),
            todo('Kein neues Material am Vorabend — nur das Fehlerlogbuch überfliegen'),
            callout('Zwischen den Modulen nicht mit anderen über die Lösungen sprechen. Das kostet nur Nerven fürs nächste Modul.', 'Shield'),
        ],
    }),
);

// --- 16. chromeless card ----------------------------------------------------

nodes.push(
    note(N_MERKSATZ, {
        label: 'Merksatz',
        x: 2128,
        y: 2800,
        w: 432,
        h: 112,
        view: 'chromeless',
        showIcon: false,
        content: [
            text(
                '**Nicht mehr lernen — anders lernen.** Produzieren schlägt Wiedererkennen: sprechen, schreiben, laut lesen. Alles, was nur „angeschaut" wird, ist morgen wieder weg.',
            ),
        ],
    }),
);

// --- 17. standalone block nodes: Nebensatz-Mindmap --------------------------

const MB = {
    root: 'b2-mb-root',
    kausal: 'b2-mb-kausal',
    konzessiv: 'b2-mb-konzessiv',
    final: 'b2-mb-final',
    konsekutiv: 'b2-mb-konsekutiv',
    temporal: 'b2-mb-temporal',
    modal: 'b2-mb-modal',
    codeExample: 'b2-mb-code',
    warnung: 'b2-mb-warnung',
    farbe: 'b2-mb-farbe',
    tabelle: 'b2-mb-tabelle',
    bild: 'b2-mb-bild',
};

const MBX = 0;
const MBY = 3360;

nodes.push(
    blockNode(MB.root, MBX + 728, MBY, 336, 80, h2('Nebensätze — Landkarte')),
    blockNode(MB.kausal, MBX + 168, MBY + 224, 300, 80, bullet('**kausal** — weil, da, zumal')),
    blockNode(MB.konzessiv, MBX + 560, MBY + 224, 300, 80, bullet('**konzessiv** — obwohl, obgleich')),
    blockNode(MB.final, MBX + 952, MBY + 224, 300, 80, bullet('**final** — damit, um … zu')),
    blockNode(MB.konsekutiv, MBX + 1344, MBY + 224, 300, 80, bullet('**konsekutiv** — sodass, so …, dass')),
    blockNode(MB.temporal, MBX + 168, MBY + 392, 300, 80, bullet('**temporal** — während, nachdem, sobald')),
    blockNode(MB.modal, MBX + 560, MBY + 392, 300, 80, bullet('**modal** — indem, dadurch dass')),
    blockNode(
        MB.codeExample,
        MBX + 952,
        MBY + 392,
        432,
        200,
        code(
            'Hauptsatz  : Ich bleibe zu Hause.\nweil       : …, weil es stark regnet.\nda         : Da es stark regnet, bleibe ich zu Hause.\nzumal      : …, zumal es auch noch kalt ist.\ndeshalb    : Es regnet stark, deshalb bleibe ich zu Hause.',
            'text',
        ),
    ),
    blockNode(
        MB.warnung,
        MBX + 168,
        MBY + 560,
        432,
        140,
        callout('„da" steht am liebsten VOR dem Hauptsatz, „weil" am liebsten dahinter. Kein Fehler, aber ein Stilsignal.', 'Info'),
    ),
    blockNode(MB.farbe, MBX + 672, MBY + 560, 96, 96, color('#4C6FE7', 'Nebensatz-Blau')),
    blockNode(
        MB.tabelle,
        MBX + 840,
        MBY + 616,
        432,
        220,
        table([
            ['Konnektor', 'Position Verb', 'Register'],
            ['weil', 'Ende', 'neutral, gesprochen'],
            ['da', 'Ende', 'schriftlich, bekannt vorausgesetzt'],
            ['denn', 'Position 2', 'gesprochen wie geschrieben'],
            ['nämlich', 'im Mittelfeld', 'nachgestellte Erklärung'],
        ]),
    ),
    blockNode(MB.bild, MBX + 1400, MBY + 616, 400, 240, image(passivSVG, 180)),
);

edges.push(
    edge(MB.root, MB.kausal, 'Grund'),
    edge(MB.root, MB.konzessiv, 'Gegensatz'),
    edge(MB.root, MB.final, 'Absicht'),
    edge(MB.root, MB.konsekutiv, 'Folge'),
    edge(MB.root, MB.temporal, 'Zeit'),
    edge(MB.root, MB.modal, 'Art & Weise'),
    edge(MB.kausal, MB.warnung, '', { lineStyle: 'dotted', markerEnd: 'circle' }),
    edge(MB.kausal, MB.tabelle, 'Register', { lineStyle: 'dashed' }),
    edge(MB.kausal, MB.codeExample, 'Beispiele', { edgeType: 'smoothstep' }),
    edge(MB.konzessiv, MB.farbe, '', { markerEnd: 'circle', lineStyle: 'dotted' }),
);

// --- 18. fused note ---------------------------------------------------------

nodes.push({
    id: N_FUSED,
    type: 'fused-note',
    position: { x: 1456, y: 2856 },
    style: { width: 656, height: 432 },
    data: {
        content: [
            h2('Drei Lernmethoden, die bei mir wirklich funktionieren'),
            h3('1. Shadowing'),
            text('Audio abspielen, mit einer Sekunde Verzögerung mitsprechen, **ohne** auf die Bedeutung zu achten. Trainiert Rhythmus, Satzmelodie und Sprechtempo gleichzeitig. 10 Minuten täglich reichen.'),
            h3('2. Die Zwei-Minuten-Regel'),
            text('Jeden Tag zwei Minuten frei über ein Zufallsthema sprechen — aufnehmen, einmal anhören, ein Wort notieren, das gefehlt hat. Das Wort kommt ins Fehlerlogbuch.'),
            h3('3. Rückübersetzung'),
            text('Einen deutschen Satz in die Muttersprache übersetzen, einen Tag warten, zurückübersetzen und mit dem Original vergleichen. Die Abweichungen sind die eigenen Lücken — schonungslos genau.'),
            callout('Alle drei haben gemeinsam: Ich **produziere** Sprache, statt sie zu konsumieren. Das ist der einzige Hebel, der auf B2 noch etwas bewegt.', 'Zap'),
        ],
    },
});

// --- 19. Kanban -------------------------------------------------------------

const KANBAN_COLS = [
    { id: 'kb-col-todo', label: 'Zu lernen', statusValue: 'todo', color: '#8A8378' },
    { id: 'kb-col-doing', label: 'In Arbeit', statusValue: 'in-progress', color: '#F95D2E' },
    { id: 'kb-col-review', label: 'Wiederholen', statusValue: 'review', color: '#E2A03F' },
    { id: 'kb-col-done', label: 'Sitzt', statusValue: 'done', color: '#2E9E5B' },
];

nodes.push({
    id: N_KANBAN,
    type: 'kanban',
    position: { x: 2688, y: 2352 },
    style: { width: 1120, height: 728 },
    data: {
        label: 'Lernstatus B2',
        columns: KANBAN_COLS,
        viewMode: 'board',
        sortBy: 'priority',
        sortDirection: 'desc',
        swimlaneField: null,
        tableColumns: ['tags', 'dueDate', 'progress'],
    },
});

const kanbanCards = [
    ['kb-1', 'Konjunktiv II — Originalformen', 'todo', 'high', 0, ['Grammatik'], '2026-08-10'],
    ['kb-2', 'Genitivpräpositionen', 'todo', 'medium', 1, ['Grammatik'], '2026-08-17'],
    ['kb-3', 'Verben mit fester Präposition', 'todo', 'high', 2, ['Wortschatz'], '2026-08-24'],
    ['kb-4', 'Passiversatzformen aktiv benutzen', 'in-progress', 'high', 0, ['Grammatik'], '2026-08-07'],
    ['kb-5', 'Hören: Zahlendiktate', 'in-progress', 'urgent', 1, ['Hören'], '2026-08-03'],
    ['kb-6', 'Forumsbeitrag Nr. 4 schreiben', 'in-progress', 'medium', 2, ['Schreiben'], '2026-08-05'],
    ['kb-7', 'Konnektoren Position 1 vs. 0', 'review', 'medium', 0, ['Grammatik'], '2026-08-12'],
    ['kb-8', 'Wortschatz Arbeit & Beruf', 'review', 'low', 1, ['Wortschatz'], '2026-08-19'],
    ['kb-9', 'Satzklammer', 'done', 'low', 0, ['Grammatik'], '2026-07-24'],
    ['kb-10', 'Relativsätze im Nominativ/Akkusativ', 'done', 'low', 1, ['Grammatik'], '2026-07-21'],
];

kanbanCards.forEach(([id, label, status, priority, order, tags, due]) => {
    nodes.push({
        id,
        type: 'note',
        position: { x: 0, y: 0 },
        style: { width: 96, height: 96 },
        parentId: N_KANBAN,
        data: {
            label,
            viewMode: 'icon',
            status,
            priority,
            order,
            tags,
            dueDate: ISO(due),
            createdAt: CREATED,
            updatedAt: UPDATED,
            content: [text(`Lernkarte: **${label}**`)],
        },
    });
});

// ---------------------------------------------------------------------------
// ROOT EDGES
// ---------------------------------------------------------------------------

edges.push(
    edge(N_HUB, N_KONJ, 'Grammatik', { markerEnd: 'arrow' }),
    edge(N_HUB, N_ARBEIT, 'Wortschatz'),
    edge(N_HUB, N_SCHREIBEN, 'Fertigkeit'),
    edge(N_HUB, N_FEHLER, 'System', { lineStyle: 'dashed' }),
    edge(N_HUB, N_MODELLSATZ, 'Prüfung', { animated: true, color: '#F95D2E', strokeWidth: 2.5 }),
    edge(N_KONJ, N_PASSIV, 'beide brauchen Partizip II', { lineStyle: 'dashed' }),
    edge(N_PASSIV, N_KONNEKT, 'Satzklammer', { lineStyle: 'dashed' }),
    edge(N_KONNEKT, N_SCHREIBEN, 'liefert Kohärenz', { edgeType: 'smoothstep' }),
    edge(N_KONNEKT, N_NOMINAL, 'Nominalstil', { lineStyle: 'dotted' }),
    edge(N_ARBEIT, N_SPRECHEN, 'Redemittel', { edgeType: 'smoothstep' }),
    edge(N_UMWELT, N_SPRECHEN, 'Statistik beschreiben', { edgeType: 'smoothstep' }),
    edge(N_ARBEIT, N_UMWELT, 'Themenfelder', { lineStyle: 'dotted', markerEnd: 'circle' }),
    edge(N_SCHREIBEN, N_FEHLER, 'Korrekturen wandern hierhin', { color: '#E2A03F' }),
    edge(N_SPRECHEN, N_FEHLER, 'Aussprachefehler', { color: '#E2A03F', lineStyle: 'dashed' }),
    edge(N_FEHLER, N_SRS, 'Wiedervorlage', { animated: true }),
    edge(N_RESSOURCEN, N_SRS, 'Intervalle', { lineStyle: 'dotted' }),
    edge(N_HUB, N_RESSOURCEN, 'Quellen', { lineStyle: 'dotted' }),
    edge(N_MODELLSATZ, N_KANBAN, 'ergibt Aufgaben', { edgeType: 'smoothstep', color: '#F95D2E' }),
    edge(N_SRS, N_KANBAN, 'füllt die Spalte „Wiederholen"', { lineStyle: 'dashed' }),
    edge(N_KONJ, MB.root, 'Nebensatz-Landkarte', { edgeType: 'smoothstep', lineStyle: 'dashed' }),
    edge(N_FUSED, N_HUB, 'Methodik', { edgeType: 'smoothstep', lineStyle: 'dotted' }),
    edge(N_IDIOME, N_SPRECHEN, 'Würze', { lineStyle: 'dotted', markerEnd: 'circle' }),
    edge(N_PRUEFTAG, N_HUB, '5. Dezember', { lineStyle: 'dashed', color: '#F95D2E' }),
);

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

const graph = { nodes, edges, savedAt: Date.now() };
const out = resolve(__dirname, '..', 'deutsch-b2-workspace.json');
writeFileSync(out, JSON.stringify(graph, null, 2), 'utf8');
// public/ copy so public/load-b2.html can fetch it in a built app too, not
// just under the dev server (which happens to serve the project root).
const pub = resolve(__dirname, '..', 'public', 'deutsch-b2-workspace.json');
writeFileSync(pub, JSON.stringify(graph), 'utf8');

// quick self-report
const blockTypes = new Set();
const walk = (blocks) => {
    for (const b of blocks || []) {
        blockTypes.add(b.type);
        if (b.metadata?.blocks) walk(b.metadata.blocks);
        if (b.metadata?.columns) b.metadata.columns.forEach((c) => walk(c.content));
    }
};
nodes.forEach((n) => {
    if (Array.isArray(n.data?.content)) walk(n.data.content);
});

console.log(`wrote ${out}`);
console.log(`nodes: ${nodes.length}  edges: ${edges.length}`);
console.log(
    'node types:',
    [...new Set(nodes.map((n) => n.type))].join(', '),
);
console.log('block types:', [...blockTypes].sort().join(', '));
console.log('block-type count:', blockTypes.size);
