const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const whiteLogoPath = 'C:\\Users\\ACOB\\Documents\\ACOB Logo white.png';
const logoBuffer = fs.readFileSync(whiteLogoPath);
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

const artifactDir = 'C:\\Users\\ACOB\\.gemini\\antigravity\\brain\\b0596cb2-6635-4c76-b737-47e9fd14d6f7';
const edgeBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// ==========================================
// FILE 1: SUMMARY / CONCISE 2-PAGE VERSION
// ==========================================
const htmlSummary = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ACOB Lighting Technology Limited — Beverly Training Plan (Summary Version)</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 14mm 12mm 14mm 12mm;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #1c2520;
      background: #ffffff;
      line-height: 1.45;
      font-size: 9.5pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      width: 100%;
      page-break-after: always;
      padding-bottom: 20px;
    }
    .page:last-child { page-break-after: auto; }

    .header-banner {
      background: linear-gradient(135deg, #071c12 0%, #0d3623 60%, #005c2d 100%);
      color: #ffffff;
      padding: 20px 24px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 4px solid #00e676;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }

    .logo-container { display: flex; align-items: center; gap: 16px; }
    .acob-logo { height: 46px; width: auto; display: block; object-fit: contain; }
    .divider-line { width: 1.5px; height: 42px; background: rgba(255, 255, 255, 0.25); }

    .beverly-badge-header { display: flex; flex-direction: column; }
    .beverly-title { font-weight: 800; font-size: 17pt; letter-spacing: -0.5px; color: #ffffff; }
    .beverly-title span { color: #00e676; }
    .beverly-subtitle { font-size: 7.5pt; letter-spacing: 1.5px; text-transform: uppercase; color: #a7f3d0; font-weight: 700; }

    .doc-meta { text-align: right; font-size: 8pt; }
    .meta-tag {
      background: rgba(0, 230, 118, 0.18);
      color: #69f0ae;
      border: 1px solid rgba(0, 230, 118, 0.35);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 7pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      display: inline-block;
      margin-bottom: 4px;
    }
    .doc-meta div { color: #d1fae5; }

    .section-title {
      font-size: 12pt;
      font-weight: 800;
      color: #0d291b;
      margin-top: 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 5px;
    }

    .section-title .icon {
      width: 22px;
      height: 22px;
      background: #00c853;
      color: white;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9.5pt;
      font-weight: bold;
    }

    .callout-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 5px solid #00c853;
      padding: 11px 15px;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 9pt;
    }

    .callout-title { font-weight: 800; color: #14532d; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }

    .schedule-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
    .card.operations { border-top: 4px solid #0284c7; }
    .card.accounts { border-top: 4px solid #16a34a; }
    .card.projects { border-top: 4px solid #9333ea; }

    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .dept-name { font-size: 10.5pt; font-weight: 800; color: #0f172a; }
    .time-badge { font-size: 7.5pt; font-weight: 700; padding: 2px 7px; border-radius: 5px; background: #f1f5f9; color: #334155; font-family: 'JetBrains Mono', monospace; }
    .day-tag { font-size: 8pt; font-weight: 800; color: #0284c7; margin-bottom: 6px; display: block; }
    .card.accounts .day-tag { color: #16a34a; }
    .card.projects .day-tag { color: #9333ea; }

    .card-list { list-style: none; font-size: 8.2pt; color: #334155; }
    .card-list li { position: relative; padding-left: 12px; margin-bottom: 4px; }
    .card-list li::before { content: "•"; position: absolute; left: 0; color: #00c853; font-weight: bold; }

    .pilot-container { background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
    .pilot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .pilot-title { font-size: 10.5pt; font-weight: 800; color: #0f172a; }
    .station-tag { background: #dc2626; color: #ffffff; font-size: 7.5pt; font-weight: 800; padding: 3px 9px; border-radius: 16px; }

    .flow-steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
    .step-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 7px; padding: 8px 6px; text-align: center; }
    .step-num { width: 20px; height: 20px; background: #00c853; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 7.5pt; font-weight: 800; margin: 0 auto 4px auto; }
    .step-name { font-weight: 700; font-size: 7.8pt; color: #1e293b; margin-bottom: 2px; }
    .step-desc { font-size: 7pt; color: #64748b; line-height: 1.2; }

    .agenda-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 8.2pt; }
    .agenda-table th { background: #071c12; color: #ffffff; text-align: left; padding: 7px 9px; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; }
    .agenda-table td { padding: 8px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .agenda-table tr:nth-child(even) td { background: #f8fafc; }

    .module-code { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #059669; font-size: 7.8pt; }
    .role-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 7pt; font-weight: 700; }

    .doc-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 7pt; color: #64748b; }
    .footer-brand { font-weight: 700; color: #071c12; }
  </style>
</head>
<body>

  <!-- PAGE 1 -->
  <div class="page">
    <div class="header-banner">
      <div class="logo-container">
        <img src="${logoBase64}" alt="ACOB Logo" class="acob-logo" />
        <div class="divider-line"></div>
        <div class="beverly-badge-header">
          <div class="beverly-title">BEVERLY <span>CRM</span></div>
          <div class="beverly-subtitle">Smart Power Partner</div>
        </div>
      </div>
      <div class="doc-meta">
        <span class="meta-tag">Summary Schedule</span>
        <div><strong>Date:</strong> July 27, 2026</div>
        <div><strong>Target:</strong> Ops, Accounts, Projects</div>
      </div>
    </div>

    <div class="callout-box">
      <div class="callout-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        Operational Readiness Notice
      </div>
      Departmental onboarding begins <strong>Tomorrow (Tuesday at 12:00 PM)</strong> with the <strong>Operations Department</strong>. The session could not start today because the Operations Team Lead was off-site. Onboarding begins immediately with creating individual accounts under the <strong>Wallet Admin Operations Officer User</strong> role, followed by Account Operations on Wednesday and Project Operations on Thursday.
    </div>

    <div class="section-title">
      <span class="icon">1</span>
      Departmental Onboarding Schedule (12:00 PM Daily)
    </div>

    <div class="schedule-grid">
      <div class="card operations">
        <div class="card-header">
          <span class="dept-name">Operations Dept.</span>
          <span class="time-badge">12:00 PM</span>
        </div>
        <span class="day-tag">TOMORROW (TUESDAY)</span>
        <ul class="card-list">
          <li>User Account Creation (Wallet Admin Ops)</li>
          <li>System Navigation & Station Scope</li>
          <li>Real-time Gateway Monitoring</li>
          <li>STS Token Generation & Clear Tokens</li>
          <li>Operational Audit Logs</li>
        </ul>
      </div>

      <div class="card accounts">
        <div class="card-header">
          <span class="dept-name">Account Dept.</span>
          <span class="time-badge">12:00 PM</span>
        </div>
        <span class="day-tag">WEDNESDAY</span>
        <ul class="card-list">
          <li>Wallet Ledger Architecture</li>
          <li>Vendor Fund Allocations & Limits</li>
          <li>Tariff Snapshots & Revenue Audit</li>
          <li>Thermal & PDF Receipt Audits</li>
          <li>Financial Exports (CSV, Excel, PDF)</li>
        </ul>
      </div>

      <div class="card projects">
        <div class="card-header">
          <span class="dept-name">Project Dept.</span>
          <span class="time-badge">12:00 PM</span>
        </div>
        <span class="day-tag">THURSDAY</span>
        <ul class="card-list">
          <li>Station Provisioning Topology</li>
          <li>OEM Hub (Protocol 2.2, SGC 250405)</li>
          <li>Customer & Meter Profile Pairing</li>
          <li>Gateway Health Diagnostics</li>
          <li>Field Telemetry & Remote Tasks</li>
        </ul>
      </div>
    </div>

    <div class="section-title">
      <span class="icon">2</span>
      Live Station Pilot Testing Strategy — OGUFA Site
    </div>

    <div class="pilot-container">
      <div class="pilot-header">
        <div class="pilot-title">End-to-End Vending & Metering Pilot Test</div>
        <span class="station-tag">LIVE SITE: OGUFA</span>
      </div>
      <p style="font-size: 8.2pt; color: #475569; margin-bottom: 10px;">
        Simulation using <strong>OGUFA Station</strong> (Nasarawa State) with wallet vendors, operations officers, and a test customer to validate real-time token vending and ledger reconciliation.
      </p>

      <div class="flow-steps">
        <div class="step-card">
          <div class="step-num">1</div>
          <div class="step-name">Account Setup</div>
          <div class="step-desc">Provision Ops Officer & Vendor Accounts</div>
        </div>
        <div class="step-card">
          <div class="step-num">2</div>
          <div class="step-name">Wallet Funding</div>
          <div class="step-desc">Deposit credit into Vendor Ledger</div>
        </div>
        <div class="step-card">
          <div class="step-num">3</div>
          <div class="step-name">Meter Query</div>
          <div class="step-desc">Fetch live OGUFA customer & meter ID</div>
        </div>
        <div class="step-card">
          <div class="step-num">4</div>
          <div class="step-name">Token Vending</div>
          <div class="step-desc">Generate 20-digit STS credit token</div>
        </div>
        <div class="step-card">
          <div class="step-num">5</div>
          <div class="step-name">Meter Input</div>
          <div class="step-desc">Key token into physical meter at OGUFA</div>
        </div>
        <div class="step-card">
          <div class="step-num">6</div>
          <div class="step-name">Reconciliation</div>
          <div class="step-desc">Verify telemetry, receipt & audit log</div>
        </div>
      </div>
    </div>

    <div class="doc-footer">
      <div class="footer-brand">ACOB Lighting Technology Limited — Summary Operational Plan</div>
      <div>Page 1 of 2</div>
    </div>
  </div>

  <!-- PAGE 2 -->
  <div class="page">
    <div class="header-banner" style="padding: 14px 20px; margin-bottom: 14px;">
      <div class="logo-container">
        <img src="${logoBase64}" alt="ACOB Logo" class="acob-logo" style="height: 38px;" />
        <div class="divider-line" style="height: 34px;"></div>
        <div class="beverly-title" style="font-size: 13pt;">BEVERLY <span>SYSTEM</span> — Departmental Syllabus</div>
      </div>
      <div class="doc-meta"><div>ACOB Onboarding Framework</div></div>
    </div>

    <div class="section-title" style="margin-top: 0;">
      <span class="icon">3</span>
      Departmental Lecture Curriculum
    </div>

    <table class="agenda-table">
      <thead>
        <tr>
          <th style="width: 15%;">Module</th>
          <th style="width: 25%;">Topic</th>
          <th style="width: 45%;">Lecture Content & Exercise</th>
          <th style="width: 15%;">Dept</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="module-code">MOD-OPS-01</span></td>
          <td><strong>Account Provisioning & RBAC</strong></td>
          <td>Create accounts under <code>Wallet Admin Operations Officer User</code> role. Configure password rules and station scope.</td>
          <td><span class="role-badge" style="background:#e0f2fe; color:#0369a1;">Operations</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-OPS-02</span></td>
          <td><strong>Station Telemetry & Gateway</strong></td>
          <td>Monitor live <code>OGUFA_COMMUNITY</code> gateway links, signal quality, and consumption interval charts.</td>
          <td><span class="role-badge" style="background:#e0f2fe; color:#0369a1;">Operations</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-OPS-03</span></td>
          <td><strong>STS Token Engineering</strong></td>
          <td>Execute standard token vending, <strong>Clear Credit Token</strong>, and <strong>Clear Tamper Token</strong> issuance.</td>
          <td><span class="role-badge" style="background:#e0f2fe; color:#0369a1;">Operations</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-ACC-01</span></td>
          <td><strong>Wallet Ledger Architecture</strong></td>
          <td>Audit double-entry ledger mechanics: Vendor fund deposits, customer debits, VAT (7.5%), and service fees.</td>
          <td><span class="role-badge" style="background:#dcfce7; color:#15803d;">Accounts</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-ACC-02</span></td>
          <td><strong>Tariff Snapshots & Receipts</strong></td>
          <td>Inspect OGUFA tariff matrices (Residential vs Commercial),Standing charges, and branded PDF receipt generation.</td>
          <td><span class="role-badge" style="background:#dcfce7; color:#15803d;">Accounts</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-PRJ-01</span></td>
          <td><strong>Site Provisioning & OEM Hub</strong></td>
          <td>Provision sites in Beverly. Configure OEM parameters: Protocol 2.2, SGC (250405), KRN (1), KEN (255), Base Year (2014).</td>
          <td><span class="role-badge" style="background:#f3e8ff; color:#6b21a8;">Projects</span></td>
        </tr>
        <tr>
          <td><span class="module-code">MOD-PRJ-02</span></td>
          <td><strong>Customer Profile & Mapping</strong></td>
          <td>Pair physical meters to OGUFA site. Configure phase types (Single vs 3-Phase), CT ratios, and GPS coordinates.</td>
          <td><span class="role-badge" style="background:#f3e8ff; color:#6b21a8;">Projects</span></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 24px; padding: 14px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
      <div style="font-weight: 800; font-size: 9pt; color: #0f172a; margin-bottom: 12px;">Implementation Sign-Off & Approvals</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 8pt; color: #475569;">
        <div>
          <div>___________________________</div>
          <div style="font-weight: 700; margin-top: 3px;">Operations Team Lead</div>
        </div>
        <div>
          <div>___________________________</div>
          <div style="font-weight: 700; margin-top: 3px;">Accounts Team Lead</div>
        </div>
        <div>
          <div>___________________________</div>
          <div style="font-weight: 700; margin-top: 3px;">Projects Team Lead</div>
        </div>
      </div>
    </div>

    <div class="doc-footer">
      <div class="footer-brand">ACOB Lighting Technology Limited — Summary Operational Plan</div>
      <div>Page 2 of 2</div>
    </div>
  </div>
</body>
</html>`;

const summaryHtmlPath = path.resolve(__dirname, '../acob_beverly_training_plan_summary.html');
const summaryPdfPath = path.resolve(__dirname, '../acob_beverly_training_plan_summary.pdf');
const summaryArtifactPdfPath = path.join(artifactDir, 'acob_beverly_training_plan_summary.pdf');

fs.writeFileSync(summaryHtmlPath, htmlSummary, 'utf8');
console.log('Summary HTML generated!');

execSync(`"${edgeBin}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${summaryPdfPath}" "file:///${summaryHtmlPath.replace(/\\/g, '/')}"`, { stdio: 'inherit' });
if (fs.existsSync(summaryPdfPath)) {
  fs.copyFileSync(summaryPdfPath, summaryArtifactPdfPath);
  console.log('Summary PDF generated & copied successfully!');
}

// ==========================================
// FILE 2: COMPREHENSIVE / MASTER 3-PAGE VERSION
// ==========================================
const compHtmlPath = path.resolve(__dirname, '../acob_beverly_training_plan_comprehensive.html');
const compPdfPath = path.resolve(__dirname, '../acob_beverly_training_plan_comprehensive.pdf');
const compArtifactPdfPath = path.join(artifactDir, 'acob_beverly_training_plan_comprehensive.pdf');

// Copy current comprehensive HTML to comprehensive path
const currentCompHtml = fs.readFileSync(path.resolve(__dirname, '../acob_beverly_training_plan.html'), 'utf8');
fs.writeFileSync(compHtmlPath, currentCompHtml, 'utf8');

execSync(`"${edgeBin}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${compPdfPath}" "file:///${compHtmlPath.replace(/\\/g, '/')}"`, { stdio: 'inherit' });
if (fs.existsSync(compPdfPath)) {
  fs.copyFileSync(compPdfPath, compArtifactPdfPath);
  console.log('Comprehensive PDF generated & copied successfully!');
}
