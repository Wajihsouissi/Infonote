/**
 * Card dates: one parser, one storage shape, no timezone surprises.
 *
 * The app stores a card's date in two different shapes, because two different
 * controls write it:
 *
 *   CustomDatePicker  →  "2026-09-01T00:00:00.000Z"
 *   DateProperty      →  "2026-09-01"          (a bare <input type="date">)
 *
 * Both were then read back with `new Date(str)`, and that is the bug this
 * module exists to end. Per ECMA-262 a date-only form is parsed as *UTC*
 * midnight, so in every timezone west of UTC `new Date('2026-09-01').getDate()`
 * is 31 — the day before the one the user picked. The full-ISO shape has the
 * same problem for the same reason.
 *
 * What both shapes do have is the intended local calendar day in their first
 * ten characters, and nothing after those ten characters carries information
 * about which day was meant. So that is all we read. No parsing of the time
 * part, no offset arithmetic, no library: `parseCardDate` takes `YYYY-MM-DD`
 * and builds a local Date from the components, which is correct for both
 * writers in every zone and needs no migration of anything already stored.
 *
 * The rule this module enforces on its callers: never `new Date(string)`.
 * There is an ESLint guard for it over the kanban feature and the date picker.
 */

/** A local calendar day as `YYYY-MM-DD` — zero-padded, so it sorts as a string. */
export type DayKey = string;

/** The card fields a calendar can place cards by. */
export type CardDateField = 'dueDate' | 'startDate' | 'createdAt';

/** The date-carrying part of a note's data, which is all this module touches. */
export interface DatedFields {
    startDate?: string;
    dueDate?: string;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The hour every Date in this module sits at.
 *
 * Noon, never midnight. Two reasons, both real:
 *  - a one-hour DST shift cannot push a noon-anchored date across a day
 *    boundary, so day arithmetic stays exact without any special-casing;
 *  - there are zones where local midnight does not exist at all on the day DST
 *    starts (America/Santiago in September), and the Date constructor silently
 *    hands back 01:00 for it. Anchoring away from the boundary means no caller
 *    ever sees a time it did not ask for.
 */
const NOON = 12;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * The local calendar day a stored value means, or null if there isn't one.
 *
 * Reads the leading ten characters and ignores everything after them — the
 * `T00:00:00.000Z` on one shape and the absence of it on the other are
 * artefacts of which control did the writing, not facts about the day.
 *
 * The construct-then-compare round trip at the end is what rejects `2026-02-31`
 * and `2026-13-01`: the Date constructor rolls both forward rather than
 * failing, and a card silently landing on 3 March because someone typed 31
 * February is worse than one that reports itself as unscheduled.
 */
export function parseCardDate(raw?: string | null): Date | null {
    if (typeof raw !== 'string') return null;

    const m = DAY_RE.exec(raw.trim());
    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const out = new Date(year, month - 1, day, NOON);
    if (out.getFullYear() !== year || out.getMonth() !== month - 1 || out.getDate() !== day) {
        return null;
    }
    return out;
}

/** A Date as its local `YYYY-MM-DD`, read in the user's own calendar. */
export const dayKey = (d: Date): DayKey =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The day a stored value means, as a key. Null for anything unparsable. */
export const dayKeyOf = (raw?: string | null): DayKey | null => {
    const d = parseCardDate(raw);
    return d ? dayKey(d) : null;
};

/** A key back to a Date, for arithmetic. Null if the key is malformed. */
export const fromDayKey = (key: DayKey): Date | null => parseCardDate(key);

/**
 * A Date in the shape this app stores dates.
 *
 * Byte-identical to what CustomDatePicker writes, so a date set by dragging a
 * card on the calendar opens selected in the picker, and one set in the picker
 * lands on the cell the picker showed. One shape, both directions, no
 * migration.
 *
 * It gets there without `getTimezoneOffset()`, which is what the picker used to
 * do: composing "build local midnight, subtract the offset, serialise as UTC"
 * only ever cancels back to the local wall clock, so the offset was never doing
 * any work. Naming the day directly says the same thing and cannot drift.
 */
export const toStoredDate = (d: Date): string => `${dayKey(d)}T00:00:00.000Z`;

/** Today, as a key. */
export const todayKey = (): DayKey => dayKey(new Date());

export const isSameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

/* ------------------------------------------------------------ time of day */

export const MINUTES_PER_DAY = 1440;

const TIME_RE = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/;

/**
 * The time of day a stored value carries, in minutes past local midnight, or
 * null when it is an all-day date.
 *
 * Read from the literal characters, exactly as the day is, and for the same
 * reason: `toStoredDate` writes the local wall clock and labels it `Z`, so
 * `new Date(v).getHours()` would re-interpret it as UTC and shift every event
 * by the reader's offset.
 *
 * Midnight counts as "no time". That is not a guess — `T00:00:00.000Z` is
 * precisely what CustomDatePicker writes when someone picks a *day*, so
 * treating it as an event at 00:00 would drop every existing card onto the top
 * edge of the grid. A genuine midnight event is the price, and it is the right
 * way round: a calendar full of phantom midnight entries is worse than one
 * midnight event shown as all-day.
 */
export function parseCardTime(raw?: string | null): number | null {
    if (typeof raw !== 'string') return null;
    const m = TIME_RE.exec(raw.trim());
    if (!m) return null;

    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours > 23 || minutes > 59) return null;

    const total = hours * 60 + minutes;
    return total === 0 ? null : total;
}

/** True when a stored value names a day but no time — an all-day entry. */
export const isAllDay = (raw?: string | null): boolean =>
    parseCardDate(raw) !== null && parseCardTime(raw) === null;

/**
 * A day plus a time of day, in the shape this app stores dates.
 *
 * The same local-wall-clock-labelled-`Z` convention `toStoredDate` uses, so the
 * two round-trip through one parser. Passing `null` for the time writes the
 * all-day form and is identical to `toStoredDate`.
 */
export function toStoredDateTime(d: Date, minutes: number | null): string {
    if (minutes === null) return toStoredDate(d);
    const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
    const hh = pad2(Math.floor(clamped / 60));
    const mm = pad2(clamped % 60);
    return `${dayKey(d)}T${hh}:${mm}:00.000Z`;
}

/** `14:30` → "2:30 PM", in the reader's own locale. */
export function formatTimeOfDay(minutes: number): string {
    const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * A whole hour for a grid's gutter: "9 AM" where the locale uses a meridiem,
 * "09" where it does not.
 *
 * Deliberately not `formatTimeOfDay(hour * 60)` — a column of "9:00, 10:00,
 * 11:00" is three characters of `:00` repeated twenty-four times, saying
 * nothing the row position has not already said.
 */
export function formatHour(hour: number): string {
    const d = new Date(2000, 0, 1, hour, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

/* ------------------------------------------------------------- arithmetic */

/**
 * `n` days later.
 *
 * Component arithmetic through the local constructor, never `+ n * 86400000`:
 * adding milliseconds across a DST boundary lands 23 or 25 hours away, and the
 * day you get back is then a coin flip decided by the anchor hour.
 */
export const addDays = (d: Date, n: number): Date =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, NOON);

/**
 * `n` months later, clamped to the target month's length.
 *
 * 31 January + 1 month is 28 (or 29) February, never 3 March. The constructor
 * would happily roll the overflow forward, which is how paging a calendar from
 * a cursor sitting on the 31st skips February altogether.
 */
export function addMonths(d: Date, n: number): Date {
    const year = d.getFullYear();
    const month = d.getMonth();
    // Day 0 of the month after the target is the last day of the target.
    const lastOfTarget = new Date(year, month + n + 1, 0).getDate();
    return new Date(year, month + n, Math.min(d.getDate(), lastOfTarget), NOON);
}

/** `n` years later, with the same clamping (29 February + 1 year is 28 February). */
export const addYears = (d: Date, n: number): Date => addMonths(d, n * 12);

/**
 * Whole calendar days from `a` to `b`, signed.
 *
 * Both sides are projected onto UTC before subtracting, which removes DST from
 * the arithmetic entirely rather than leaving `Math.round` to absorb the odd
 * hour. Rounding works right up until someone hits a 30-minute DST shift.
 */
export function diffDays(a: Date, b: Date): number {
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86_400_000);
}

/** The Sunday of `d`'s week — matching the weekday row in CustomDatePicker. */
export const startOfWeek = (d: Date): Date => addDays(d, -d.getDay());

export const startOfMonth = (d: Date): Date =>
    new Date(d.getFullYear(), d.getMonth(), 1, NOON);

export const startOfYear = (d: Date): Date => new Date(d.getFullYear(), 0, 1, NOON);

/** `count` consecutive days beginning at `from`. */
export const daySpan = (from: Date, count: number): Date[] =>
    Array.from({ length: count }, (_, i) => addDays(from, i));

/**
 * The 42 cells of a month grid: the Sunday on or before the 1st, plus six weeks.
 *
 * Always six rows, never five. The board mirrors its rendered size onto the
 * canvas node through a resize observer, so a grid that changed height on the
 * months that happen to fit in five rows would fire a store write — and a cull
 * recompute — on roughly a third of month transitions, for nothing.
 */
export const monthMatrix = (cursor: Date): Date[] =>
    daySpan(startOfWeek(startOfMonth(cursor)), 42);

export const weekDays = (cursor: Date): Date[] => daySpan(startOfWeek(cursor), 7);

export const yearMonths = (cursor: Date): Date[] =>
    Array.from({ length: 12 }, (_, i) => new Date(cursor.getFullYear(), i, 1, NOON));

/* ------------------------------------------------------------------ spans */

/** However wrong a pair of dates is, it will not be expanded past this. */
export const MAX_SPAN_DAYS = 366;

export interface CardSpan {
    /** Every day the card occupies, inclusive and in order. Never empty. */
    keys: DayKey[];
    /** More than one day, so it draws as a bar rather than a point. */
    isSpan: boolean;
    /** The due date was before the start date; collapsed to the anchor day. */
    inverted: boolean;
    /** The range was longer than MAX_SPAN_DAYS and was cut short. */
    truncated: boolean;
}

/**
 * The days a card occupies on a calendar placed by `field`.
 *
 * A card draws as a bar only when the calendar is about planning: with
 * `createdAt` selected there is no partner date, so a card is always a point.
 *
 * The chosen field decides whether a card is on the calendar at all. A card
 * with only a start date is *not* on a calendar showing due dates, even though
 * it plainly has a date somewhere — because "Date: Due date" is a claim about
 * what this calendar means, and quietly placing such a card on its start date
 * instead would make the tray incoherent: dragging a card there to unschedule
 * it clears the field in view, and the card would simply reappear on the other
 * one. Switch the Date select to see it.
 *
 * Three things this deliberately does not do:
 *  - it never swaps an inverted pair, because that quietly rewrites what the
 *    user's data says. It collapses to the anchor and reports `inverted`, and
 *    the chip shows a marker;
 *  - it never returns an empty list, so no cell renderer can be handed a card
 *    that belongs nowhere;
 *  - it never expands an unbounded range. A typo'd year — `3026-01-01` against
 *    a start date this week — would otherwise materialise 365,000 array entries
 *    and 365,000 map inserts per card, on every rebuild of the index. That is a
 *    frozen tab, not a rendering glitch.
 */
export function cardSpan(
    startRaw: string | undefined,
    dueRaw: string | undefined,
    field: CardDateField,
    createdRaw?: string,
): CardSpan | null {
    const point = (d: Date, inverted = false): CardSpan =>
        ({ keys: [dayKey(d)], isSpan: false, inverted, truncated: false });

    if (field === 'createdAt') {
        const created = parseCardDate(createdRaw);
        return created ? point(created) : null;
    }

    const start = parseCardDate(startRaw);
    const due = parseCardDate(dueRaw);
    const anchor = field === 'startDate' ? start : due;

    // No value in the field this calendar is about: the card is unscheduled.
    if (!anchor) return null;

    // Only the anchor: a point rather than a bar.
    if (!start || !due) return point(anchor);

    const length = diffDays(start, due);
    if (length < 0) return point(anchor, true);

    const truncated = length + 1 > MAX_SPAN_DAYS;
    const count = truncated ? MAX_SPAN_DAYS : length + 1;
    return {
        keys: daySpan(start, count).map(dayKey),
        isSpan: count > 1,
        inverted: false,
        truncated,
    };
}

/* ------------------------------------------------------------------ writes */

/**
 * The patch that puts a card on `key`, or `{}` when it is already there.
 *
 * The empty return matters as much as the rest: `updateNodeData` stamps
 * `updatedAt` and marks the document cloud-dirty unconditionally, so a drop
 * that lands a card back where it started must produce no write at all.
 *
 * A span keeps its duration — moving the anchor carries the partner date with
 * it. When only one date exists and the drop would put it on the wrong side of
 * the other, both are clamped to the target day rather than left inverted: this
 * function never writes a pair it would refuse to read.
 *
 * `createdAt` returns `{}` always. Created is a fact, not a plan, and it is the
 * stable sort fallback in `groupCards` besides — letting a drag rewrite it
 * would silently reshuffle a board nobody was editing.
 */
export function scheduleCardPatch(
    data: DatedFields,
    field: CardDateField,
    key: DayKey,
): Partial<DatedFields> {
    if (field === 'createdAt') return {};
    if (dayKeyOf(data[field]) === key) return {};

    const target = fromDayKey(key);
    if (!target) return {};

    const start = parseCardDate(data.startDate);
    const due = parseCardDate(data.dueDate);

    if (start && due) {
        const length = Math.max(0, Math.min(diffDays(start, due), MAX_SPAN_DAYS - 1));
        return field === 'dueDate'
            ? { startDate: toStoredDate(addDays(target, -length)), dueDate: toStoredDate(target) }
            : { startDate: toStoredDate(target), dueDate: toStoredDate(addDays(target, length)) };
    }

    // One date set, and the drop would invert the pair: take both to the target.
    if (field === 'dueDate' && start && diffDays(start, target) < 0) {
        return { startDate: toStoredDate(target), dueDate: toStoredDate(target) };
    }
    if (field === 'startDate' && due && diffDays(target, due) < 0) {
        return { startDate: toStoredDate(target), dueDate: toStoredDate(target) };
    }

    return { [field]: toStoredDate(target) };
}

/**
 * The patch that puts a card on `key` at `minutes` past midnight.
 *
 * Built on `scheduleCardPatch` so a span still keeps its duration and an
 * inverted pair still cannot be written — the day rules are the day rules, and
 * only the clock reading is added on top. Passing `null` clears the time and
 * makes it an all-day card again, which is what dropping onto the all-day strip
 * means.
 */
export function scheduleCardAtTime(
    data: DatedFields,
    field: CardDateField,
    key: DayKey,
    minutes: number | null,
): Partial<DatedFields> {
    if (field === 'createdAt') return {};

    const target = fromDayKey(key);
    if (!target) return {};

    const dayPatch = scheduleCardPatch(data, field, key);
    /* An unchanged day still needs writing when the time moved, so the day
       patch being empty is not on its own a reason to stop. */
    const base: Partial<DatedFields> = Object.keys(dayPatch).length > 0
        ? dayPatch
        : { [field]: data[field] ?? toStoredDate(target) };

    const out: Partial<DatedFields> = {};
    for (const [name, value] of Object.entries(base) as [keyof DatedFields, string | undefined][]) {
        const day = parseCardDate(value);
        if (!day) { out[name] = value; continue; }
        /* Only the field being dragged takes the new time. Its partner keeps
           whatever clock reading it had, so moving the end of a meeting does
           not silently restate when it began. */
        out[name] = name === field
            ? toStoredDateTime(day, minutes)
            : toStoredDateTime(day, parseCardTime(data[name]));
    }

    if (out[field] === data[field]) return {};
    return out;
}

/** The shortest a resized event is allowed to become. */
export const MIN_RESIZE_MINUTES = 15;

/**
 * The patch that gives a card an explicit start and end on one day.
 *
 * What dragging an event's edge means. Unlike `scheduleCardAtTime` this writes
 * *both* dates whatever field the calendar is placing by, because that is what a
 * resize says: this thing begins here and ends there. Inferring one end from the
 * other would make the handle you did not drag move on its own.
 *
 * The pair is ordered and floored before it is written, so the same guarantee
 * `cardSpan` relies on holds — a resize can never produce a card that reads as
 * inverted, however the pointer was thrown around.
 */
export function resizeCardPatch(
    key: DayKey,
    startMinutes: number,
    endMinutes: number,
): Partial<DatedFields> {
    const day = fromDayKey(key);
    if (!day) return {};

    const lo = Math.max(0, Math.min(startMinutes, endMinutes));
    const hi = Math.min(MINUTES_PER_DAY - 1, Math.max(startMinutes, endMinutes));

    return {
        startDate: toStoredDateTime(day, lo),
        dueDate: toStoredDateTime(day, Math.max(hi, lo + MIN_RESIZE_MINUTES)),
    };
}

/**
 * The patch that takes a card off the calendar.
 *
 * Clears the field being looked at and nothing else. A card with both dates
 * dropped on the tray while the calendar shows due dates loses its due date and
 * keeps its start date — under this view it is now unscheduled, which is what
 * the Date select means. Clearing both would destroy data the user was not
 * looking at.
 */
export const unscheduleCardPatch = (field: CardDateField): Partial<DatedFields> =>
    field === 'createdAt' ? {} : { [field]: undefined };
