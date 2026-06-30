export function naira(minor: number | null | undefined): string {
    if (minor === null || minor === undefined) return '—';
    const n = minor / 100;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-NG', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function kwh(units: number | null | undefined): string {
    if (units === null || units === undefined) return '—';
    return `${Number(units).toFixed(2)} kWh`;
}

export function shortId(id: string | null | undefined, prefix = ''): string {
    if (!id) return '—';
    return `${prefix}${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
