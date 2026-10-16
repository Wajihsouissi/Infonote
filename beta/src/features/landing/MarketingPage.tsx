import { ArrowRight, FileText, Layers, Network, Sparkles } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { useStore } from '../../store/useStore';
import styles from './MarketingPage.module.css';

/**
 * The front door.
 *
 * Deliberately small, and deliberately literal: every line here names something
 * the beta can actually do today. The full app's marketing page promises teams,
 * templates and live collaboration — none of which is in this build — and a
 * landing page that oversells is how a beta collects the wrong users and the
 * wrong complaints.
 *
 * It is also not the finished thing: the richer journey page being designed
 * separately replaces this when it is ready. What matters now is that the first
 * screen is honest and leads straight into the product.
 */

const WHAT_IT_DOES = [
    {
        icon: Layers,
        title: 'An infinite canvas of cards',
        body: 'Write anywhere, drag things together, fuse two cards into one, or split one into many. Cards can hold other cards.',
    },
    {
        icon: FileText,
        title: 'A real editor inside every card',
        body: 'Headings, lists, to-dos, tables, code, images and files — the writing is not an afterthought pinned to a sticky note.',
    },
    {
        icon: Network,
        title: 'A mind map that writes itself',
        body: 'Open a card you have written in and the ideas are already laid out as a map. Change either side and the other follows.',
    },
    {
        icon: Sparkles,
        title: 'An assistant that works on your canvas',
        body: 'Ask about the cards you attach, or have it build cards, documents and maps onto the canvas while you watch.',
    },
];

export function MarketingPage() {
    const setView = useStore((s) => s.setView);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.brand}>
                    <Sparkles size={18} />
                    <span>Chnk it</span>
                </div>
                <nav className={styles.nav}>
                    <Button variant="ghost" size="sm" onClick={() => setView('login')}>Sign in</Button>
                    <Button variant="primary" size="sm" onClick={() => setView('canvas')} leadingIcon={<ArrowRight size={14} />}>
                        Open the canvas
                    </Button>
                </nav>
            </header>

            <main className={styles.main}>
                <section className={styles.hero}>
                    <p className={styles.eyebrow}>Beta</p>
                    <h1 className={styles.headline}>
                        Think in pieces.<br />
                        <span className={styles.headlineSoft}>Keep the whole picture.</span>
                    </h1>
                    <p className={styles.lede}>
                        Chnk it is an infinite canvas where every card is a real document, and the map
                        of how they connect draws itself as you write.
                    </p>
                    <div className={styles.heroActions}>
                        <Button variant="primary" onClick={() => setView('canvas')} leadingIcon={<ArrowRight size={15} />}>
                            Start writing — no account needed
                        </Button>
                        <Button variant="secondary" onClick={() => setView('signup')}>
                            Create an account
                        </Button>
                    </div>
                    <p className={styles.heroNote}>
                        Your work is saved in this browser. An account adds the AI assistant and lets
                        cards nest as deep as you like.
                    </p>
                </section>

                <section className={styles.features} aria-label="What it does">
                    {WHAT_IT_DOES.map(({ icon: Icon, title, body }) => (
                        <article key={title} className={styles.feature}>
                            <span className={styles.featureIcon}><Icon size={18} /></span>
                            <h2 className={styles.featureTitle}>{title}</h2>
                            <p className={styles.featureBody}>{body}</p>
                        </article>
                    ))}
                </section>

                <section className={styles.honesty}>
                    <h2 className={styles.honestyTitle}>What this beta does not do yet</h2>
                    <p className={styles.honestyBody}>
                        Your work lives on this device only — there is no cloud copy, so keep a backup
                        file from your profile page. Boards, timelines, sharing and web search are not
                        in this build. The AI does not search the web or make images.
                    </p>
                </section>
            </main>

            <footer className={styles.footer}>
                <span>Chnk it — beta</span>
                <button type="button" className={styles.footerLink} onClick={() => setView('login')}>Sign in</button>
            </footer>
        </div>
    );
}
