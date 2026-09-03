function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatInline(value) {
    return value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function formatAiMessage(value) {
    const lines = escapeHtml(String(value ?? '').trim()).split(/\r?\n/);
    const parts = [];
    let listItems = [];

    const flushList = () => {
        if (!listItems.length) return;
        parts.push(`<ul>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
        listItems = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        const bullet = line.match(/^[-•]\s+(.+)$/);
        if (bullet) {
            listItems.push(bullet[1]);
            continue;
        }

        flushList();
        if (!line) continue;
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        parts.push(heading
            ? `<h4>${formatInline(heading[1])}</h4>`
            : `<p>${formatInline(line)}</p>`);
    }
    flushList();
    return parts.join('');
}
