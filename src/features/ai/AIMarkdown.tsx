import { Fragment, type ReactNode } from 'react';
import styles from './AIPanel.module.css';

/**
 * Just enough Markdown to read an answer in a 380px column.
 *
 * Deliberately builds React nodes rather than HTML strings: model output is
 * untrusted text, and there is no innerHTML anywhere in this path. The editor's
 * parser (pasteUtils) is the one that matters for content that lands on the
 * canvas — this one only has to render a transcript.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
    return text.split(INLINE).filter(Boolean).map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className={styles.mdCode}>{part.slice(1, -1)}</code>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
        return <Fragment key={key}>{part}</Fragment>;
    });
}

export function AIMarkdown({ text }: { text: string }) {
    const lines = text.split('\n');
    const out: ReactNode[] = [];

    let list: { ordered: boolean; items: string[] } | null = null;
    let fence: string[] | null = null;

    const flushList = () => {
        if (!list) return;
        const items = list.items.map((item, i) => <li key={i}>{inline(item, `li-${out.length}-${i}`)}</li>);
        out.push(
            list.ordered
                ? <ol key={`ol-${out.length}`} className={styles.mdList}>{items}</ol>
                : <ul key={`ul-${out.length}`} className={styles.mdList}>{items}</ul>
        );
        list = null;
    };

    // A plain loop rather than forEach: `fence` and `list` are mutated across
    // iterations, and TS drops that narrowing inside a callback.
    for (let index = 0; index < lines.length; index++) {
        const raw = lines[index];
        const line = raw.trimEnd();

        if (line.trim().startsWith('```')) {
            if (fence) {
                out.push(<pre key={`pre-${index}`} className={styles.mdPre}><code>{fence.join('\n')}</code></pre>);
                fence = null;
            } else {
                flushList();
                fence = [];
            }
            continue;
        }
        if (fence) {
            fence.push(raw);
            continue;
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (bullet || numbered) {
            const ordered = !!numbered;
            if (!list || list.ordered !== ordered) {
                flushList();
                list = { ordered, items: [] };
            }
            list.items.push((bullet ? bullet[1] : numbered![1]));
            continue;
        }
        flushList();

        if (!line.trim()) continue;

        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            out.push(
                <p key={`h-${index}`} className={level <= 2 ? styles.mdH2 : styles.mdH3}>
                    {inline(heading[2], `h-${index}`)}
                </p>
            );
            continue;
        }

        if (line.startsWith('> ')) {
            out.push(<blockquote key={`q-${index}`} className={styles.mdQuote}>{inline(line.slice(2), `q-${index}`)}</blockquote>);
            continue;
        }

        if (/^\s*([-*_]\s*){3,}$/.test(line)) {
            out.push(<hr key={`hr-${index}`} className={styles.mdRule} />);
            continue;
        }

        out.push(<p key={`p-${index}`} className={styles.mdP}>{inline(line, `p-${index}`)}</p>);
    }

    flushList();
    if (fence) out.push(<pre key="pre-tail" className={styles.mdPre}><code>{fence.join('\n')}</code></pre>);

    return <div className={styles.markdown}>{out}</div>;
}
