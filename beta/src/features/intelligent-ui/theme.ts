export function readUITheme(): Record<string, string> {
    const computed = getComputedStyle(document.documentElement);
    return {
        '--ui-bg': computed.getPropertyValue('--bg-card').trim() || '#fff',
        '--ui-surface': computed.getPropertyValue('--bg-node-well').trim() || '#f5f5f4',
        '--ui-text': computed.getPropertyValue('--text-main').trim() || '#242424',
        '--ui-muted': computed.getPropertyValue('--text-soft').trim() || '#626262',
        '--ui-border': computed.getPropertyValue('--line-strong').trim() || '#dededb',
        '--ui-accent': computed.getPropertyValue('--accent').trim() || '#205ecf',
        '--ui-menu': computed.getPropertyValue('--bg-raised').trim() || '#242424',
        '--ui-hover': computed.getPropertyValue('--hover-wash').trim() || 'rgba(127,127,127,.08)',
        '--ui-scroll-hover': computed.getPropertyValue('--text-faint').trim() || '#a3a3a3',
        '--ui-color-scheme': computed.colorScheme,
        '--ui-font': getComputedStyle(document.body).fontFamily,
    };
}
