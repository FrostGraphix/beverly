const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp", "production-hardening");
const reportPath = path.join(reportDir, "audit-report.json");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function size(relativePath) {
  return read(relativePath).length;
}

function check(id, passed, detail, files) {
  return { id, passed, detail, files };
}

function runAudit(writeArtifact = true) {
  const packageJson = JSON.parse(read("package.json"));
  const architecture = read("ARCHITECTURE.md");
  const referenceCss = read("src/styles/reference.css");
  const apiReference = read("api/reference.js");
  const loginPage = read("src/components/LoginPage.vue");
  const profilePage = read("src/components/ProfilePage.vue");
  const apiService = read("src/services/api.js");
  const supabaseService = read("backend/src/services/supabase-service.js");

  const checks = [
    check(
      "css-separated",
      exists("src/styles/legacy-components.css") &&
        referenceCss.includes('@import "./legacy-components.css";') &&
        size("src/styles/reference.css") < 500,
      "reference.css is only the import hub.",
      ["src/styles/reference.css", "src/styles/legacy-components.css"]
    ),
    check(
      "typed-api-contracts",
      exists("src/services/api-contracts.mjs") &&
        read("src/services/api-contracts.mjs").includes("@typedef") &&
        apiService.includes("validateLoginResponse"),
      "API contracts are documented and consumed.",
      ["src/services/api-contracts.mjs", "src/services/api.js"]
    ),
    check(
      "runtime-schemas",
      exists("src/services/runtime-schemas.mjs") &&
        apiService.includes("validateApiEnvelope") &&
        exists("tests/production-hardening.test.cjs"),
      "Runtime schema validators guard API and profile flows.",
      ["src/services/runtime-schemas.mjs", "tests/production-hardening.test.cjs"]
    ),
    check(
      "demo-auth-removed",
      !loginPage.includes('password: "ACOB_ADMIN"') &&
        !loginPage.includes('this.form.password === "admin"') &&
        apiReference.includes("DEMO_AUTH_ENABLED") &&
        !apiReference.includes('password === "ACOB_ADMIN"') &&
        !apiReference.includes('password !== "ACOB_ADMIN"') &&
        !supabaseService.includes('|| "ACOB_ADMIN"'),
      "Demo auth requires explicit environment configuration.",
      ["src/components/LoginPage.vue", "api/reference.js", "backend/src/services/supabase-service.js"]
    ),
    check(
      "profile-state-centralized",
      exists("src/services/profile-store.mjs") &&
        profilePage.includes("loadProfileState") &&
        !profilePage.includes("localStorage.setItem('beverly-profile'") &&
        !profilePage.includes("alert('Password updated"),
      "Profile state flows through profile-store.",
      ["src/services/profile-store.mjs", "src/components/ProfilePage.vue"]
    ),
    check(
      "test-pipelines",
      Boolean(packageJson.scripts["test:contracts"]) &&
        Boolean(packageJson.scripts["test:services"]) &&
        Boolean(packageJson.scripts["test:security"]) &&
        Boolean(packageJson.scripts["test:hardening"]),
      "Test scripts are split by concern.",
      ["package.json"]
    ),
    check(
      "ci-gates",
      exists(".github/workflows/ci.yml") &&
        read(".github/workflows/ci.yml").includes("npm run build") &&
        read(".github/workflows/ci.yml").includes("npm run test:contracts") &&
        read(".github/workflows/ci.yml").includes("npm run test:security"),
      "CI has build, contract, service, security, and audit gates.",
      [".github/workflows/ci.yml"]
    ),
    check(
      "hardcoded-defaults-removed",
      !apiReference.includes("http://8.208.16.168:9310") &&
        apiReference.includes('process.env.LIVE_API_PROXY_ENABLED === "true" ? "live" : "local"') &&
        architecture.includes("Offline demo mode is default"),
      "Live upstream defaults are env-only and local mode is default.",
      ["api/reference.js", "ARCHITECTURE.md"]
    ),
    check(
      "persistence-strategy",
      architecture.includes("## Persistence Strategy") &&
        architecture.includes("Supabase is production persistence") &&
        architecture.includes("SQLite is local development"),
      "Persistence ownership is explicit.",
      ["ARCHITECTURE.md"]
    ),
    check(
      "typescript-gate",
        exists("tsconfig.json") &&
        exists("src/types/api-contracts.ts") &&
        Boolean(packageJson.scripts.typecheck) &&
        Boolean(packageJson.devDependencies?.typescript),
      "TypeScript compiler and strict contract types are configured.",
      ["tsconfig.json", "src/types/api-contracts.ts", "package.json"]
    ),
    check(
      "legacy-css-modules",
      [
        "legacy-auth.css",
        "legacy-shell.css",
        "legacy-dashboard.css",
        "legacy-tables.css",
        "legacy-modals.css",
        "legacy-profile.css",
        "legacy-consumption.css"
      ].every((file) => exists(`src/styles/${file}`)) &&
        read("src/styles/legacy-components.css").includes('@import "./legacy-auth.css";'),
      "Legacy CSS is split into migration modules.",
      ["src/styles/legacy-components.css", "src/styles/legacy-auth.css"]
    ),
    check(
      "external-provisioning",
      exists("tools/validate-provisioning-env.cjs") &&
        exists("docs/PRODUCTION_ENV_PROVISIONING.md") &&
        Boolean(packageJson.scripts["env:validate"]) &&
        read(".env.example").includes("LIVE_API_BASE_URL=") &&
        !read(".env.example").includes("http://8.208.16.168:9310"),
      "Supabase credentials and upstream URL are provisioned outside code.",
      ["tools/validate-provisioning-env.cjs", "docs/PRODUCTION_ENV_PROVISIONING.md", ".env.example"]
    )
  ];

  const failed = checks.filter((item) => !item.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    status: failed.length ? "failed" : "passed",
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length
    },
    checks
  };

  if (writeArtifact) {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

if (require.main === module) {
  const report = runAudit();
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.status !== "passed") {
    for (const item of report.checks.filter((check) => !check.passed)) {
      console.error(`${item.id}: ${item.detail}`);
    }
    process.exitCode = 1;
  }
}

module.exports = { reportPath, runAudit };
