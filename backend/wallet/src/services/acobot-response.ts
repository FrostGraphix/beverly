const FILLER_PREFIX = /^(?:here(?:'|’)s what i found(?: based on your query)?|based on your query)[:.!]?\s*/i;

function humanizeLabel(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+count$/i, '')
        .replace(/^\w/, (character) => character.toUpperCase());
}

function formatDataSection(section: string): string {
    const match = section.match(/^\[DATA:\s*([^\]]+)\]\s*\n?([\s\S]*)$/i);
    if (!match) return section.trim();

    const heading = humanizeLabel(match[1]);
    const lines = match[2]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const field = line.match(/^[-•]\s*([^:]+):\s*(.+)$/);
            return field ? `**${humanizeLabel(field[1])}:** ${field[2].trim()}` : line;
        });

    if (lines.length === 1) return lines[0];
    return [`**${heading}**`, ...lines.map((line) => line.startsWith('- ') ? line : `- ${line}`)].join('\n');
}

export function formatOfflineContextAnswer(contextText: string): string {
    const answer = contextText
        .split(/\n{2,}/)
        .map((section) => section.trim())
        .filter((section) => section && !section.startsWith('[USER IDENTITY]'))
        .map((section) => {
            if (/^\[DATA:/i.test(section)) return formatDataSection(section);
            return section
                .replace(/^\[PERMISSION DENIED:\s*([^\]]+)\]\s*/i, '**Access denied:** ')
                .replace(/^\[DATA FETCH NOTICE:\s*([^\]]+)\]\s*/i, '**Notice:** ');
        })
        .filter(Boolean)
        .join('\n\n');

    return answer || 'No matching data found.';
}

export function normalizeBeverlyResponse(value: string): string {
    const normalized = value
        .trim()
        .replace(FILLER_PREFIX, '')
        .replace(/^\[DATA:\s*([^\]]+)\]\s*$/gim, (_match, label: string) => `**${humanizeLabel(label)}**`)
        .replace(/^[-•]\s*([^:\n]+)\s+Count:\s*/gim, (_match, label: string) => `**${humanizeLabel(label)}:** `)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return normalized || 'No matching data found.';
}
