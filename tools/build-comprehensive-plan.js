const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const whiteLogoPath = 'C:\\Users\\ACOB\\Documents\\ACOB Logo white.png';
const logoDestPath = path.resolve(__dirname, '../acob-logo-white.png');
const publicLogoPath = path.resolve(__dirname, '../public/brand/acob-logo-white.png');

console.log('Copying exact white ACOB logo...');
fs.copyFileSync(whiteLogoPath, logoDestPath);

const publicBrandDir = path.resolve(__dirname, '../public/brand');
if (!fs.existsSync(publicBrandDir)) {
  fs.mkdirSync(publicBrandDir, { recursive: true });
}
fs.copyFileSync(whiteLogoPath, publicLogoPath);

const logoBuffer = fs.readFileSync(whiteLogoPath);
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

// Create high-end 3-page comprehensive HTML template
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ACOB Lighting Technology Limited — Beverly System Implementation & Training Master Blueprint</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 12mm 10mm 12mm 10mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1a231e;
      background: #ffffff;
      line-height: 1.42;
      font-size: 8.8pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      width: 100%;
      min-height: 270mm;
      page-break-after: always;
      padding-bottom: 24px;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* Executive Luxury Header */
    .header-banner {
      background: linear-gradient(135deg, #06170f 0%, #0c2b1d 60%, #004d25 100%);
      color: #ffffff;
      padding: 20px 24px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
      border-bottom: 4px solid #00e676;
    }

    .logo-group {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .acob-white-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
      display: block;
    }

    .divider-v {
      width: 1.5px;
      height: 44px;
      background: rgba(255, 255, 255, 0.22);
    }

    .beverly-brand-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 800;
      font-size: 17pt;
      letter-spacing: -0.5px;
      color: #ffffff;
    }

    .beverly-brand-title span {
      color: #00e676;
    }

    .beverly-brand-sub {
      font-size: 7.5pt;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #a7f3d0;
      font-weight: 700;
    }

    .header-meta {
      text-align: right;
      font-size: 8pt;
    }

    .header-badge {
      background: rgba(0, 230, 118, 0.18);
      color: #69f0ae;
      border: 1px solid rgba(0, 230, 118, 0.35);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 7pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: inline-block;
      margin-bottom: 4px;
    }

    .header-meta div {
      color: #d1fae5;
    }

    /* Section Headings */
    .section-title {
      font-size: 11.5pt;
      font-weight: 800;
      color: #082618;
      margin-top: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
    }

    .section-title .step-num {
      width: 22px;
      height: 22px;
      background: #00c853;
      color: #ffffff;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      font-weight: 800;
    }

    /* Callout & Alert Boxes */
    .callout-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 5px solid #00c853;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 8.5pt;
    }

    .callout-title {
      font-weight: 800;
      color: #14532d;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Departmental Grid Cards */
    .schedule-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }

    .dept-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      position: relative;
    }

    .dept-card.ops { border-top: 4px solid #0284c7; }
    .dept-card.acc { border-top: 4px solid #16a34a; }
    .dept-card.prj { border-top: 4px solid #9333ea; }

    .dept-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .dept-title {
      font-size: 10pt;
      font-weight: 800;
      color: #0f172a;
    }

    .time-pill {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
      background: #f1f5f9;
      color: #334155;
      font-family: 'JetBrains Mono', monospace;
    }

    .day-sub {
      font-size: 8pt;
      font-weight: 800;
      color: #0284c7;
      margin-bottom: 6px;
      display: block;
    }
    .dept-card.acc .day-sub { color: #16a34a; }
    .dept-card.prj .day-sub { color: #9333ea; }

    .bullet-list {
      list-style: none;
      font-size: 8pt;
      color: #334155;
    }

    .bullet-list li {
      position: relative;
      padding-left: 12px;
      margin-bottom: 4px;
      line-height: 1.35;
    }

    .bullet-list li::before {
      content: "▪";
      position: absolute;
      left: 0;
      color: #00c853;
      font-weight: bold;
    }

    /* Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 8pt;
    }

    .data-table th {
      background: #092115;
      color: #ffffff;
      text-align: left;
      padding: 7px 9px;
      font-weight: 700;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .data-table th:first-child { border-top-left-radius: 6px; }
    .data-table th:last-child { border-top-right-radius: 6px; }

    .data-table td {
      padding: 7px 9px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .data-table tr:nth-child(even) td { background: #f8fafc; }

    .code-tag {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: #047857;
      font-size: 7.5pt;
    }

    .role-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 700;
    }
    .role-ops { background: #e0f2fe; color: #0369a1; }
    .role-acc { background: #dcfce7; color: #15803d; }
    .role-prj { background: #f3e8ff; color: #6b21a8; }

    /* Pilot Testing Infographic Container */
    .pilot-box {
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 14px;
    }

    .pilot-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .pilot-name {
      font-size: 10pt;
      font-weight: 800;
      color: #0f172a;
    }

    .pilot-badge {
      background: #dc2626;
      color: #ffffff;
      font-size: 7.5pt;
      font-weight: 800;
      padding: 2px 9px;
      border-radius: 14px;
      letter-spacing: 0.5px;
    }

    .flow-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }

    .flow-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      padding: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .flow-step-num {
      width: 18px;
      height: 18px;
      background: #00c853;
      color: white;
      border-radius: 50%;
      font-size: 7.5pt;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }

    .flow-card-title {
      font-weight: 700;
      font-size: 8pt;
      color: #0f172a;
      margin-bottom: 2px;
    }

    .flow-card-desc {
      font-size: 7pt;
      color: #64748b;
      line-height: 1.25;
    }

    /* Specs & Architecture Boxes */
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }

    .spec-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px;
    }

    .spec-head {
      font-weight: 800;
      font-size: 8.5pt;
      color: #0f172a;
      border-bottom: 1.5px solid #00c853;
      padding-bottom: 3px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }

    .site-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .site-pill {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
      font-size: 7pt;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Footer */
    .doc-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 7pt;
      color: #64748b;
    }

    .footer-brand {
      font-weight: 700;
      color: #092115;
    }
  </style>
</head>
<body>

  <!-- ==================== PAGE 1 ==================== -->
  <div class="page">
    
    <!-- HEADER -->
    <div class="header-banner">
      <div class="logo-group">
        <img src="${logoBase64}" alt="ACOB Lighting Technology Limited" class="acob-white-logo" />
        <div class="divider-v"></div>
        <div>
          <div class="beverly-brand-title">BEVERLY <span>CRM</span></div>
          <div class="beverly-brand-sub">Smart Power Partner (v2.4)</div>
        </div>
      </div>

      <div class="header-meta">
        <span class="header-badge">Master Blueprint</span>
        <div><strong>Date:</strong> July 27, 2026</div>
        <div><strong>Scope:</strong> Ops, Accounts, Projects</div>
      </div>
    </div>

    <!-- CALLOUT: OPERATIONAL REASONING -->
    <div class="callout-box">
      <div class="callout-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        Operational Readiness & Team Lead Directive
      </div>
      Departmental enlightenment and system onboarding begins <strong>Tomorrow (Tuesday at 12:00 PM)</strong> for the <strong>Operations Department</strong>. Training was deferred today because the Operations Team Lead was off-site. The Tuesday session will immediately commence by provisioning individual accounts under the <strong>Wallet Admin Operations Officer User</strong> role, followed by Account Operations on Wednesday and Project Operations on Thursday.
    </div>

    <!-- SECTION 1: MASTER SCHEDULE -->
    <div class="section-title">
      <span class="step-num">1</span>
      Departmental Training Master Schedule (12:00 PM Daily)
    </div>

    <div class="schedule-cards">
      <!-- OPS -->
      <div class="dept-card ops">
        <div class="dept-head">
          <span class="dept-title">Operations Dept.</span>
          <span class="time-pill">12:00 PM</span>
        </div>
        <span class="day-sub">TOMORROW (TUESDAY)</span>
        <ul class="bullet-list">
          <li>Account Creation: Wallet Admin Ops Officer</li>
          <li>Beverly System Navigation & Station Scope</li>
          <li>Live Gateway Telemetry & Status Tracing</li>
          <li>STS 20-Digit Token Vending & Clear Tokens</li>
          <li>Operational Audit Logs Inspection</li>
        </ul>
      </div>

      <!-- ACCOUNTS -->
      <div class="dept-card acc">
        <div class="dept-head">
          <span class="dept-title">Account Dept.</span>
          <span class="time-pill">12:00 PM</span>
        </div>
        <span class="day-sub">WEDNESDAY</span>
        <ul class="bullet-list">
          <li>Wallet Ledger Architecture & Double-Entry</li>
          <li>Vendor Fund Credits & Balance Limits</li>
          <li>Tariff Snapshots & Revenue Reconciliation</li>
          <li>Branded Thermal & PDF Receipt Audits</li>
          <li>Financial Exports (CSV, Excel, PDF)</li>
        </ul>
      </div>

      <!-- PROJECTS -->
      <div class="dept-card prj">
        <div class="dept-head">
          <span class="dept-title">Project Dept.</span>
          <span class="time-pill">12:00 PM</span>
        </div>
        <span class="day-sub">THURSDAY</span>
        <ul class="bullet-list">
          <li>Minigrid Station Provisioning Topology</li>
          <li>OEM Hub Integration (SGC, KRN, Base Year)</li>
          <li>Customer Profile & Meter ID Mapping</li>
          <li>Protocol 2.2 Telemetry & Communication Links</li>
          <li>Field Diagnostics & Remote Command Relay</li>
        </ul>
      </div>
    </div>

    <!-- SECTION 2: PILOT TESTING OVERVIEW -->
    <div class="section-title">
      <span class="step-num">2</span>
      Live Station Pilot Testing Blueprint — OGUFA Minigrid
    </div>

    <div class="pilot-box">
      <div class="pilot-head">
        <div class="pilot-name">End-to-End Vending & Telemetry Pilot Execution</div>
        <span class="pilot-badge">LIVE SITE: OGUFA</span>
      </div>
      <p style="font-size: 8pt; color: #475569; margin-bottom: 8px;">
        Hands-on simulation using <strong>OGUFA Station</strong> (Nasarawa State). Operations, Accounts, and Projects will test end-to-end token vending, customer metering, and ledger updates with live wallet vendors and a test customer.
      </p>

      <div class="flow-grid">
        <div class="flow-card">
          <div class="flow-step-num">1</div>
          <div class="flow-card-title">User Account Setup</div>
          <div class="flow-card-desc">Provision Ops Officer & OGUFA Vendor credentials</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">2</div>
          <div class="flow-card-title">Wallet Funding</div>
          <div class="flow-card-desc">Allocate initial credit to vendor wallet ledger</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">3</div>
          <div class="flow-card-title">Meter Search</div>
          <div class="flow-card-desc">Query live OGUFA customer meter profile</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">4</div>
          <div class="flow-card-title">Token Vending</div>
          <div class="flow-card-desc">Generate 20-digit STS encrypted credit token</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">5</div>
          <div class="flow-card-title">Meter Keypad Input</div>
          <div class="flow-card-desc">Input token into physical meter at OGUFA site</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">6</div>
          <div class="flow-card-title">Gateway Telemetry</div>
          <div class="flow-card-desc">Verify OGUFA_COMMUNITY gateway handshake</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">7</div>
          <div class="flow-card-title">Receipt Audit</div>
          <div class="flow-card-desc">Issue branded PDF & thermal vending receipt</div>
        </div>
        <div class="flow-card">
          <div class="flow-step-num">8</div>
          <div class="flow-card-title">Ledger Balancing</div>
          <div class="flow-card-desc">Audit financial debit/credit balance entries</div>
        </div>
      </div>
    </div>

    <!-- SECTION 3: CANONICAL SITES & SPECIFICATIONS -->
    <div class="section-title">
      <span class="step-num">3</span>
      Beverly System Core Architecture & Supported Sites
    </div>

    <div class="specs-grid">
      <div class="spec-card">
        <div class="spec-head">
          Supported Minigrid Stations
          <span style="font-weight:normal; color:#047857;">5 Active Sites</span>
        </div>
        <p style="font-size: 7.5pt; color: #64748b;">Beverly enforces station-scoped routing, tariff rules, and telemetry monitoring across all ACOB sites:</p>
        <div class="site-pills">
          <span class="site-pill" style="background:#fee2e2; color:#991b1b; border-color:#fca5a5;">★ OGUFA (Pilot)</span>
          <span class="site-pill">TUNGA</span>
          <span class="site-pill">UMAISHA</span>
          <span class="site-pill">KYAKALE</span>
          <span class="site-pill">MUSHA</span>
        </div>
      </div>

      <div class="spec-card">
        <div class="spec-head">
          System Core Modules
          <span style="font-weight:normal; color:#047857;">Production v2.4</span>
        </div>
        <ul style="font-size: 7.5pt; color: #334155; padding-left: 12px;">
          <li><strong>STS Token Engine</strong>: 20-digit encrypted vending tokens.</li>
          <li><strong>Double-Entry Ledger</strong>: Immutable transaction auditing.</li>
          <li><strong>OEM Registry</strong>: Protocol 2.2, SGC 250405, KRN 1, KEN 255.</li>
          <li><strong>Telemetry Sync</strong>: Real-time gateway status monitoring.</li>
        </ul>
      </div>
    </div>

    <div class="doc-footer">
      <div class="footer-brand">ACOB Lighting Technology Limited — Executive Operational Blueprint</div>
      <div>Page 1 of 3</div>
    </div>
  </div>

  <!-- ==================== PAGE 2 ==================== -->
  <div class="page">

    <!-- HEADER (PAGE 2) -->
    <div class="header-banner" style="padding: 14px 20px; margin-bottom: 14px;">
      <div class="logo-group">
        <img src="${logoBase64}" alt="ACOB Lighting Technology Limited" class="acob-white-logo" style="height: 38px;" />
        <div class="divider-v" style="height: 34px;"></div>
        <div>
          <div class="beverly-brand-title" style="font-size: 13pt;">BEVERLY <span>SYSTEM</span> — Departmental Lecture Modules</div>
        </div>
      </div>
      <div class="header-meta">
        <div>Detailed Curriculum Syllabus</div>
      </div>
    </div>

    <!-- SECTION 4: IN-DEPTH LECTURE MODULES -->
    <div class="section-title" style="margin-top: 0;">
      <span class="step-num">4</span>
      Comprehensive Departmental Lecture Curriculum & Practical Hands-On Exercises
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 14%;">Module ID</th>
          <th style="width: 24%;">Focus Area</th>
          <th style="width: 48%;">Detailed Syllabus Content & Practical Exercise</th>
          <th style="width: 14%;">Target Dept</th>
        </tr>
      </thead>
      <tbody>
        <!-- OPS MODULES -->
        <tr>
          <td><span class="code-tag">MOD-OPS-01</span></td>
          <td><strong>User Provisioning & RBAC</strong></td>
          <td>Create accounts under <code>Wallet Admin Operations Officer User</code> role. Configure password strength, station permissions, and multi-factor authentication.</td>
          <td><span class="role-tag role-ops">Operations</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-OPS-02</span></td>
          <td><strong>Station & Gateway Telemetry</strong></td>
          <td>Inspect <code>OGUFA_COMMUNITY</code> gateway links, signal strength, offline notifications, and live meter consumption interval graphs.</td>
          <td><span class="role-tag role-ops">Operations</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-OPS-03</span></td>
          <td><strong>STS Token Engineering</strong></td>
          <td>Generate standard credit tokens, <strong>Clear Credit Tokens</strong>, and <strong>Clear Tamper Tokens</strong>. Validate 20-digit token output.</td>
          <td><span class="role-tag role-ops">Operations</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-OPS-04</span></td>
          <td><strong>Operational Log Inspection</strong></td>
          <td>Trace system audit logs (User creation, token requests, station parameter modifications). Escalation protocols for offline meters.</td>
          <td><span class="role-tag role-ops">Operations</span></td>
        </tr>

        <!-- ACCOUNT MODULES -->
        <tr>
          <td><span class="code-tag">MOD-ACC-01</span></td>
          <td><strong>Wallet Ledger Architecture</strong></td>
          <td>Audit double-entry ledger mechanics: Vendor fund deposits, customer vending debits, system revenue pools, and balance constraints.</td>
          <td><span class="role-tag role-acc">Accounts</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-ACC-02</span></td>
          <td><strong>Tax & Service Fee Calculations</strong></td>
          <td>Review automatic VAT deduction (7.5%), fixed monthly standing charges, and service fee splits per vending transaction.</td>
          <td><span class="role-tag role-acc">Accounts</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-ACC-03</span></td>
          <td><strong>Tariff Snapshots & Revenue Audit</strong></td>
          <td>Inspect pricing tiers for OGUFA (Residential vs Commercial tariffs). Validate tariff effective timestamps and snapshot history.</td>
          <td><span class="role-tag role-acc">Accounts</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-ACC-04</span></td>
          <td><strong>Branded PDF Receipts & Exports</strong></td>
          <td>Generate PDF vending receipts. Export daily consumption, vending, and valuation reports into CSV, Excel, and PDF formats.</td>
          <td><span class="role-tag role-acc">Accounts</span></td>
        </tr>

        <!-- PROJECT MODULES -->
        <tr>
          <td><span class="code-tag">MOD-PRJ-01</span></td>
          <td><strong>Minigrid Site Provisioning</strong></td>
          <td>Provision new minigrid sites in Beverly. Register OEM parameters: Protocol version 2.2, SGC (250405), KRN (1), KEN (255), and Base Year (2014).</td>
          <td><span class="role-tag role-prj">Projects</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-PRJ-02</span></td>
          <td><strong>Customer Profile & Meter Mapping</strong></td>
          <td>Register new customers and pair physical meters to OGUFA site. Configure phase types (Single vs 3-Phase), CT ratios, and GPS coordinates.</td>
          <td><span class="role-tag role-prj">Projects</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-PRJ-03</span></td>
          <td><strong>Gateway Health & Hardware Hub</strong></td>
          <td>Diagnose hardware communication links, cellular signal quality, gateway disconnects, and OEM hardware compatibility (Hexing, Calin, Star).</td>
          <td><span class="role-tag role-prj">Projects</span></td>
        </tr>
        <tr>
          <td><span class="code-tag">MOD-PRJ-04</span></td>
          <td><strong>Remote Command Diagnostics</strong></td>
          <td>Execute remote disconnect/reconnect commands, read meter parameters over cellular gateways, and troubleshoot field hardware faults.</td>
          <td><span class="role-tag role-prj">Projects</span></td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 5: ROLE PERMISSION MATRIX -->
    <div class="section-title">
      <span class="step-num">5</span>
      Beverly Role-Based Access Control (RBAC) Permission Matrix
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>System Role Name</th>
          <th>Primary Department</th>
          <th>Vending Access</th>
          <th>Ledger Credit</th>
          <th>Station Provisioning</th>
          <th>Log Inspection</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Wallet Admin Operations Officer</strong></td>
          <td>Operations</td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Full</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Fund / Debit</span></td>
          <td><span style="color:#ca8a04; font-weight:bold;">● Read Only</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Full Audit</span></td>
        </tr>
        <tr>
          <td><strong>Financial Auditor / Accountant</strong></td>
          <td>Accounts</td>
          <td><span style="color:#ca8a04; font-weight:bold;">● Read Only</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Ledger Audit</span></td>
          <td><span style="color:#dc2626; font-weight:bold;">✖ Restricted</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Financial Logs</span></td>
        </tr>
        <tr>
          <td><strong>Project Engineer / Deployment</strong></td>
          <td>Projects</td>
          <td><span style="color:#ca8a04; font-weight:bold;">● Test Vend</span></td>
          <td><span style="color:#dc2626; font-weight:bold;">✖ Restricted</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Provision Sites</span></td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Telemetry Logs</span></td>
        </tr>
        <tr>
          <td><strong>Wallet Vendor (Field Agent)</strong></td>
          <td>External / Field</td>
          <td><span style="color:#16a34a; font-weight:bold;">✔ Vend Tokens</span></td>
          <td><span style="color:#ca8a04; font-weight:bold;">● Balance Only</span></td>
          <td><span style="color:#dc2626; font-weight:bold;">✖ Restricted</span></td>
          <td><span style="color:#ca8a04; font-weight:bold;">● Own Sales</span></td>
        </tr>
      </tbody>
    </table>

    <div class="doc-footer">
      <div class="footer-brand">ACOB Lighting Technology Limited — Executive Operational Blueprint</div>
      <div>Page 2 of 3</div>
    </div>
  </div>

  <!-- ==================== PAGE 3 ==================== -->
  <div class="page">

    <!-- HEADER (PAGE 3) -->
    <div class="header-banner" style="padding: 14px 20px; margin-bottom: 14px;">
      <div class="logo-group">
        <img src="${logoBase64}" alt="ACOB Lighting Technology Limited" class="acob-white-logo" style="height: 38px;" />
        <div class="divider-v" style="height: 34px;"></div>
        <div>
          <div class="beverly-brand-title" style="font-size: 13pt;">BEVERLY <span>SYSTEM</span> — Operational Readiness & Sign-off</div>
        </div>
      </div>
      <div class="header-meta">
        <div>Deployment Governance</div>
      </div>
    </div>

    <!-- SECTION 6: OGUFA PILOT TEST STEP-BY-STEP WORKFLOW -->
    <div class="section-title" style="margin-top: 0;">
      <span class="step-num">6</span>
      Detailed OGUFA Pilot Execution Protocol & Verification Checklist
    </div>

    <div class="specs-grid">
      <div class="spec-card">
        <div class="spec-head">Pre-Pilot Readiness Tasks</div>
        <ul style="font-size: 7.8pt; color: #334155; padding-left: 14px;">
          <li><strong>Credentials</strong>: Pre-stage test accounts for <code>OGUFA_VENDOR 1</code> and <code>Ops Officer</code>.</li>
          <li><strong>Test Hardware</strong>: 1 x STS Smart Test Meter linked to <code>OGUFA_COMMUNITY</code> gateway.</li>
          <li><strong>Staging Balance</strong>: Allocate ₦100,000 credit to vendor wallet.</li>
          <li><strong>Customer Profile</strong>: Pre-register test customer (e.g. John Joseph / Matthew Umboshi).</li>
        </ul>
      </div>

      <div class="spec-card">
        <div class="spec-head">Success & Verification Criteria</div>
        <ul style="font-size: 7.8pt; color: #334155; padding-left: 14px;">
          <li><strong>Token Generation</strong>: 20-digit token generated in < 2 seconds.</li>
          <li><strong>Meter Acceptance</strong>: Physical meter accepts token without STS error.</li>
          <li><strong>Telemetry Handshake</strong>: Gateway logs successful credit update.</li>
          <li><strong>Ledger Balance</strong>: Vendor wallet debited correctly with VAT breakdown.</li>
        </ul>
      </div>
    </div>

    <!-- SECTION 7: TRAINING LOGISTICS & ENVIRONMENT -->
    <div class="section-title">
      <span class="step-num">7</span>
      Training Logistics, Infrastructure & Support Setup
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Requirement Item</th>
          <th>Specification Details</th>
          <th>Responsible Department</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Venue & Display</strong></td>
          <td>ACOB Central Conference Room / 4K Screen Presentation Setup</td>
          <td>Administration / IT</td>
          <td><span style="color:#16a34a; font-weight:bold;">READY</span></td>
        </tr>
        <tr>
          <td><strong>Workstations</strong></td>
          <td>Laptops for Operations, Account, and Project team members</td>
          <td>All Departmental Leads</td>
          <td><span style="color:#16a34a; font-weight:bold;">READY</span></td>
        </tr>
        <tr>
          <td><strong>System Access</strong></td>
          <td>Beverly Production & Staging Portal URLs live and accessible</td>
          <td>System Administrator</td>
          <td><span style="color:#16a34a; font-weight:bold;">READY</span></td>
        </tr>
        <tr>
          <td><strong>Reference Manuals</strong></td>
          <td>PDF Handouts & Quick Reference Vending Cheat Sheets</td>
          <td>Training Facilitator</td>
          <td><span style="color:#16a34a; font-weight:bold;">READY</span></td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 8: FORMAL SIGN-OFF & APPROVAL MATRIX -->
    <div class="section-title" style="margin-top: 18px;">
      <span class="step-num">8</span>
      Formal Implementation Plan Sign-Off & Departmental Approval
    </div>

    <p style="font-size: 8pt; color: #475569; margin-bottom: 12px;">
      By signing below, the Departmental Leads acknowledge receipt of the Beverly System Implementation Blueprint and commit to facilitating full departmental participation according to the scheduled dates and times.
    </p>

    <div style="padding: 16px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; margin-bottom: 16px;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; font-size: 8pt; color: #334155;">
        <div>
          <div style="border-bottom: 1px solid #94a3b8; padding-bottom: 24px; margin-bottom: 6px;"></div>
          <div style="font-weight: 800; color: #0f172a;">Operations Team Lead</div>
          <div>ACOB Lighting Technology Limited</div>
          <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Date: ____ / ____ / 2026</div>
        </div>

        <div>
          <div style="border-bottom: 1px solid #94a3b8; padding-bottom: 24px; margin-bottom: 6px;"></div>
          <div style="font-weight: 800; color: #0f172a;">Accounts Team Lead</div>
          <div>ACOB Lighting Technology Limited</div>
          <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Date: ____ / ____ / 2026</div>
        </div>

        <div>
          <div style="border-bottom: 1px solid #94a3b8; padding-bottom: 24px; margin-bottom: 6px;"></div>
          <div style="font-weight: 800; color: #0f172a;">Projects Team Lead</div>
          <div>ACOB Lighting Technology Limited</div>
          <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Date: ____ / ____ / 2026</div>
        </div>
      </div>
    </div>

    <div class="doc-footer">
      <div class="footer-brand">ACOB Lighting Technology Limited — Beverly Smart Power Partner System</div>
      <div>Page 3 of 3</div>
    </div>
  </div>

</body>
</html>`;

const htmlPath = path.resolve(__dirname, '../acob_beverly_training_plan.html');
fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Comprehensive 3-Page HTML generated successfully!');

// Re-generate PDF using Edge
const pdfPath = path.resolve(__dirname, '../acob_beverly_training_plan.pdf');
const artifactPdfPath = 'C:\\Users\\ACOB\\.gemini\\antigravity\\brain\\b0596cb2-6635-4c76-b737-47e9fd14d6f7\\acob_beverly_training_plan.pdf';
const edgeBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const cmd = `"${edgeBin}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
execSync(cmd, { stdio: 'inherit' });
console.log('3-Page PDF generated successfully!');

if (fs.existsSync(pdfPath)) {
  fs.copyFileSync(pdfPath, artifactPdfPath);
  console.log('PDF copied to artifacts directory!');
}
