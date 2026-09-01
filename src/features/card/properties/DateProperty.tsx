/**
 * A date property — start or due — on the card's properties panel.
 *
 * Uses the app's own CustomDatePicker rather than a hidden `<input type="date">`
 * driven by `showPicker()`. That input opened the *browser's* calendar: a dark
 * Chrome popover with its own arrows, its own Clear/Today links and none of the
 * Paper & Ink palette, dropped in the middle of a panel that is otherwise all
 * ours. It also had no way to say a time, which a card that appears on an hour
 * grid needs.
 *
 * Being the same control the board strip and the metadata panel use means a
 * date set here is set the same way, stored in the same shape, and — through
 * `withTime` — can carry the clock reading the calendar reads back.
 */

import { Calendar } from '../../../components/icons';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { PropertyRow } from './PropertyRow';

interface DatePropertyProps {
    value?: string;
    onChange: (val: string) => void;
    onHide: () => void;
    /** "Due Date" unless told otherwise — the same row serves the start date. */
    label?: string;
    /** Offer a time of day as well as a day. */
    withTime?: boolean;
}

export function DateProperty({
    value, onChange, onHide, label = 'Due Date', withTime = true,
}: DatePropertyProps) {
    return (
        <PropertyRow icon={Calendar} label={label} onHide={onHide}>
            <CustomDatePicker
                value={value ?? ''}
                placeholder="Empty"
                withTime={withTime}
                onChange={onChange}
            />
        </PropertyRow>
    );
}
