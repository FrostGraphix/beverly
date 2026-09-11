/**
 * Turns plain notification copy into safe display blocks.
 * The source remains text, never executable HTML.
 */
export function formatNotificationBody(value) {
    const normalized = String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    if (!normalized) return [];

    const lines = normalized
        .replace(/\s+(?=(?:[⚡📲📊🛡️]\s*)?\d+[.)]\s+)/gu, '\n')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.map((text) => {
        const numbered = text.match(/^(?:([⚡📲📊🛡️])\s*)?(\d+)[.)]\s+(.+)$/u);
        if (!numbered) return { kind: 'paragraph', text };
        return {
            kind: 'item',
            marker: `${numbered[1] ? `${numbered[1]} ` : ''}${numbered[2]}`,
            text: numbered[3].trim(),
        };
    });
}
