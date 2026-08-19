import { downloadReceiptPdf as downloadCanonicalReceiptPdf, receiptHtml as canonicalReceiptHtml } from '../../../../src/services/receipt-tools.mjs';

type ReceiptField = { label: string; value: unknown; wide?: boolean; token?: boolean };

export type ReceiptModel = {
  title: string;
  receiptId: string;
  amount?: string;
  status?: string;
  issuedAt?: string;
  subject?: string;
  subtitle?: string;
  fields: ReceiptField[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function money(minor: unknown): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })
    .format(Number(minor || 0) / 100);
}

function date(value: unknown): string {
  if (!value) return '-';
  return new Date(String(value)).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function field(label: string, value: unknown, options: Pick<ReceiptField, 'wide' | 'token'> = {}): ReceiptField {
  return { label, value: clean(value), ...options };
}

function legacyReceiptHtml(model: ReceiptModel): string {
  const token = model.fields.find((item) => item.token);
  const fields = model.fields.filter((item) => !item.token);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(model.title)} ${escapeHtml(model.receiptId)}</title>
  <style>
    *{box-sizing:border-box}@page{size:A4;margin:0}html{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
    body{margin:0;padding:24px;background:#050608;color:#d7dee9;font-family:Inter,"Segoe UI",Arial,sans-serif}
    .receipt{width:148mm;margin:0 auto;padding:12mm;position:relative;overflow:hidden;background:linear-gradient(180deg,#101216,#07080a);border:1px solid rgba(255,214,0,.28);border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.38),0 0 0 6px rgba(255,214,0,.04)}
    .receipt:before{content:"";position:absolute;inset:0 0 auto;height:5px;background:linear-gradient(90deg,#b99700,#ffd600,#fff2a6)}
    header{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start;margin-bottom:18px}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:10px}.mark{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#ffd600,#fff2a6);color:#111;font-size:18px;font-weight:900}.brand-name{color:#f8fafc;font-size:20px;font-weight:850}
    h1{margin:0;color:#f8fafc;font-size:21px;line-height:1.2}.sub{margin:4px 0 0;color:#8f98a8;font-size:12px}
    .meta{min-width:150px;padding:11px 12px;border:1px solid rgba(255,214,0,.28);border-radius:16px;background:#11151b;text-align:right;color:#8f98a8;font-size:11px}.meta strong{display:block;color:#ffd600;font-size:13px;margin-bottom:4px}
    .time{display:inline-flex;gap:6px;margin-top:10px;padding:7px 10px;border:1px solid rgba(255,214,0,.28);border-radius:999px;background:rgba(255,214,0,.08);color:#f8fafc;font-size:11px;font-weight:750}.time span{color:#ffd600;text-transform:uppercase;letter-spacing:.08em;font-size:9px}
    .amount{margin-bottom:14px;padding:18px;border:1px solid rgba(255,214,0,.28);border-radius:18px;background:linear-gradient(135deg,rgba(255,214,0,.12),rgba(255,214,0,.04));text-align:center}.amount span{display:block;color:#ffd600;text-transform:uppercase;letter-spacing:.1em;font-size:10px;font-weight:850;margin-bottom:7px}.amount strong{display:block;color:#ffd600;font-size:36px;line-height:1;font-weight:900}
    .status{display:inline-flex;margin-bottom:14px;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,214,0,.24);color:#ffd600;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
    .token{margin-bottom:14px;padding:15px;border:1px solid rgba(255,214,0,.28);border-radius:16px;background:#030407;text-align:center}.token span{display:block;color:#ffd600;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}.token strong{color:#ffd600;font-family:"Cascadia Mono","Courier New",monospace;font-size:20px;letter-spacing:2px;word-break:break-all}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.item{min-width:0;padding:9px 10px;border:1px solid rgba(255,214,0,.14);border-radius:12px;background:rgba(255,255,255,.025)}.item.wide{grid-column:1/-1}.item span{display:block;color:#8f98a8;font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.item strong{display:block;color:#d7dee9;font-size:10px;line-height:1.35;word-break:break-word}
    footer{text-align:center;padding-top:14px;border-top:1px solid rgba(22,163,74,.22);color:#64756b;font-size:10px;line-height:1.6}footer strong{display:block;color:#10281a;font-size:12px;margin-bottom:6px}
    body{background:#eef7f0;color:#183126}.receipt{background:#fff;border-color:rgba(22,163,74,.24);box-shadow:0 24px 70px rgba(22,70,40,.14),0 0 0 6px rgba(22,163,74,.04)}.receipt:before{background:linear-gradient(90deg,#15803d,#22c55e,#86efac)}
    .mark{background:linear-gradient(135deg,#16a34a,#86efac);color:#071d0f}.brand-name,h1{color:#10281a}.sub,.meta,.item span{color:#64756b}.meta{border-color:rgba(22,163,74,.24);background:#f4faf6}.meta strong,.time span,.amount span,.amount strong,.status,.token span,.token strong{color:#16a34a}.time,.amount,.status,.token{border-color:rgba(22,163,74,.24)}.time{background:rgba(22,163,74,.08);color:#183126}.amount{background:linear-gradient(135deg,rgba(22,163,74,.12),rgba(22,163,74,.04))}.token{background:#f2fbf5}.item{border-color:rgba(22,163,74,.14);background:#f8fcf9}.item strong{color:#183126}
    @media print{body{width:210mm;min-height:297mm;padding:0;background:#fff}.receipt{width:148mm;box-shadow:none;border-radius:18px}}@media(max-width:720px){body{padding:0}.receipt{width:100%;min-height:100vh;border-radius:0;padding:20px}header,.grid{grid-template-columns:1fr}.meta{text-align:left}}
  </style></head><body><main class="receipt"><header><div><div class="brand"><div class="mark">B</div><div class="brand-name">Beverly</div></div><h1>${escapeHtml(model.title)}</h1><p class="sub">${escapeHtml(model.subtitle || 'Wallet operations receipt')}</p><div class="time"><span>Time</span>${escapeHtml(model.issuedAt || date(new Date().toISOString()))}</div></div><div class="meta"><strong>#${escapeHtml(model.receiptId)}</strong><span>Receipt ID</span></div></header>${model.amount ? `<section class="amount"><span>${escapeHtml(model.subject || 'Amount')}</span><strong>${escapeHtml(model.amount)}</strong></section>` : ''}${model.status ? `<div class="status">${escapeHtml(model.status)}</div>` : ''}${token ? `<section class="token"><span>${escapeHtml(token.label)}</span><strong>${escapeHtml(token.value)}</strong></section>` : ''}<section class="grid">${fields.map((item) => `<div class="item ${item.wide ? 'wide' : ''}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('')}</section><footer><strong>ACOB Lighting Technology Limited</strong>support@acoblighting.com &bull; +234 800 BEVERLY<br>www.acoblighting.com</footer></main></body></html>`;
}

function canonicalReceipt(model: ReceiptModel) {
  return {
    ...model,
    subtitle: model.subtitle || '',
    generatedAt: model.issuedAt || date(new Date().toISOString()),
    brand: {
      name: 'Beverly', company: 'ACOB Lighting Technology Limited', email: 'info@acoblighting.com',
      phone: '+234 704 920 2634 / +234 803 290 2825', web: 'www.acoblighting.com',
      address: 'Plot 2, Block 14 Extension, Setraco Gate, Gwarinpa, FCT, Nigeria',
    },
    fields: [field('Receipt Id', model.receiptId), ...model.fields].map((item) => ({
      label: item.label, value: clean(item.value), isToken: Boolean(item.token), emphasis: Boolean(item.token), section: 'transaction',
    })),
  };
}

function receiptHtml(model: ReceiptModel, options: any = {}): string {
  return canonicalReceiptHtml(canonicalReceipt(model), options);
}

function removeReceiptModal(): void {
  document.getElementById('beverly-receipt-modal')?.remove();
}

function openReceipt(model: ReceiptModel, shouldPrint: boolean): void {
  removeReceiptModal();
  const host = document.createElement('div');
  host.id = 'beverly-receipt-modal';
  host.innerHTML = `
    <div class="brm-backdrop">
      <section class="brm-sheet" role="dialog" aria-modal="true" aria-label="Receipt preview">
        <header class="brm-head">
          <div class="brm-title">
            <span class="brm-print-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </span>
            <div>
              <strong>${escapeHtml(model.title)}</strong>
              <span class="brm-subtitle">Official ACOB Billing Voucher · ${escapeHtml(model.receiptId)}</span>
            </div>
          </div>
          <button class="brm-close-btn" data-close aria-label="Close">×</button>
        </header>
        <iframe class="brm-frame" title="Receipt preview"></iframe>
        <footer class="brm-actions">
          <button class="brm-btn secondary" data-print-btn>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <button class="brm-btn primary" data-pdf>PDF Export</button>
          <button class="brm-btn danger" data-close>Cancel</button>
          <span class="brm-status" role="status" aria-live="polite"></span>
        </footer>
      </section>
    </div>
    <style>
      #beverly-receipt-modal{position:fixed;inset:0;z-index:99999}
      .brm-backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.75);backdrop-filter:blur(12px)}
      .brm-sheet{width:min(860px,calc(100vw - 24px));height:min(90dvh,860px);display:grid;grid-template-rows:auto 1fr auto;background:#0d1117;border:1px solid oklch(70% 0.19 145 / 0.35);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06);overflow:hidden}
      .brm-head,.brm-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#11151d;border-bottom:1px solid rgba(255,255,255,.08)}
      .brm-actions{border-top:1px solid rgba(255,255,255,.08);border-bottom:0;justify-content:flex-end}
      .brm-title{display:flex;align-items:center;gap:12px;min-width:0}
      .brm-print-icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid oklch(70% 0.19 145 / 0.35);border-radius:10px;background:oklch(70% 0.19 145 / 0.12);color:var(--brand,#22c55e);flex-shrink:0}
      .brm-head strong{display:block;color:#f8fafc;font-size:16px;font-weight:700}
      .brm-subtitle{display:block;font-size:12px;color:#94a3b8;font-weight:400;margin-top:1px}
      .brm-close-btn{width:32px;height:32px;border:1px solid rgba(239,68,68,.4);border-radius:8px;background:rgba(239,68,68,.16);color:#fca5a5;font-size:20px;display:grid;place-items:center;cursor:pointer;transition:all .15s ease}
      .brm-close-btn:hover{background:#dc2626;color:#ffffff;border-color:#dc2626}
      .brm-frame{width:100%;height:100%;border:0;background:#090d14}
      .brm-btn{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:all .15s ease}
      .brm-btn:disabled{cursor:wait;opacity:.65}
      .brm-btn.primary{background:var(--brand,#22c55e);color:#000;border-color:var(--brand,#22c55e);box-shadow:0 4px 14px oklch(70% 0.19 145 / 0.25)}
      .brm-btn.primary:hover{filter:brightness(1.1)}
      .brm-btn.secondary{background:rgba(255,255,255,.08);color:#f8fafc;border-color:rgba(255,255,255,.14)}
      .brm-btn.secondary:hover{background:rgba(255,255,255,.14)}
      .brm-btn.danger{background:#dc2626 !important;color:#ffffff !important;border-color:#dc2626 !important;box-shadow:0 4px 12px rgba(220,38,38,.35)}
      .brm-btn.danger:hover{background:#b91c1c !important;border-color:#b91c1c !important}
      .brm-status{color:#22c55e;font-size:12px;font-weight:500;margin-left:auto}

      /* Light Theme Overrides */
      [data-theme="light"] .brm-sheet { background: #ffffff !important; border-color: rgba(0,0,0,.15) !important; box-shadow: 0 20px 60px rgba(0,0,0,.15) !important; }
      [data-theme="light"] .brm-head, [data-theme="light"] .brm-actions { background: #f8fafc !important; border-color: rgba(0,0,0,.08) !important; }
      [data-theme="light"] .brm-head strong { color: #0f172a !important; }
      [data-theme="light"] .brm-subtitle { color: #64748b !important; }
      [data-theme="light"] .brm-frame { background: #f1f5f9 !important; }
      [data-theme="light"] .brm-btn.secondary { background: #f1f5f9 !important; color: #334155 !important; border-color: #cbd5e1 !important; }
      [data-theme="light"] .brm-btn.secondary:hover { background: #e2e8f0 !important; }

      @media(max-width:640px){
        .brm-backdrop{padding:0}
        .brm-sheet{width:100vw;height:100dvh;border-radius:0;border:0}
        .brm-head,.brm-actions{padding:10px 14px}
        .brm-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .brm-btn{width:100%;justify-content:center;height:42px;font-size:13px}
        .brm-btn.danger{grid-column:1/-1;order:3}
        .brm-status{grid-column:1/-1;text-align:center;margin:0}
      }
    </style>`;
  document.body.appendChild(host);
  const frame = host.querySelector<HTMLIFrameElement>('.brm-frame');
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const html = receiptHtml(model, { theme: { isDark: !isLight } });
  let frameLoaded = false;
  const previousFocus = document.activeElement as HTMLElement | null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    frame?.contentDocument?.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    removeReceiptModal();
    previousFocus?.focus();
  };
  const printFrame = () => {
    const run = () => frame?.contentWindow?.print();
    if (frameLoaded) {
      setTimeout(run, 120);
      return;
    }
    frame?.addEventListener('load', () => setTimeout(run, 120), { once: true });
  };
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') cleanup();
    if (event.key !== 'Tab') return;
    const controls = [...host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.target instanceof Node && event.target.ownerDocument !== document) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  if (frame) {
    frame.addEventListener('load', () => {
      frameLoaded = true;
      frame.contentDocument?.addEventListener('keydown', onKey);
    }, { once: true });
    frame.srcdoc = html;
  }
  host.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', cleanup));
  host.querySelector('[data-print-btn]')?.addEventListener('click', () => printFrame());
  host.querySelector('[data-pdf]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const status = host.querySelector<HTMLElement>('.brm-status');
    button.disabled = true;
    button.textContent = 'Exporting...';
    try {
      const result = await downloadCanonicalReceiptPdf(canonicalReceipt(model));
      if (status) status.textContent = result.mode === 'server' ? 'PDF downloaded.' : 'Basic PDF downloaded.';
    } finally {
      button.disabled = false;
      button.textContent = 'PDF Export';
    }
  });
  host.querySelector('.brm-backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) cleanup();
  });
  window.addEventListener('keydown', onKey);
  host.querySelector<HTMLButtonElement>('[data-close]')?.focus();
  if (shouldPrint) printFrame();
}

export function viewReceipt(model: ReceiptModel): void { openReceipt(model, false); }
export function printReceipt(model: ReceiptModel): void { openReceipt(model, true); }

export function downloadReceipt(model: ReceiptModel): void {
  void downloadCanonicalReceiptPdf(canonicalReceipt(model));
}

export function resolveTariffDetails(row: any): { tariffName: string; tariffPrice: string } {
  const rawId = String(row?.tariffName || row?.tariff_name || row?.tariffId || row?.tariff_id || row?.tariff_display_name || row?.tariff || 'RESIDENTIAL').trim();
  const tariffName = rawId;

  let rateNaira = 0;
  if (typeof row?.price === 'number' && row.price > 0) {
    rateNaira = row.price;
  } else if (typeof row?.price === 'string' && Number(row.price) > 0) {
    rateNaira = Number(row.price);
  } else if (typeof row?.tariff_price === 'number' && row.tariff_price > 0) {
    rateNaira = row.tariff_price;
  } else if (typeof row?.tariff_naira_per_kwh === 'number' && row.tariff_naira_per_kwh > 0) {
    rateNaira = row.tariff_naira_per_kwh;
  } else if (typeof row?.effective_price_ngn === 'number' && row.effective_price_ngn > 0) {
    rateNaira = row.effective_price_ngn;
  } else if (typeof row?.unit_price_ngn === 'number' && row.unit_price_ngn > 0) {
    rateNaira = row.unit_price_ngn;
  } else if (row?.units_kwh && Number(row.units_kwh) > 0) {
    const grossNaira = (row.amount_minor != null ? Number(row.amount_minor) : 0) / 100;
    const energyNaira = (row.energy_amount_minor != null ? Number(row.energy_amount_minor) : grossNaira * 0.93023) / 100;
    const grossRate = grossNaira > 0 ? Math.round((grossNaira / Number(row.units_kwh)) * 100) / 100 : 0;
    const energyRate = energyNaira > 0 ? Math.round((energyNaira / Number(row.units_kwh)) * 100) / 100 : 0;

    if (grossRate === 350 || grossRate === 450 || grossRate === 400 || grossRate === 300 || grossRate === 500) {
      rateNaira = grossRate;
    } else if (energyRate > 0) {
      rateNaira = energyRate;
    } else {
      rateNaira = grossRate;
    }
  }

  if (!rateNaira || rateNaira <= 0) {
    const upper = rawId.toUpperCase();
    rateNaira = upper.includes('KOLO') || upper.includes('MAST') ? 450 : 350;
  }

  const tariffPrice = `₦${rateNaira.toFixed(2)} / kWh`;
  return { tariffName, tariffPrice };
}

export function purchaseReceipt(row: any): ReceiptModel {
  const vendedBy = row.vended_by
    || row.vended_by_name
    || row.vendor_name
    || row.operator_name
    || row.created_by_name
    || (row.customer_name ? `Customer Self-Vend (${row.customer_name})` : null)
    || 'Customer Self-Vend';

  const { tariffName, tariffPrice } = resolveTariffDetails(row);

  return {
    title: 'Purchase Receipt',
    receiptId: clean(row.receipt_number || row.receipt_id || row.id || row.purchase_order_id, 'PENDING').toUpperCase(),
    amount: money(row.amount_minor),
    status: clean(row.status),
    issuedAt: date(row.created_at),
    subject: 'Amount Purchased',
    fields: [
      field('Token', row.token, { token: true }),
      field('Customer', row.customer_name || row.customer_phone),
      field('Customer Phone', row.customer_phone),
      field('Vended By', vendedBy, { wide: true }),
      field('Meter ID', row.meter_id),
      field('Meter Type', row.meter_type || 'Prepaid Single Phase'),
      field('Station', row.station_id || row.station_name || 'TUNGA'),
      field('Tariff', tariffName),
      field('Tariff Price', tariffPrice),
      field('Payment', row.payment_method || (row.mode === 'remote_send' ? 'Wallet & Wireless Remote' : 'Wallet Self-Vend')),
      field('Purchase Way', row.purchase_way || (row.mode === 'remote_send' ? 'Wireless Remote Send' : 'Customer Portal Self-Vend')),
      field('Energy Value', row.energy_amount_minor != null ? money(row.energy_amount_minor) : ''),
      field(`VAT (${Number(row.vat_rate_basis_points ?? 0) / 100}%)`, row.vat_amount_minor != null ? money(row.vat_amount_minor) : ''),
      field('Units', row.units_kwh != null ? `${Number(row.units_kwh).toFixed(4)} kWh` : ''),
    ],
  };
}
