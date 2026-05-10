const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const artifactDir = path.join(root, "tmp", "creative-implementation-flow");
const artifactPath = path.join(artifactDir, "audit-report.json");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function section(css, selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[\\s\\S]*?\\n\\}`, "m"));
  return match ? match[0] : "";
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function result(id, area, passed, detail, files = []) {
  return { id, area, passed, detail, files };
}

function runAudit(options = {}) {
  const writeArtifact = options.writeArtifact !== false;
  const architecture = read("ARCHITECTURE.md");
  const flow = read("docs/DESIGN_SYSTEM_IMPLEMENTATION_FLOW.md");
  const packageJson = JSON.parse(read("package.json"));
  const tokens = read("src/styles/tokens.css");
  const themes = read("src/styles/themes.css");
  const reference = read("src/styles/reference.css");
  const legacy = fs.readdirSync(path.join(root, "src/styles"))
    .filter((file) => file.startsWith("legacy-") && file.endsWith(".css"))
    .map((file) => read(`src/styles/${file}`))
    .join("\n");
  const styleSource = `${reference}\n${legacy}`;
  const table = read("src/components/TablePage.vue");
  const profile = read("src/components/ProfilePage.vue");
  const dashboard = read("src/components/DashboardPage.vue");
  const chartOptions = read("src/services/dashboard-chart-options.mjs");
  const receiptTools = read("src/services/receipt-tools.mjs");
  const importExport = read("src/services/import-export.mjs");

  const executiveTheme = section(themes, '[data-theme="executive"]');
  const oceanTheme = section(themes, '[data-theme="ocean"]');
  const contrastTheme = section(themes, '[data-theme="contrast"]');
  const profilePanel = section(styleSource, ".profile-panel");
  const barOption = chartOptions.slice(
    chartOptions.indexOf("export function createBarOption"),
    chartOptions.indexOf("export function createLineOption")
  );

  const checks = [
    result(
      "architecture-boundaries",
      "architecture",
      includesAll(architecture, [
        "src/styles/tokens.css",
        "src/styles/themes.css",
        "src/styles/primitives.css",
        "src/styles/layouts.css",
        "src/components/base/",
        "Preserve table action column behavior",
        "Preserve modal flow contracts"
      ]),
      "Architecture owns UI layers and migration constraints.",
      ["ARCHITECTURE.md"]
    ),
    result(
      "flow-sections",
      "planning",
      includesAll(flow, ["## Creative Task List", "## Critique Pass", "## Triple Check", "## Best Plan Flow", "## Acceptance Checklist"]),
      "Creative flow includes plan, critique, triple check, and gates.",
      ["docs/DESIGN_SYSTEM_IMPLEMENTATION_FLOW.md"]
    ),
    result(
      "required-files",
      "architecture",
      [
        "src/styles/tokens.css",
        "src/styles/themes.css",
        "src/styles/primitives.css",
        "src/styles/layouts.css",
        "src/components/base/BaseButton.vue",
        "src/components/base/BaseModalShell.vue",
        "tests/design-system-contract.test.cjs",
        "tests/theme-contract.test.cjs"
      ].every(exists),
      "Core design-system files and contracts exist.",
      ["src/styles", "src/components/base", "tests"]
    ),
    result(
      "theme-green-palettes",
      "theme",
      includesAll(executiveTheme + oceanTheme, ["--color-brand: #22c55e", "--color-brand: #047857"]) &&
        !/(#d6b15e|#0891b2|#0ea5e9|#7dd3fc|#bae6fd|214,\s*177,\s*94)/i.test(executiveTheme + oceanTheme + styleSource),
      "Executive and Canopy themes stay in green palettes.",
      ["src/styles/themes.css", "src/styles/reference.css"]
    ),
    result(
      "contrast-logo-readable",
      "theme",
      contrastTheme.includes("--color-text-inverse: #000000") && styleSource.includes("color: var(--text-inverse)"),
      "Contrast logo uses dark inverse text on yellow.",
      ["src/styles/themes.css", "src/styles/reference.css"]
    ),
    result(
      "token-foundation",
      "theme",
      includesAll(tokens, [
        "--color-brand",
        "--table-action-column-width",
        "--modal-radius",
        "--theme-color",
        "--bev-touch-target-min"
      ]),
      "Tokens cover brand, tables, modals, theme, and touch targets.",
      ["src/styles/tokens.css"]
    ),
    result(
      "table-action-visibility",
      "tables",
      table.includes("action-column") &&
        table.includes("action-btn-group") &&
        tokens.includes("--table-action-column-width: 240px") &&
        styleSource.includes("min-width: 240px") &&
        styleSource.includes("width: 240px"),
      "Action column has a fixed token-backed visibility contract.",
      ["src/components/TablePage.vue", "src/styles/tokens.css", "src/styles/reference.css"]
    ),
    result(
      "modal-hover-profile",
      "modals",
      profile.includes("profile-overlay") &&
        profile.includes("profile-panel") &&
        profilePanel.includes("border-radius: var(--radius-lg)") &&
        !/border-radius:\s*50%/.test(profilePanel),
      "Profile settings use centered hover modal, not circular page.",
      ["src/components/ProfilePage.vue", "src/styles/reference.css"]
    ),
    result(
      "dashboard-theme-charts",
      "dashboard",
      dashboard.includes("chartTheme") &&
        dashboard.includes("syncThemePalette") &&
        barOption.includes("color: colors.primary") &&
        !barOption.includes("type: \"linear\"") &&
        chartOptions.includes("borderWidth: 0"),
      "Dashboard bars follow theme color and alarm pie avoids white outlines.",
      ["src/components/DashboardPage.vue", "src/services/dashboard-chart-options.mjs"]
    ),
    result(
      "receipt-export-content",
      "receipts",
      includesAll(receiptTools, [
        "buildReceiptModel",
        "receiptHtml",
        "buildReceiptPdfBytes",
        "detail-section",
        "token-box",
        "print-color-adjust: exact"
      ]) && includesAll(importExport, ["exportCsvText", "exportExcelXml", "exportReportCsvText", "exportReportExcelXml"]),
      "Receipts and exports expose complete browser, PDF, CSV, and Excel contracts.",
      ["src/services/receipt-tools.mjs", "src/services/import-export.mjs"]
    ),
    result(
      "verification-scripts",
      "verification",
      Boolean(packageJson.scripts["flow:audit"]) && Boolean(packageJson.scripts["test:flow"]),
      "The creative implementation flow has runnable audit scripts.",
      ["package.json"]
    )
  ];

  const failed = checks.filter((check) => !check.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    status: failed.length ? "failed" : "passed",
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length
    },
    directions: [
      "Operational Command",
      "Executive Utility",
      "Field Console"
    ],
    chosenDirection: "Operational Command with Executive polish",
    checks
  };

  if (writeArtifact) {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

if (require.main === module) {
  const report = runAudit();
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.status !== "passed") {
    for (const check of report.checks.filter((item) => !item.passed)) {
      console.error(`[${check.area}] ${check.id}: ${check.detail}`);
    }
    process.exitCode = 1;
  }
}

module.exports = { runAudit, artifactPath };
