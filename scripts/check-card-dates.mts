/**
 * Fast, browser-free check of the card date module, in six timezones.
 *
 * Run: node --experimental-strip-types scripts/check-card-dates.mts
 *
 * The point of this file is that the bug it guards against is invisible in the
 * timezone most people develop in. `new Date('2026-09-01')` is correct in UTC
 * and one day early in Los Angeles, so a suite that runs only in the machine's
 * own zone proves nothing. A process cannot reliably change TZ after start —
 * the ICU data is already resolved — so this re-execs itself once per zone and
 * aggregates the results.
 *
 * The zones are chosen for what each one breaks:
 *   UTC                  the baseline everything accidentally passes in
 *   America/Los_Angeles  west of UTC: the classic date-only off-by-one
 *   Pacific/Kiritimati   +14, the far end of the same axis
 *   America/Santiago     DST starts at midnight — local 00:00 does not exist
 *   Asia/Kathmandu       +05:45, a non-hour offset
 *   Australia/Lord_Howe  a 30-minute DST shift
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    MAX_SPAN_DAYS,
    addDays,
    addMonths,
    addYears,
    cardSpan,
    dayKey,
    dayKeyOf,
    diffDays,
    isAllDay,
    monthMatrix,
    parseCardDate,
    parseCardTime,
    resizeCardPatch,
    scheduleCardPatch,
    startOfWeek,
    toStoredDate,
    toStoredDateTime,
    unscheduleCardPatch,
    weekDays,
    type CardDateField,
    type DatedFields,
} from '../src/utils/cardDate.ts';

const ZONES = [
    'UTC',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
    'America/Santiago',
    'Asia/Kathmandu',
    'Australia/Lord_Howe',
];

/* ------------------------------------------------------- zone fan-out */

if (!process.env.CARD_DATE_ZONE) {
    let failedZones = 0;
    for (const TZ of ZONES) {
        const result = spawnSync(
            process.execPath,
            ['--experimental-strip-types', fileURLToPath(import.meta.url)],
            { env: { ...process.env, TZ, CARD_DATE_ZONE: TZ }, stdio: 'inherit' },
        );
        if (result.status !== 0) failedZones++;
    }
    console.log(
        failedZones === 0
            ? `\nall ${ZONES.length} timezones passed`
            : `\n${failedZones} of ${ZONES.length} timezones FAILED`,
    );
    process.exit(failedZones === 0 ? 0 : 1);
}

/* ------------------------------------------------------------ harness */

const zone = process.env.CARD_DATE_ZONE;
let failures = 0;
let checks = 0;

const check = (label: string, actual: unknown, expected: unknown): void => {
    checks++;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failures++;
        console.log(`FAIL [${zone}] ${label}: ${a} (expected ${e})`);
    }
};

/* ------------------------------------------------- 1. the headline bug */

/* Both storage shapes name the same day, and must parse to it in every zone.
   This is the whole reason the module exists. */
for (const [label, raw] of [
    ['full ISO (CustomDatePicker)', '2026-09-01T00:00:00.000Z'],
    ['bare date (DateProperty)', '2026-09-01'],
] as const) {
    check(`${label} -> key`, dayKeyOf(raw), '2026-09-01');
    check(`${label} -> day of month`, parseCardDate(raw)!.getDate(), 1);
    check(`${label} -> month`, parseCardDate(raw)!.getMonth(), 8);
}

// The two shapes are interchangeable — the assertion the e2e spec mirrors.
check('both shapes agree', dayKeyOf('2026-09-01T00:00:00.000Z'), dayKeyOf('2026-09-01'));

// A date in the western hemisphere's danger window, and one at a year boundary.
check('new year eve, ISO', dayKeyOf('2027-01-01T00:00:00.000Z'), '2027-01-01');
check('new year eve, bare', dayKeyOf('2026-12-31'), '2026-12-31');

/* Round trip: what we write must read back as the same day, in every zone. */
for (const key of ['2026-01-01', '2026-06-15', '2026-09-01', '2026-12-31', '2027-02-28']) {
    check(`round trip ${key}`, dayKeyOf(toStoredDate(parseCardDate(key)!)), key);
}

/* ------------------------------------------------------- 2. bad input */

for (const bad of [
    '', ' ', 'tomorrow', '01/09/2026', '2026-13-01', '2026-02-31', '2026-00-10',
    '26-09-01', 'null', 'T00:00:00.000Z', 'undefined',
]) {
    check(`garbage ${JSON.stringify(bad)}`, parseCardDate(bad), null);
}
for (const bad of [undefined, null, 42, {}, [], true]) {
    check(`non-string ${JSON.stringify(bad) ?? 'undefined'}`, parseCardDate(bad as never), null);
}

// Real dates that only look suspicious.
check('leap day 2028 is valid', dayKeyOf('2028-02-29'), '2028-02-29');
check('non-leap 2026-02-29 rejected', parseCardDate('2026-02-29'), null);

/* --------------------------------------------------- 3. day arithmetic */

const sep1 = parseCardDate('2026-09-01')!;
check('addDays +0', dayKey(addDays(sep1, 0)), '2026-09-01');
check('addDays +1', dayKey(addDays(sep1, 1)), '2026-09-02');
check('addDays +30 crosses month', dayKey(addDays(sep1, 30)), '2026-10-01');
check('addDays -1', dayKey(addDays(sep1, -1)), '2026-08-31');
check('addDays -243 crosses year', dayKey(addDays(sep1, -243)), '2026-01-01');

/* Every DST transition in the sample zones falls somewhere in these windows.
   Stepping a day at a time across them must advance exactly one calendar day
   each time — this is what the noon anchor buys. */
for (const start of ['2026-03-06', '2026-03-27', '2026-04-03', '2026-09-04',
                     '2026-10-02', '2026-10-30', '2026-11-06']) {
    let cursor = parseCardDate(start)!;
    for (let i = 0; i < 8; i++) {
        const next = addDays(cursor, 1);
        check(`DST walk ${start} step ${i}`, diffDays(cursor, next), 1);
        check(`DST walk ${start} noon held ${i}`, next.getHours(), 12);
        cursor = next;
    }
}

check('diffDays symmetry', diffDays(sep1, addDays(sep1, 17)), 17);
check('diffDays reverse', diffDays(addDays(sep1, 17), sep1), -17);
check('diffDays same day', diffDays(sep1, sep1), 0);
check('diffDays across a year', diffDays(parseCardDate('2026-01-01')!, parseCardDate('2027-01-01')!), 365);

/* ------------------------------------------------- 4. month arithmetic */

const jan31 = parseCardDate('2026-01-31')!;
check('Jan 31 +1mo clamps to Feb', dayKey(addMonths(jan31, 1)), '2026-02-28');
check('Jan 31 +1mo in a leap year', dayKey(addMonths(parseCardDate('2028-01-31')!, 1)), '2028-02-29');
check('Jan 31 +2mo', dayKey(addMonths(jan31, 2)), '2026-03-31');
check('Jan 31 +3mo clamps to Apr', dayKey(addMonths(jan31, 3)), '2026-04-30');
check('Dec 31 +1mo crosses year', dayKey(addMonths(parseCardDate('2026-12-31')!, 1)), '2027-01-31');
check('Mar 31 -1mo clamps', dayKey(addMonths(parseCardDate('2026-03-31')!, -1)), '2026-02-28');
check('Jan 15 -1mo', dayKey(addMonths(parseCardDate('2026-01-15')!, -1)), '2025-12-15');
check('leap day +1yr clamps', dayKey(addYears(parseCardDate('2028-02-29')!, 1)), '2029-02-28');

/* Paging a year forward from the 1st must visit all twelve months in order —
   the failure this guards is a cursor on the 31st skipping February. */
let paging = parseCardDate('2026-01-31')!;
const visited: number[] = [];
for (let i = 0; i < 12; i++) {
    visited.push(paging.getMonth());
    paging = addMonths(paging, 1);
}
check('twelve months, none skipped', visited, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

/* ------------------------------------------------------------ 5. grids */

const matrix = monthMatrix(parseCardDate('2026-09-15')!);
check('month grid is 42 cells', matrix.length, 42);
check('month grid starts on a Sunday', matrix[0].getDay(), 0);
check('month grid opens before the 1st', dayKey(matrix[0]), '2026-08-30');
check('month grid is contiguous', diffDays(matrix[0], matrix[41]), 41);
check('month grid contains the cursor', matrix.some((d) => dayKey(d) === '2026-09-15'), true);

// February 2026 starts on a Sunday and has 28 days: the 5-row month, still 6 rows.
check('short month still 42 cells', monthMatrix(parseCardDate('2026-02-10')!).length, 42);

const week = weekDays(parseCardDate('2026-09-02')!);
check('week is 7 days', week.length, 7);
check('week starts Sunday', dayKey(week[0]), '2026-08-30');
check('week ends Saturday', dayKey(week[6]), '2026-09-05');
check('startOfWeek is idempotent', dayKey(startOfWeek(startOfWeek(sep1))), dayKey(startOfWeek(sep1)));

/* ------------------------------------------------------------ 6. spans */

const span = (s: string | undefined, e: string | undefined, f: CardDateField, c?: string) =>
    cardSpan(s, e, f, c);

check('no dates at all', span(undefined, undefined, 'dueDate'), null);
check('due only, one day', span(undefined, '2026-09-01', 'dueDate')?.keys, ['2026-09-01']);
check('due only is not a span', span(undefined, '2026-09-01', 'dueDate')?.isSpan, false);

/* The chosen field decides membership. A card with only a start date is not on
   a due-date calendar — otherwise dragging it to the tray, which clears the
   field in view, would leave it sitting on the other date and the gesture would
   look broken. */
check('start only is off a due calendar', span('2026-09-01', undefined, 'dueDate'), null);
check('due only is off a start calendar', span(undefined, '2026-09-01', 'startDate'), null);
check('start only is on a start calendar', span('2026-09-01', undefined, 'startDate')?.keys,
    ['2026-09-01']);
check('unreadable anchor is unscheduled', span(undefined, 'not a date', 'dueDate'), null);

const threeDay = span('2026-09-01', '2026-09-03', 'dueDate')!;
check('span covers 3 days', threeDay.keys, ['2026-09-01', '2026-09-02', '2026-09-03']);
check('span reports isSpan', threeDay.isSpan, true);
check('span begins at start', threeDay.keys[0], '2026-09-01');

check('span across a month', span('2026-08-30', '2026-09-02', 'dueDate')?.keys.length, 4);
check('span of one day is a point', span('2026-09-01', '2026-09-01', 'dueDate')?.isSpan, false);

const inverted = span('2026-09-10', '2026-09-01', 'dueDate')!;
check('inverted collapses to anchor', inverted.keys, ['2026-09-01']);
check('inverted is flagged', inverted.inverted, true);
check('inverted is never empty', inverted.keys.length > 0, true);
const invertedByStart = span('2026-09-10', '2026-09-01', 'startDate')!;
check('inverted anchors on start when viewing start', invertedByStart.keys, ['2026-09-10']);

const huge = span('2026-01-01', '3026-01-01', 'dueDate')!;
check('absurd span is truncated', huge.truncated, true);
check('absurd span is bounded', huge.keys.length, MAX_SPAN_DAYS);

check('createdAt is always a point', span('2026-09-01', '2026-09-09', 'createdAt', '2026-05-05')?.keys,
    ['2026-05-05']);
check('createdAt missing', span(undefined, undefined, 'createdAt', undefined), null);
check('garbage dates are unscheduled', span('nonsense', 'also nonsense', 'dueDate'), null);

/* ------------------------------------------------------------ 7. writes */

const patch = (data: DatedFields, f: CardDateField, key: string) => scheduleCardPatch(data, f, key);
const tenth = toStoredDate(parseCardDate('2026-09-10')!);

check('sets due when unset', patch({}, 'dueDate', '2026-09-10'), { dueDate: tenth });
check('no-op drop writes nothing', patch({ dueDate: '2026-09-10' }, 'dueDate', '2026-09-10'), {});
check('no-op across shapes writes nothing',
    patch({ dueDate: '2026-09-10T00:00:00.000Z' }, 'dueDate', '2026-09-10'), {});
check('createdAt never writes', patch({ dueDate: '2026-09-01' }, 'createdAt', '2026-09-10'), {});
check('malformed key writes nothing', patch({}, 'dueDate', 'not-a-day'), {});

// A span keeps its length when its anchor moves, in both directions.
const moved = patch({ startDate: '2026-09-01', dueDate: '2026-09-04' }, 'dueDate', '2026-09-20');
check('span moved by due keeps 3-day gap', dayKeyOf(moved.startDate), '2026-09-17');
check('span moved by due lands on target', dayKeyOf(moved.dueDate), '2026-09-20');

const movedStart = patch({ startDate: '2026-09-01', dueDate: '2026-09-04' }, 'startDate', '2026-09-20');
check('span moved by start lands on target', dayKeyOf(movedStart.startDate), '2026-09-20');
check('span moved by start keeps 3-day gap', dayKeyOf(movedStart.dueDate), '2026-09-23');

// Clamping: a drop that would invert the pair takes both dates instead.
const clamped = patch({ startDate: '2026-09-10' }, 'dueDate', '2026-09-05');
check('due before start clamps both', [dayKeyOf(clamped.startDate), dayKeyOf(clamped.dueDate)],
    ['2026-09-05', '2026-09-05']);
const clampedStart = patch({ dueDate: '2026-09-05' }, 'startDate', '2026-09-10');
check('start after due clamps both', [dayKeyOf(clampedStart.startDate), dayKeyOf(clampedStart.dueDate)],
    ['2026-09-10', '2026-09-10']);

// Never writes a pair it would refuse to read.
for (const [s, e, f, key] of [
    ['2026-09-10', undefined, 'dueDate', '2026-09-05'],
    [undefined, '2026-09-05', 'startDate', '2026-09-10'],
    ['2026-09-01', '2026-09-04', 'dueDate', '2026-08-01'],
] as const) {
    const written = patch({ startDate: s, dueDate: e }, f, key);
    if (written.startDate && written.dueDate) {
        const readBack = cardSpan(written.startDate, written.dueDate, f);
        check(`write ${f}@${key} reads back sane`, readBack?.inverted, false);
    }
}

/* ------------------------------------------------------- 8. time of day */

/* The rule the hour grid depends on: `T00:00:00.000Z` is what the date picker
   writes for a plain day, so it must read as "no time" — otherwise every
   existing card lands on the grid's top edge at midnight. */
check('all-day shape has no time', parseCardTime('2026-09-01T00:00:00.000Z'), null);
check('bare date has no time', parseCardTime('2026-09-01'), null);
check('all-day is reported as such', isAllDay('2026-09-01T00:00:00.000Z'), true);
check('garbage is not all-day', isAllDay('nonsense'), false);

check('morning time', parseCardTime('2026-09-01T09:30:00.000Z'), 9 * 60 + 30);
check('afternoon time', parseCardTime('2026-09-01T13:30:00.000Z'), 13 * 60 + 30);
check('one minute past midnight counts', parseCardTime('2026-09-01T00:01:00.000Z'), 1);
check('last minute of the day', parseCardTime('2026-09-01T23:59:00.000Z'), 23 * 60 + 59);
check('a timed value is not all-day', isAllDay('2026-09-01T09:30:00.000Z'), false);
check('impossible hour rejected', parseCardTime('2026-09-01T25:00:00.000Z'), null);
check('impossible minute rejected', parseCardTime('2026-09-01T10:75:00.000Z'), null);
check('non-string has no time', parseCardTime(undefined), null);

/* The time must survive the reader's own offset, which is the whole reason it
   is read from the literal string rather than through `new Date`. */
for (const [raw, expected] of [
    ['2026-09-01T09:30:00.000Z', 570],
    ['2026-01-15T17:45:00.000Z', 1065],
] as const) {
    check(`time is offset-proof ${raw}`, parseCardTime(raw), expected);
    // And the day it belongs to does not shift either.
    check(`day holds with a time ${raw}`, dayKeyOf(raw), raw.slice(0, 10));
}

const sept = parseCardDate('2026-09-01')!;
check('write a time', toStoredDateTime(sept, 9 * 60 + 30), '2026-09-01T09:30:00.000Z');
check('write midnight as all-day', toStoredDateTime(sept, null), '2026-09-01T00:00:00.000Z');
check('time round trips', parseCardTime(toStoredDateTime(sept, 810)), 810);
check('day round trips with a time', dayKeyOf(toStoredDateTime(sept, 810)), '2026-09-01');
check('minutes are clamped high', parseCardTime(toStoredDateTime(sept, 99_999)), 23 * 60 + 59);
check('negative minutes clamp to all-day', toStoredDateTime(sept, -30), '2026-09-01T00:00:00.000Z');

/* --------------------------------------------------------- 9. resizing */

const resized = resizeCardPatch('2026-09-01', 9 * 60, 11 * 60);
check('resize writes both ends', [dayKeyOf(resized.startDate), dayKeyOf(resized.dueDate)],
    ['2026-09-01', '2026-09-01']);
check('resize start time', parseCardTime(resized.startDate), 9 * 60);
check('resize end time', parseCardTime(resized.dueDate), 11 * 60);

/* However the pointer was thrown around, the pair comes out ordered — a resize
   must not be able to write something `cardSpan` would read as inverted. */
const backwards = resizeCardPatch('2026-09-01', 15 * 60, 10 * 60);
check('backwards resize is ordered', parseCardTime(backwards.startDate), 10 * 60);
check('backwards resize end', parseCardTime(backwards.dueDate), 15 * 60);
check('a resized card never reads inverted',
    cardSpan(backwards.startDate, backwards.dueDate, 'dueDate')?.inverted, false);

const collapsed = resizeCardPatch('2026-09-01', 10 * 60, 10 * 60);
check('zero-length resize gets a floor',
    parseCardTime(collapsed.dueDate)! - parseCardTime(collapsed.startDate)!, 15);

const clampedResize = resizeCardPatch('2026-09-01', -120, 99_999);
check('resize clamps to the day start', parseCardTime(clampedResize.startDate), null); // midnight = all-day
check('resize clamps to the day end', parseCardTime(clampedResize.dueDate), 23 * 60 + 59);
check('malformed day resizes nothing', resizeCardPatch('not-a-day', 60, 120), {});

check('unschedule clears due only', unscheduleCardPatch('dueDate'), { dueDate: undefined });
check('unschedule clears start only', unscheduleCardPatch('startDate'), { startDate: undefined });
check('unschedule is a no-op for created', unscheduleCardPatch('createdAt'), {});

/* ---------------------------------------------------------------- done */

if (failures > 0) {
    console.log(`[${zone}] ${failures} of ${checks} checks FAILED`);
    process.exit(1);
}
console.log(`[${zone}] all ${checks} checks passed`);
