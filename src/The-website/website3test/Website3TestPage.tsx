import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, ArrowDown, ArrowRight, Plus, Link2, FileText, MoreHorizontal, MousePointer2, Scissors, Check, ChevronRight, CornerDownRight, Expand, Sparkles, RotateCcw, Undo2, Monitor, Cloud, Minus, Circle, X, Menu } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/Button';
import { chapters, faqs, ideas } from './researchStory';
import { useResearchMotion } from './useResearchMotion';
import s from './Website3TestPage.module.css';

const photo = '/marketing/research-cut/workspace.jpg';

function Brand({ large = false }: { large?: boolean }) {
  return <span className={`${s.brand} ${large ? s.brandLarge : ''}`}><span className={s.brandMark} aria-hidden="true"><i /><i /><i /></span>chunked<span className={s.brandDot}>.</span></span>;
}

function CanvasLink({ children = 'Start your canvas', className = '' }: { children?: ReactNode; className?: string }) {
  return <ButtonLink href="/canvas" variant="primary" size="lg" className={`${s.canvasLink} ${className}`} trailingIcon={<ArrowUpRight size={19} aria-hidden="true" />}>{children}</ButtonLink>;
}

function CardTop({ children, icon = <FileText size={14} /> }: { children: ReactNode; icon?: ReactNode }) {
  return <div className={s.cardTop}><span aria-hidden="true">{icon}</span><span>{children}</span><MoreHorizontal size={16} aria-hidden="true" /></div>;
}

function ToolStrip() {
  return <div className={s.toolStrip} aria-hidden="true"><MousePointer2 /><span /><Plus /><FileText /><Link2 /><span /><Minus /><small>100%</small></div>;
}

function Caption({ children }: { children: ReactNode }) {
  return <p className={s.caption}><span aria-hidden="true" />{children}</p>;
}

function HeroCanvas() {
  return <div className={s.heroCanvas} aria-label="Illustrative research project: A calmer workspace">
    <div className={s.canvasLabel}><span><span className={s.statusDot} />A calmer workspace</span><span>Example project <Expand size={13} aria-hidden="true" /></span></div>
    <svg className={s.heroLines} viewBox="0 0 650 590" fill="none" aria-hidden="true"><path d="M200 245 C200 310 405 260 405 341" /><path d="M505 247 C505 295 475 310 475 343" /><path className={s.accentPath} d="M333 420 C285 420 260 475 202 475" /><circle cx="405" cy="341" r="4" /><circle cx="200" cy="245" r="4" /></svg>
    <div className={`${s.heroNote} ${s.darkCard}`} data-hero-piece>
      <CardTop>Desk observations</CardTop><div className={s.noteBody}><span className={s.noteType}>A few things I noticed</span><p>Starting is easier when there’s less in the way.</p><p className={s.highlightText}>Keep tools within reach.</p><p>Leave space for the current task.</p><div className={s.cardMeta}><FileText size={12} /> My research notes</div></div>
    </div>
    <figure className={s.heroPhoto} data-hero-piece><img src={photo} alt="A quiet oak desk with a notebook, lamp and small plant" width="1200" height="900" fetchPriority="high" /><figcaption>Room to begin.<span>Visual reference</span></figcaption></figure>
    <div className={`${s.heroIdea} ${s.paperCard}`} data-hero-piece><span className={s.selectionHandle} aria-hidden="true" /><div className={s.ideaLabel}><Link2 size={13} />One useful connection</div><p>A little less friction.<br />A little more focus.</p><span className={s.sourceLabel}>FROM MY DESK OBSERVATIONS</span></div>
    <div className={s.heroQuestion} data-hero-piece><span className={s.questionMark}>?</span><span>What actually<br />helps me start?</span></div>
    <div className={s.heroCursor} aria-hidden="true"><MousePointer2 size={22} fill="currentColor" /><span>A new angle</span></div>
    <ToolStrip />
  </div>;
}

function CutScene() {
  return <div className={s.cutScene} data-scene>
    <div className={s.cutDocument} data-piece><CardTop>Desk observations</CardTop><div className={s.documentBody}><h3>A calmer workspace</h3><p>Some thoughts from a day at my desk.</p><div className={s.selectedParagraph} data-cut-source>Keep tools within reach.<br /><span>The things I use every day deserve a place close by.</span></div><div className={s.cutLine} data-cut-line><Scissors size={17} /></div><p>Leave space for the current task.<br /><span>One open notebook. One thing to work on.</span></p><div className={s.documentRule} /><small>Two thoughts. Each with somewhere to go.</small></div></div>
    <div className={s.cutArrow} aria-hidden="true"><ArrowRight size={26} /><span>Break it down</span></div>
    <div className={s.cutPieces}><article className={s.paperCard} data-piece><div className={s.ideaLabel}>01 / Observation</div><h3>Keep tools<br />within reach.</h3><p>The things I use every day deserve a place close by.</p><span className={s.sourceLabel}>Desk observations</span></article><article className={s.pinkCard} data-piece><div className={s.ideaLabel}>02 / Observation</div><h3>Leave space for<br />the current task.</h3><span className={s.sourceLabel}>Desk observations</span></article></div>
  </div>;
}

function ConnectionScene() {
  return <div className={s.connectionScene} data-scene>
    <div className={s.canvasLabel}><span><Link2 size={14} /> A pattern starts to appear</span><span>Research canvas</span></div>
    <svg className={s.connectionLines} viewBox="0 0 1000 440" fill="none" aria-hidden="true"><path data-draw d="M270 160 C410 160 385 250 500 250" /><path data-draw d="M500 250 C625 250 590 120 720 120" /><path data-draw className={s.accentPath} d="M500 250 L500 340" /><circle cx="500" cy="250" r="5" /></svg>
    <article className={`${s.paperCard} ${s.connectionFirst}`} data-piece><div className={s.ideaLabel}>Observation</div><h3>Keep tools<br />within reach.</h3><span className={s.sourceLabel}>Desk observations</span></article>
    <article className={`${s.pinkCard} ${s.connectionSecond}`} data-piece><div className={s.ideaLabel}>Observation</div><h3>Leave space for<br />the current task.</h3><span className={s.sourceLabel}>Desk observations</span></article>
    <div className={s.connectionQuestion} data-piece><span>?</span><h3>What actually<br />helps me start?</h3></div>
    <p className={s.connectionInsight}><CornerDownRight size={17} /> A possible angle: remove friction before adding tools.</p>
    <div className={s.connectionReference}><FileText size={15} /><span>Research questions.pdf</span><span>My reference</span></div>
  </div>;
}

function DepthScene() {
  const [inside, setInside] = useState(false);
  return <div className={s.depthScene} data-scene>
    <div className={s.breadcrumb}><button type="button" onClick={() => setInside(false)}>A calmer workspace</button><ChevronRight size={13} /><span>{inside ? 'Workspace experiment' : 'Research canvas'}</span></div>
    <div className={s.depthContent}>
      {inside ? <div className={s.innerCanvas}><div className={s.innerHeading}><span className={s.statusDot} /><h3>Workspace experiment</h3><span>Inside the idea</span></div><div className={s.innerNotes}><article className={s.paperCard}><span className={s.ideaLabel}>Observation</span><h4>Keep tools within reach.</h4><p>Start with the things I already use.</p></article><article className={s.pinkCard}><span className={s.ideaLabel}>Question</span><h4>What can I put away?</h4><p>Make room for the current task.</p></article></div><p className={s.innerNext}><Check size={16} /> Next experiment: clear one part of the desk.</p><button type="button" className={s.textButton} onClick={() => setInside(false)}><Undo2 size={15} />Back to the bigger picture</button></div> : <><div className={s.depthGhost} aria-hidden="true"><span>Notes & references</span><div /><div /><div /></div><article className={s.depthFolder} data-piece><div className={s.folderIcon} aria-hidden="true"><span /><span /><span /></div><h3>Workspace<br />experiment</h3><p>A thought with room inside.</p><Button variant="secondary" onClick={() => setInside(true)} trailingIcon={<ArrowUpRight size={15} />}>Open this idea</Button></article><div className={s.depthSmall} aria-hidden="true"><FileText size={17} /><span>Video outline</span></div></>}
    </div><div className={s.sceneFooter}><span>One canvas. A little more depth.</span><span>Interactive example</span></div>
  </div>;
}

function AssistScene() {
  return <div className={s.assistScene} data-scene><article className={`${s.paperCard} ${s.aiSource}`} data-piece><span className={s.ideaLabel}>Selected note</span><h3>What actually<br />helps me start?</h3><p>A question worth exploring before buying another desk accessory.</p><span className={s.sourceLabel}>Research questions</span></article><div className={s.aiPanel} data-piece><div className={s.aiHeader}><Sparkles size={18} /><span>Think a little further</span><span className={s.aiTag}>AI</span></div><p className={s.aiPrompt}>Suggest three questions to develop this idea.</p><div className={s.aiAnswer}><p>Here are a few directions you could explore:</p><ol><li>Which tools do you reach for every day?</li><li>What can leave your desk while you work?</li><li>What would make starting feel a little easier?</li></ol></div><div className={s.aiFoot}><Check size={13} /> Your ideas. Your next move.</div></div><p className={s.aiDisclaimer}>Illustrative AI response · Sign-in required in the app</p></div>;
}

function PlanScene() {
  const [started, setStarted] = useState(false);
  return <div className={s.planScene} data-scene><article className={s.outline} data-piece><CardTop>Video outline</CardTop><h3>A calmer<br />workspace.</h3><p>From the research, in my own words.</p><ol><li><span>01</span><div>The friction<small>What gets in the way of starting?</small></div></li><li><span>02</span><div>The experiment<small>Keep tools close. Make some space.</small></div></li><li><span>03</span><div>The reflection<small>What changed? What stayed?</small></div></li></ol><span className={s.outlineLabel}><Link2 size={13} /> Connected to my research</span></article><div className={s.board} data-piece><div className={s.boardTop}><span><span className={s.statusDot} />Make it happen</span><span>Board view</span></div><div className={s.boardColumns}><div className={s.boardColumn}><h4><Circle size={11} />To do <span>{started ? '1' : '2'}</span></h4>{!started && <article className={`${s.task} ${s.activeTask}`}><span>Writing</span><h5>Draft opening</h5><p>Start with the question.</p><button type="button" onClick={() => setStarted(true)}>Start task <ArrowRight size={14} /></button></article>}<article className={s.task}><span>Production</span><h5>Capture desk footage</h5><div className={s.taskCheck}><Circle size={13} />Show the experiment</div></article></div><div className={s.boardColumn}><h4><span className={s.statusDot} />In progress <span>{started ? '1' : '0'}</span></h4>{started ? <article className={`${s.task} ${s.activeTask}`}><span>Writing</span><h5>Draft opening</h5><p>One step closer.</p><button type="button" onClick={() => setStarted(false)}><Undo2 size={13} />Move back</button></article> : <div className={s.taskEmpty}>A place for your<br />next step.<ArrowDown size={21} /></div>}</div></div><p className={s.boardHint} role="status">{started ? '“Draft opening” moved to In progress.' : 'Try moving the first task into progress.'}</p></div></div>;
}

function ConnectionDemo() {
  const [selected, setSelected] = useState<string[]>([]);
  const [edges, setEdges] = useState<string[][]>([]);
  const [message, setMessage] = useState('Choose two ideas. See what connects.');
  const duplicate = selected.length === 2 && edges.some(edge => selected.every(id => edge.includes(id)));
  const choose = (id: string) => {
    const next = selected.includes(id) ? selected.filter(item => item !== id) : selected.length < 2 ? [...selected, id] : [selected[1], id];
    setSelected(next);
    setMessage(next.length === 2 ? 'Two ideas selected. Connect them when you’re ready.' : next.length === 1 ? 'One idea selected. Choose another.' : 'Choose two ideas. See what connects.');
  };
  const connect = () => {
    if (selected.length !== 2 || duplicate) return;
    setEdges([...edges, selected]);
    setMessage(`Connected “${ideas.find(idea => idea.id === selected[0])?.title}” and “${ideas.find(idea => idea.id === selected[1])?.title}”.`);
    setSelected([]);
  };
  const undo = () => { setEdges(edges.slice(0, -1)); setMessage('Last connection removed. Try another pairing.'); };
  return <div className={s.demo}>
    <div className={s.demoTop}><span><MousePointer2 size={16} />Your little thinking space</span><span>{edges.length} {edges.length === 1 ? 'connection' : 'connections'}</span></div>
    <div className={s.demoCanvas}>
      <svg className={s.demoLines} data-testid="demo-connections" viewBox="0 0 900 280" preserveAspectRatio="none" aria-hidden="true">{edges.map(edge => {
        const positions = edge.map(id => ideas.findIndex(idea => idea.id === id)).sort();
        const x1 = 150 + positions[0] * 300; const x2 = 150 + positions[1] * 300;
        return <path key={[...edge].sort().join('-')} d={`M${x1} 80 C${x1} 8 ${x2} 8 ${x2} 80`} />;
      })}</svg>
      <div className={s.demoCards}>{ideas.map((idea, index) => <button type="button" key={idea.id} aria-pressed={selected.includes(idea.id)} onClick={() => choose(idea.id)} className={`${s.demoCard} ${s[`${idea.color}Card`]} ${selected.includes(idea.id) ? s.demoSelected : ''}`}><span className={s.demoCardTop}><span>0{index + 1} / {index === 2 ? 'Question' : 'Observation'}</span><span className={s.selectionBox}>{selected.includes(idea.id) && <Check size={13} />}</span></span><strong>{idea.title}</strong><span className={s.demoBody}>{idea.body}</span><span className={s.sourceLabel}>{idea.source}</span>{edges.some(edge => edge.includes(idea.id)) && <span className={s.connectedLabel}><Link2 size={12} />Connected</span>}</button>)}</div>
      {edges.length > 0 && <ul className={s.demoRelations} aria-label="Your connections">{edges.map(edge => <li key={[...edge].sort().join('-')}><span>{ideas.find(idea => idea.id === edge[0])?.title}</span><Link2 size={17} aria-hidden="true" /><span>{ideas.find(idea => idea.id === edge[1])?.title}</span></li>)}</ul>}
    </div>
    <div className={s.demoControls}><div className={s.demoStatus} role="status" aria-live="polite">{duplicate ? 'These ideas are already connected. Choose a different pair.' : message}</div><div><Button variant="primary" disabled={selected.length !== 2 || duplicate} onClick={connect} leadingIcon={<Link2 size={15} />}>Connect ideas</Button><Button variant="ghost" disabled={!edges.length} onClick={undo} leadingIcon={<Undo2 size={15} />}>Undo</Button><Button variant="ghost" onClick={() => { setSelected([]); setEdges([]); setMessage('Demo reset. Choose two ideas to begin again.'); }} leadingIcon={<RotateCcw size={14} />}>Reset</Button></div></div>
    <p className={s.demoNote}>A small example of connecting ideas. Changes stay in this demo.</p>
  </div>;
}

export function Website3TestPage() {
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState('collection');
  const [menuOpen, setMenuOpen] = useState(false);
  const manuallySet = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useResearchMotion(reduced);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { if (!manuallySet.current) setReduced(media.matches); };
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let pending = 0;
    const sections = chapters.map(chapter => document.getElementById(chapter.id)).filter(Boolean) as HTMLElement[];
    const update = () => {
      pending = 0;
      const y = window.innerHeight * .4;
      const current = [...sections].reverse().find(section => section.getBoundingClientRect().top <= y);
      if (current) setActive(current.id);
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      pageRef.current?.style.setProperty('--read-progress', `${distance > 0 ? window.scrollY / distance : 0}`);
    };
    const scroll = () => { if (!pending) pending = requestAnimationFrame(update); };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll); update();
    return () => { window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); cancelAnimationFrame(pending); };
  }, []);

  return <div ref={pageRef} className={s.page} data-research-page data-motion={reduced ? 'reduced' : 'full'}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={s.header}><div className={s.headerInner}><a href="#collection" aria-label="Chunked home"><Brand /></a><nav className={`${s.navigation} ${menuOpen ? s.menuOpen : ''}`} aria-label="Main navigation"><a href="#cut" onClick={() => setMenuOpen(false)}>The story</a><a href="#explore" onClick={() => setMenuOpen(false)}>Try it yourself</a><a href="#faq" onClick={() => setMenuOpen(false)}>A few questions</a></nav><div className={s.headerActions}><a href="/login" className={s.signIn}>Sign in</a><CanvasLink /><button type="button" className={s.menuToggle} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></div><div className={s.readProgress} /></header>
    <nav className={s.chapterRail} aria-label="Story chapters">{chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`} aria-label={chapter.label} aria-current={active === chapter.id ? 'step' : undefined}><span /><small>{chapter.label}</small></a>)}</nav>
    <main id="main">
      <noscript><p className={s.staticNotice}>You can read the full story and open your canvas. The interactive examples need JavaScript.</p></noscript>
      <section id="collection" className={s.hero} aria-labelledby="hero-title"><div className={s.heroCopy}><h1 id="hero-title"><span>You saved<br />everything.</span><br />Now make<br />something of it<span className={s.coral}>.</span></h1><p>A visual workspace for research, notes, and your next project. Connect what you collect. Make room for what comes next.</p><div className={s.heroActions}><CanvasLink /><a href="#cut" className={s.storyLink}>Follow the idea <ArrowDown size={16} /></a></div><span className={s.heroFootnote}>Start with a thought. No account needed.</span></div><HeroCanvas /><div className={s.heroBottom}><span>From a pile of information to a point of view.</span><a href="#cut">Scroll to see it happen <ArrowDown size={16} /></a></div></section>
      <div className={s.interlude}><span>Research notes.</span><span>Open tabs.</span><span>Half-formed ideas.</span><strong>Let’s bring them together.<ArrowDown size={20} /></strong></div>
      <section id="cut" className={`${s.section} ${s.cutSection}`} aria-labelledby="cut-title"><div className={s.sectionHeading}><h2 id="cut-title">Give each idea<br /><span>room to think.</span></h2><div><p>A useful thought can get lost in a long document. Break your notes into pieces you can move, arrange, and actually work with.</p><Caption>Block-based writing. Canvas-sized possibilities.</Caption></div></div><CutScene /><p className={s.sceneCaption}><Scissors size={15} />Same words. A little more breathing room.<span>Illustrative project throughout</span></p></section>
      <section id="connect" className={`${s.section} ${s.connectSection}`} aria-labelledby="connect-title"><div className={s.centerHeading}><h2 id="connect-title">The good part happens<br /><span>between the ideas.</span></h2><p>Put two thoughts beside each other. Draw a connection.<br className={s.desktopBreak} /> See the angle you couldn’t see in a list.</p></div><ConnectionScene /><p className={s.sceneCaption}><Link2 size={15} />You make the connections. The canvas gives them space.</p></section>
      <section id="depth" className={`${s.section} ${s.splitSection}`} aria-labelledby="depth-title"><div className={s.sideCopy}><h2 id="depth-title">A little deeper.<br /><span>A lot more<br /> possible.</span></h2><p>Open an idea into its own canvas. Keep the notes, references, and little details inside—then come back to the bigger picture.</p><Caption>Room for the thought behind the thought.</Caption></div><DepthScene /></section>
      <section id="assist" className={`${s.section} ${s.assistSection}`} aria-labelledby="assist-title"><div className={s.sectionHeading}><h2 id="assist-title">Your thinking.<br /><span>A fresh perspective.</span></h2><div><p>Sometimes all you need is a better question. Ask AI to help you explore an idea, then decide what’s worth keeping.</p><Caption>Optional AI assistance. You stay in charge.</Caption></div></div><AssistScene /></section>
      <section id="plan" className={`${s.section} ${s.planSection}`} aria-labelledby="plan-title"><div className={s.sectionHeading}><h2 id="plan-title">Make the connection.<br /><span>Then make it happen.</span></h2><div><p>Turn your research into an outline. Give the project a next step. Keep the plan close to the thinking that started it.</p><Caption>Notes, ideas, and a board to move them forward.</Caption></div></div><PlanScene /></section>
      <section id="explore" className={`${s.section} ${s.exploreSection}`} aria-labelledby="explore-title"><div className={s.centerHeading}><h2 id="explore-title">Enough watching.<br /><span>Connect a thought.</span></h2><p>Pick two ideas below. The connection is yours to make.</p></div><ConnectionDemo /><div className={s.afterDemo}><span>That little connection? Imagine a whole canvas.</span><CanvasLink>Start your own canvas</CanvasLink></div></section>
      <section id="storage" className={`${s.section} ${s.storageSection}`} aria-labelledby="storage-title"><div className={s.sideCopy}><h2 id="storage-title">Your work.<br /><span>Your place for it.</span></h2><p>A little peace of mind, built in. Choose where your work lives when you start.</p></div><div className={s.storageOptions}><article><Monitor size={26} strokeWidth={1.5} /><h3>This device</h3><p>Keep your work in this browser. Start thinking without creating an account.</p><small>Browser-only work can be lost if you clear your browser data.</small></article><article><Cloud size={28} strokeWidth={1.5} /><h3>This device + cloud</h3><p>The same local workspace, with a cloud copy when you sign in and enable sync.</p><small>You choose your storage mode. Change it later in settings.</small></article></div></section>
      <section id="faq" className={`${s.section} ${s.faqSection}`} aria-labelledby="faq-title"><h2 id="faq-title">A few things<br /><span>you might wonder.</span></h2><div className={s.faqList}>{faqs.map(faq => <details key={faq.question}><summary>{faq.question}<Plus size={18} aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}</div></section>
      <section className={s.closing} aria-labelledby="closing-title"><div className={s.closingIdea} aria-hidden="true"><Link2 size={15} />Your next idea<Plus size={15} /></div><h2 id="closing-title">It’s already<br />in your notes<span>.</span></h2><p>Give it room to become something.</p><CanvasLink /><a href="#collection" className={s.backTop}>Back to the beginning <ArrowUpRight size={14} /></a></section>
    </main>
    <footer className={s.footer}><a href="#collection" aria-label="Chunked home"><Brand /></a><span>A little space for your next big thing.</span><div><button type="button" onClick={() => { manuallySet.current = true; setReduced(!reduced); }} aria-pressed={reduced} className={s.motionToggle}><span className={s.motionDot} />Motion: {reduced ? 'reduced' : 'full'}</button><span>© 2026 Chunked</span></div></footer>
  </div>;
}
