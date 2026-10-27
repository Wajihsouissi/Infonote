/** Original analyst questions and hypothetical scenarios, with dated primary-source anchors.
 * The fixture is research workload, not an investment recommendation or a live valuation. */
export const sources = [
  { title: 'NVIDIA fiscal 2025 results', url: 'https://investor.nvidia.com/news/press-release-details/2025/NVIDIA-Announces-Financial-Results-for-Fourth-Quarter-and-Fiscal-2025/default.aspx', fact: 'Historical anchor: NVIDIA reported fiscal 2025 revenue of $130.5 billion; Data Center revenue was $115.2 billion.' },
  { title: 'ASML 2024 results', url: 'https://investor.asml.com/news-releases/news-release-details/q4-2024-financial-results', fact: 'Historical anchor: ASML reported 2024 net sales of €28.3 billion. Currency and fiscal periods differ from the other companies.' },
  { title: 'TSMC 2024 annual report', url: 'https://investor.tsmc.com/sites/ir/annual-report/2024/2024-Annual%20Report-E.pdf', fact: 'Primary document to review: TSMC 2024 annual report. Record fabrication, packaging, geographic exposure and accounting definitions separately.' },
];

export const imagePages = [
  { title: '12-inch silicon wafer', page: 'https://commons.wikimedia.org/wiki/File:12-inch_silicon_wafer.jpg', originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/12-inch_silicon_wafer.jpg', author: 'Peellden', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { title: 'Server rack', page: 'https://commons.wikimedia.org/wiki/File:Rack001.jpg', originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Rack001.jpg', author: 'Jfreyre', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { title: 'ASML headquarters', page: 'https://commons.wikimedia.org/wiki/File:ASML_headquarters_Veldhoven.jpg', originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ae/ASML_headquarters_Veldhoven.jpg', author: 'A ansems', license: 'Public domain' },
];

const sectors = [
  ['Accelerators', 'NVIDIA', 'GPU utilisation, software switching costs and system-level pricing'],
  ['Foundry', 'TSMC', 'advanced-node utilisation, capital intensity and packaging bottlenecks'],
  ['Lithography', 'ASML', 'installed-base service, equipment order timing and export restrictions'],
  ['Memory', 'HBM supply chain', 'memory bandwidth, qualification cycles and incremental capacity'],
  ['Networking', 'AI cluster interconnect', 'network topology, congestion and optical component availability'],
  ['Power', 'Grid and electrical equipment', 'interconnection queues, transformer delivery and contracted capacity'],
  ['Cooling', 'Liquid cooling suppliers', 'rack heat density, serviceability and retrofit economics'],
  ['Cloud', 'Hyperscaler customers', 'capital allocation, depreciation and monetisation evidence'],
  ['Economics', 'Inference workload owners', 'cost per useful task, quality thresholds and demand elasticity'],
  ['Geopolitics', 'Semiconductor trade routes', 'customer geography, export eligibility and supplier concentration'],
  ['Valuation', 'Cross-company comparison', 'normalised margins, dilution and terminal assumptions'],
  ['Portfolio', 'Research committee', 'correlated exposures, thesis invalidation and position sizing discipline'],
];
const questions = [
  ['Demand quality', 'Which demand is recurring rather than an initial capacity build?', 'Separate signed commitments, paid utilisation, trials and management expectations. Ask for a cohort view before extrapolating the newest customer wins.'],
  ['Bottleneck migration', 'Where does incremental supply stop translating into revenue?', 'Trace the constrained component through the delivery chain. A faster processor does not eliminate power, memory, cooling or deployment constraints.'],
  ['Unit economics', 'What improves when a system completes more useful work?', 'Build a bridge from technical throughput to revenue, operating cost and cash collection. Do not treat benchmark speed as realised customer profit.'],
  ['Capital cycle', 'What happens when customers bring forward expenditure?', 'Distinguish the installed base from new orders. A temporary order pause can coexist with a durable long-term use case and needs its own cash-flow scenario.'],
  ['Competitive response', 'How could an alternative design reduce the economic advantage?', 'List the workload, switching cost, integration effort and qualification time. Compare total system costs rather than isolated component prices.'],
  ['Customer concentration', 'Can a few large customers shift purchasing terms?', 'Review contract duration and alternatives available at renewal. Identify whether apparent diversification actually depends on the same underlying source of cloud expenditure.'],
  ['Cash conversion', 'When do accounting profits become distributable cash?', 'Bridge receivables, inventories, supplier prepayments and maintenance capital expenditure. Keep stock compensation and financing assumptions explicit.'],
  ['Downside', 'What evidence would contradict the central research thesis?', 'Write measurable falsifiers before collecting confirming evidence. Assign an owner and review date to each assumption that could change the conclusion.'],
  ['Scenario design', 'Which assumptions move together in a stressed case?', 'Link volume, price, utilisation and working capital consistently. Avoid a downside case that combines lower sales with implausibly improved collection and margins.'],
  ['Evidence trail', 'Can another analyst reproduce the conclusion?', 'Store the source, publication date, fiscal period, units and remaining uncertainty beside each observation. Mark unsupported estimates as open questions.'],
];

function document(id, sectorIndex, sectionCount = 10) {
  const [sector, company, context] = sectors[sectorIndex % sectors.length];
  const blocks = [{ id: `${id}-intro`, type: 'text', content: `Working dossier: ${company}. Review ${context}. These are original investigation prompts and hypothetical scenarios; historical source anchors are in the research-room index.` }];
  for (let section = 0; section < sectionCount; section++) {
    const [title, question, method] = questions[section % questions.length];
    const cycle = Math.floor(section / questions.length) + 1;
    const prefix = `${id}-s${section}`;
    blocks.push(
      { id: `${prefix}-h`, type: section % 5 === 0 ? 'heading1' : 'heading2', content: `${sector} / ${title} / review ${cycle}` },
      { id: `${prefix}-q`, type: 'text', content: `**Research question ${section + 1}:** ${question} Apply this to ${company}, with particular attention to ${context}. ${method}` },
      { id: `${prefix}-b`, type: 'bullet', content: `Evidence to collect: reconcile the ${title.toLowerCase()} claim with the underlying disclosure, customer behaviour and one independent operational indicator. Record a range and the date of the observation.` },
      { id: `${prefix}-toggle`, type: 'toggle', content: `Alternative explanation — ${title}`, metadata: { isCollapsed: section % 3 === 0 } },
      { id: `${prefix}-child`, type: 'text', indent: 1, content: `Counter-case for ${company}: observed change may reflect timing, product mix or inventory rebuilding rather than a permanent change. Compare the next reporting period before increasing confidence in the ${sector.toLowerCase()} thesis.` },
      { id: `${prefix}-todo`, type: 'todo', content: `Verify ${company}: ${title.toLowerCase()} with a dated primary source; reviewer ${['Demand team', 'Technical team', 'Risk committee'][section % 3]}.`, metadata: { checked: section % 4 === 0 } },
      { id: `${prefix}-callout`, type: 'callout', content: `Decision gate ${cycle}.${section % 10 + 1}: keep the conclusion provisional until evidence separates an operational improvement from an accounting or timing effect.`, metadata: { icon: 'Lightbulb' } },
      { id: `${prefix}-note`, type: 'text', content: `ملاحظة بحث / Note de recherche: نفرّقوا بين الفرضية والدليل. For ${company}, the next useful step is to test ${title.toLowerCase()} against a competing explanation and update the uncertainty register. Review path ${id} → section ${section + 1}.` },
    );
    if (section % 5 === 1) blocks.push({ id: `${prefix}-table`, type: 'table', content: '', metadata: { rows: [ ['Case (illustrative)', 'Volume index', 'Price index', 'Evidence required'], ['Downside', '75', '90', 'Customer cuts and lower utilisation'], ['Reference', '100', '100', 'Repeatable paid workloads'], ['Upside', '125', '105', 'Incremental demand and delivery capacity'] ] } });
    if (section % 7 === 2) blocks.push({ id: `${prefix}-quote`, type: 'quote', content: `Analyst rule: a compelling narrative is a question generator. It becomes a conclusion only when its assumptions survive a competing explanation.` });
  }
  return blocks;
}

export function buildInvestmentStudy(images = []) {
  const nodes = [], edges = [];
  const note = (id, label, content, x, y, extra = {}) => ({ id, type: 'note', position: { x, y }, style: { width: 550, height: 540 }, data: { label, icon: 'FileText', viewMode: 'expanded', content, ...extra } });
  const intro = [
    { id: 'room-title', type: 'heading1', content: 'AI infrastructure: an evidence-first investment research room' },
    { id: 'room-intro', type: 'text', content: 'A heavy research workspace, using dated company disclosures as source anchors. The research questions and scenario indices are original, hypothetical QA content. No live price target or investment recommendation is implied.' },
    ...sources.flatMap((source, i) => [ { id: `source-${i}`, type: 'text', content: source.fact }, { id: `source-link-${i}`, type: 'text', content: `[${source.title}](${source.url})` } ]),
    { id: 'room-roadmap', type: 'heading2', content: 'From components to customer returns' },
    { id: 'room-chain', type: 'text', content: 'Research chain: lithography → fabrication → packaging and memory → accelerator systems → networking → power and cooling → paid cloud workloads. Investigate which layer captures value as each bottleneck shifts.' },
    ...images.flatMap((image, i) => [ { id: `room-image-${i}`, type: 'image', content: image.url, metadata: { name: image.title, width: 480, height: 280 } }, { id: `room-credit-${i}`, type: 'text', content: `[${image.title} — ${image.author}; ${image.license}](${image.page})` } ]),
    ...document('room-analysis', 11, 8),
  ];
  nodes.push(note('study-room', 'AI infrastructure — research room', intro, 100, 100, { icon: 'Layers', coverImage: images[0]?.url }));
  nodes.push(note('study-deep', 'Investment thesis — deep evidence dossier', document('deep', 0, 145), 750, 100, { icon: 'BookOpen', coverImage: images[1]?.url }));
  const table = [{ id: 'model-table', type: 'table', content: '', metadata: { rows: [ ['Scenario (hypothetical)', 'Revenue index', 'Margin %', 'Capex index', 'Working capital', 'Risk owner', 'Trigger', 'Status'], ...Array.from({ length: 120 }, (_, i) => [ `${sectors[i % 12][0]} / scenario ${i + 1}`, String(75 + i % 51), String(15 + i % 26), String(80 + i % 61), ['Neutral', 'Inventory build', 'Receivables stretch'][i % 3], ['Technical', 'Demand', 'Risk'][i % 3], questions[i % 10][0], ['Open', 'Needs source', 'Reviewed'][i % 3] ]) ] } }, ...document('model', 10, 8)];
  nodes.push(note('study-table', 'Scenario workbook — 120 cases', table, 1400, 100, { icon: 'Table' }));
  nodes.push(note('study-columns', 'Bull case vs counter-thesis', [{ id: 'research-columns', type: 'columns', content: '', metadata: { columns: [ { id: 'bull', content: document('bull', 7, 24) }, { id: 'bear', content: document('bear', 11, 24) } ] } }], 2050, 100));
  for (let s = 0; s < sectors.length; s++) for (let q = 0; q < questions.length; q++) {
    const id = `sector-${s}-${q}`;
    const body = document(id, s, 9 + q % 3);
    if (images.length && q % 3 === 0) body.splice(2, 0, { id: `${id}-image`, type: 'image', content: images[(s + q) % images.length].url, metadata: { width: 480, height: 240, name: images[(s + q) % images.length].title } });
    nodes.push(note(id, `${sectors[s][1]} — ${questions[q][0]}`, body, 100 + (s % 6) * 650, 900 + (Math.floor(s / 6) * 10 + q) * 620, { coverImage: q % 3 === 0 ? images[s % images.length]?.url : undefined }));
    edges.push({ id: `edge-${id}`, source: q === 0 ? 'study-room' : `sector-${s}-0`, target: id, type: 'centered', data: { parentId: null } });
  }
  // A hand-curated three-level branch complements the automatically generated dossier map.
  for (let depth = 0; depth < 3; depth++) for (let i = 0; i < 12; i++) {
    const id = `nested-${depth}-${i}`, parent = depth === 0 ? 'study-columns' : `nested-${depth - 1}-0`;
    nodes.push({ ...note(id, `${['Regional risks', 'Power contracts', 'Evidence archive'][depth]} / ${i + 1}`, document(id, i, 5), (i % 4) * 650, Math.floor(i / 4) * 620), parentId: parent });
    if (i) edges.push({ id: `edge-${id}`, source: `nested-${depth}-0`, target: id, type: 'centered', data: { parentId: parent } });
  }
  let blockCount = 0, cellCount = 0, imageCount = 0;
  const knownIds = new Set();
  const walk = blocks => { for (const block of blocks) {
    if (knownIds.has(block.id)) throw Error(`Fixture contains duplicate block ID: ${block.id}`);
    knownIds.add(block.id); blockCount++;
    if (block.type === 'image') imageCount++;
    cellCount += block.metadata?.rows?.reduce((sum, row) => sum + row.length, 0) || 0;
    for (const col of block.metadata?.columns || []) walk(col.content);
  } };
  nodes.forEach(node => walk(node.data.content));
  return { nodes, edges, manifest: { title: 'AI infrastructure investment research', rootCards: nodes.filter(n => !n.parentId).length, totalCards: nodes.length, blocks: blockCount, tableCells: cellCount, imageBlocks: imageCount, deepDossierBlocks: nodes[1].data.content.length, initialNestedDepth: 3, sources, images } };
}
