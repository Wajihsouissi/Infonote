/** Keep a press inside the input from starting a canvas drag or selection. */
const keepFromCanvas = (e: React.SyntheticEvent) => e.stopPropagation();

interface CardTitleInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Called when editing ends (blur, or Enter). */
    onCommit: () => void;
    className?: string;
    placeholder?: string;
}

/**
 * The editable title every card view shares. Enter commits, double-click
 * selects the whole title, and pointer events never reach the canvas.
 */
export function CardTitleInput({ value, onChange, onCommit, className, placeholder = 'Untitled' }: CardTitleInputProps) {
    return (
        <input
            type="text"
            className={`${className ?? ''} nodrag`}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onFocus={keepFromCanvas}
            onClick={keepFromCanvas}
            onPointerDown={keepFromCanvas}
            onMouseDown={keepFromCanvas}
            onDoubleClick={(e) => {
                e.stopPropagation();
                e.currentTarget.select();
            }}
        />
    );
}
