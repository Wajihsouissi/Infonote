import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { clsx as cn } from 'clsx';
import styles from './Tabs.module.css';

/**
 * The one tab / segmented control in the app.
 *
 * Before this, eight places grew their own: `.effortSeg` in the AI panel,
 * `.segmented` in ProfilePage, `.tabs` in AuthModal, IconPicker,
 * MediaPlaceholder and YouTubeStudio, `.tabButton` in BlockMenu. They agreed
 * on the idea and disagreed on every detail — radius, weight, whether the
 * active state was neutral or accent, and whether it moved at all.
 *
 * What this adds beyond consolidation is the *cursor*: a single element that
 * slides from the old tab to the new one instead of one background switching
 * off while another switches on. That is the HeroUI/React-Aria behaviour, and
 * it is the reason a tab strip reads as one control rather than a row of
 * buttons. The pill also stretches on the way, because it animates width as
 * well as position.
 *
 * Everything visual comes from design-system.css tokens, so a tab strip
 * inherits Paper & Ink and follows the theme without a second definition.
 */

export interface TabItem<T extends string = string> {
    id: T;
    /** Omit for an icon-only tab — then `ariaLabel` is what names it. */
    label?: ReactNode;
    /** Leading glyph. Sized by the caller; the strip only lays it out. */
    icon?: ReactNode;
    /** The accessible name. Required when there is no visible `label`. */
    ariaLabel?: string;
    /** Native tooltip — the one-line "what does this do" (e.g. an effort hint). */
    hint?: string;
    /** Trailing count or dot. */
    badge?: ReactNode;
    disabled?: boolean;
}

export type TabsVariant = 'solid' | 'light' | 'underlined' | 'bordered';
export type TabsColor = 'neutral' | 'accent' | 'primary';
export type TabsSize = 'sm' | 'md' | 'lg';
export type TabsRadius = 'control' | 'md' | 'full';

/**
 * The tab element that caused the change, in the shape of the event it came
 * from. Deliberately matches `{ currentTarget }` so helpers written against a
 * React event — `originFromEvent`, which reads a click's screen position to
 * start the theme view-transition from it — keep working unchanged.
 *
 * On keyboard navigation this is the tab being moved TO, not the one that had
 * focus, so an origin computed from it points at what the user just chose.
 */
export interface TabTrigger {
    currentTarget: HTMLButtonElement | null;
}

export interface TabsProps<T extends string = string> {
    items: readonly TabItem<T>[];
    /** `null` for a genuinely unset control — the cursor is hidden until a
     *  first choice is made, rather than a default being implied. */
    value: T | null;
    onChange: (id: T, trigger: TabTrigger) => void;
    /**
     * `solid` — pill cursor inside an inset well (the default segmented look).
     * `light` — cursor only, no well; for strips sitting on their own surface.
     * `underlined` — cursor is a bar beneath the label; for page-level tabs.
     * `bordered` — outlined well, no fill on the cursor.
     */
    variant?: TabsVariant;
    /**
     * `neutral` is right for a setting the user rests in. Reserve `accent` and
     * `primary` for a strip whose choice is closer to an action — the accent
     * is load-bearing elsewhere and goes quiet if a picker spends it.
     */
    color?: TabsColor;
    size?: TabsSize;
    radius?: TabsRadius;
    /** Stretch to fill the parent, splitting the width evenly. */
    fullWidth?: boolean;
    /** Square tabs sized for a glyph alone. Give every item an `ariaLabel`. */
    iconOnly?: boolean;
    /**
     * `tabs` gives tablist/tab roles — correct when the strip switches which
     * panel is on screen. `radio` gives radiogroup/radio — correct for a
     * setting picker like effort or theme, where nothing is being navigated.
     */
    semantics?: 'tabs' | 'radio';
    /** Required unless a visible label already names the group. */
    'aria-label'?: string;
    'aria-labelledby'?: string;
    className?: string;
}

interface CursorBox { x: number; y: number; width: number; height: number }

export function Tabs<T extends string = string>({
    items,
    value,
    onChange,
    variant = 'solid',
    color = 'neutral',
    size = 'md',
    radius,
    fullWidth = false,
    iconOnly = false,
    semantics = 'tabs',
    className,
    ...aria
}: TabsProps<T>) {
    const rootRef = useRef<HTMLDivElement>(null);
    const refs = useRef(new Map<string, HTMLButtonElement | null>());
    const [box, setBox] = useState<CursorBox | null>(null);

    const enabled = useMemo(() => items.filter((i) => !i.disabled), [items]);

    /* The measure effect keys off this rather than `items`, so a caller that
       builds its array inline — perfectly reasonable when one label carries a
       live count — does not tear down and rebuild the ResizeObserver on every
       render. Only a change to which tabs exist should re-run it. */
    const itemsKey = items.map((i) => i.id).join('\u0000');

    /**
     * Where the pill should be, measured from the selected tab.
     *
     * The obvious implementation is motion's `layoutId`, and it was the first
     * one here — but that projects through the viewport, so any ancestor with
     * a transform throws the result off. The AI panel slides itself in with
     * exactly such a transform, and the pill landed 500px below its tab.
     * `offsetLeft`/`offsetTop` are relative to the strip (which is
     * position:relative, so it is the offsetParent) and are untouched by
     * ancestor transforms, so this works wherever the strip is mounted.
     */
    useLayoutEffect(() => {
        const measure = () => {
            /* Nothing selected measures to nothing; the render guard below is
               what actually hides the cursor, so this only has to not throw. */
            const node = value === null ? null : refs.current.get(value);
            if (!node) return;
            setBox((prev) => {
                const next = {
                    x: node.offsetLeft,
                    y: node.offsetTop,
                    width: node.offsetWidth,
                    height: node.offsetHeight,
                };
                // Bail on an identical box so a ResizeObserver callback that
                // fires for an unrelated reason cannot loop.
                if (prev && prev.x === next.x && prev.y === next.y
                    && prev.width === next.width && prev.height === next.height) return prev;
                return next;
            });
        };

        measure();

        // Re-measure when the strip or any label changes size: a web font
        // arriving late, a badge count going from 9 to 10, or the parent
        // resizing under `fullWidth` all move the target.
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        if (rootRef.current) observer.observe(rootRef.current);
        for (const node of refs.current.values()) if (node) observer.observe(node);
        return () => observer.disconnect();
    }, [value, itemsKey, size, variant, fullWidth, iconOnly]);

    /* Roving focus. Arrows move to the next enabled tab and select it as they
       go (automatic activation) — with three or four options that is faster
       than requiring Enter, and matches what these controls did as buttons. */
    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>) => {
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (!keys.includes(event.key) || enabled.length === 0) return;
            event.preventDefault();

            const current = enabled.findIndex((i) => i.id === value);
            const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;

            let next: number;
            if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = enabled.length - 1;
            else next = (Math.max(current, 0) + step + enabled.length) % enabled.length;

            const target = enabled[next];
            if (!target) return;
            const node = refs.current.get(target.id) ?? null;
            onChange(target.id, { currentTarget: node });
            node?.focus();
        },
        [enabled, onChange, value],
    );

    const isRadio = semantics === 'radio';

    return (
        <div
            {...aria}
            ref={rootRef}
            role={isRadio ? 'radiogroup' : 'tablist'}
            className={cn(styles.root, fullWidth && styles.fullWidth, className)}
            data-variant={variant}
            data-color={color}
            data-size={size}
            data-radius={radius ?? (variant === 'underlined' ? 'control' : 'full')}
            data-icon-only={iconOnly || undefined}
        >
            {/* One cursor for the whole strip, not one background per tab —
                that is the entire difference between a strip that glides and a
                row of buttons that blink. The glide is a CSS transition
                (Tabs.module.css), which never runs on first paint, so the
                cursor does not fly in from the corner. */}
            {value !== null && box && (
                <span
                    className={styles.cursor}
                    aria-hidden="true"
                    style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.width, height: box.height }}
                />
            )}

            {items.map((item) => {
                const selected = item.id === value;
                /* With nothing selected there is still exactly one tab stop:
                   the first enabled tab, so Tab always reaches the strip. */
                const isFocusStop = value === null ? item.id === enabled[0]?.id : selected;
                return (
                    <button
                        key={item.id}
                        ref={(node) => {
                            refs.current.set(item.id, node);
                        }}
                        type="button"
                        role={isRadio ? 'radio' : 'tab'}
                        aria-selected={isRadio ? undefined : selected}
                        aria-checked={isRadio ? selected : undefined}
                        /* One stop for the whole strip: Tab enters it, arrows
                           move within it, Tab leaves it. */
                        tabIndex={isFocusStop ? 0 : -1}
                        disabled={item.disabled}
                        title={item.hint ?? (item.label == null ? item.ariaLabel : undefined)}
                        aria-label={item.ariaLabel}
                        className={styles.tab}
                        data-selected={selected || undefined}
                        onClick={(event) => onChange(item.id, event)}
                        onKeyDown={onKeyDown}
                    >
                        <span className={styles.content}>
                            {item.icon}
                            {item.label != null && <span className={styles.label}>{item.label}</span>}
                            {item.badge != null && <span className={styles.badge}>{item.badge}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

