/** Only web destinations can become executable links in rich text. */
export function toSafeHttpUrl(value: string): string | null {
    const normalized = /^www\./i.test(value) ? `https://${value}` : value;
    try {
        const parsed = new URL(normalized);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
    } catch { return null; }
}

/** A typed domain is convenient; an explicit unsupported scheme is an error. */
export function normalizeLinkInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || Array.from(trimmed).some(character => character.charCodeAt(0) <= 32)) return null;
    return toSafeHttpUrl(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
}
