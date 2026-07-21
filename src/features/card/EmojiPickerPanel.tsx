import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';

/**
 * Thin wrapper around `emoji-picker-react` (a ~34MB dependency bundling the full
 * emoji dataset). Isolated in its own module so IconPicker can `React.lazy` it —
 * the package is only fetched when the user actually opens the Emojis tab, which
 * keeps it out of the feature chunks that render IconPicker eagerly.
 */
export default function EmojiPickerPanel({ onPick }: { onPick: (emoji: string) => void }) {
    return (
        <EmojiPicker
            onEmojiClick={(emojiData: EmojiClickData) => onPick(emojiData.emoji)}
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.DARK}
            lazyLoadEmojis={true}
            width="100%"
            height={400}
        />
    );
}
