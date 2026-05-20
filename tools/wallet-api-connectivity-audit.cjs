#!/usr/bin/env node
/**
 * Wallet API connectivity audit.
 *
 * 1. Walk apps/{customer,vendor,admin}/src and extract every
 *    `api.get('/path')`, `api.post('/path')`, `fetch('${API_BASE}/path')` etc.
 *    Path can be a string literal OR a template literal.
 *
 * 2. Walk backend/wallet/src/routes/*.ts and extract every Fastify route
 *    registration with its prefix (from routes/index.ts).
 *
 * 3. Cross-reference: every frontend call should match at least one backend
 *    route pattern (handling :params).
 *
 * Outputs:
 *   • Per-app list of calls with hit/miss
 *   • Backend routes never called from any frontend
 *   • Mismatched verbs (frontend POSTs to a GET route)
 *
 * Exit code:
 *   0  no broken calls
 *   1  at least one frontend → backend miss
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ─ 1. Walk frontend ──────────────────────────────────────────────
function walk(dir, exts, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.vite') continue;
            walk(p, exts, out);
        } else if (exts.some((x) => e.name.endsWith(x))) {
            out.push(p);
        }
    }
    return out;
}

const CALL_RE = /\bapi\.(get|post|put|patch|delete)\s*<[^>]*>\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
const FETCH_RE = /\bfetch\s*\(\s*`[^`]*?\$\{[^}]+\}([^`]+)`/g;
const FETCH_RE2 = /\bfetch\s*\(\s*['"]([^'"]+\/api\/[^'"]+)['"]/g;

function extractFrontendCalls(app) {
    const dir = path.join(ROOT, `apps/${app}/src`);
    if (!fs.existsSync(dir)) return [];
    const calls = [];
    for (const f of walk(dir, ['.vue', '.ts', '.tsx'])) {
        const src = fs.readFileSync(f, 'utf-8');
        let m;
        while ((m = CALL_RE.exec(src)) !== null) {
            calls.push({ verb: m[1].toUpperCase(), path: m[2], file: f });
        }
        while ((m = FETCH_RE.exec(src)) !== null) {
            calls.push({ verb: 'FETCH', path: m[1], file: f });
        }
        while ((m = FETCH_RE2.exec(src)) !== null) {
            // strip protocol+host
            const stripped = m[1].replace(/^https?:\/\/[^/]+/, '');
            calls.push({ verb: 'FETCH', path: stripped, file: f });
        }
        // also catch api.get('path' without generic
        const NO_GENERIC = /\bapi\.(get|post|put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
        while ((m = NO_GENERIC.exec(src)) !== null) {
            // Only add if not already captured by CALL_RE (which has <T>)
            if (!calls.some((c) => c.verb === m[1].toUpperCase() && c.path === m[2] && c.file === f)) {
                calls.push({ verb: m[1].toUpperCase(), path: m[2], file: f });
            }
        }
    }
    return calls;
}

// ─ 2. Walk backend routes ────────────────────────────────────────
function extractBackendRoutes() {
    const routesDir = path.join(ROOT, 'backend/wallet/src/routes');
    const indexSrc = fs.readFileSync(path.join(routesDir, 'index.ts'), 'utf-8');

    // Extract registrations: app.register(adminRoute, { prefix: '/api/v1/admin' }) etc.
    const prefixes = {};
    const REG_RE = /import\s+(\w+)\s+from\s+['"]\.\/([^'"]+?)\.js['"]/g;
    let m;
    const imports = {};
    while ((m = REG_RE.exec(indexSrc)) !== null) imports[m[1]] = m[2];

    const PREFIX_RE = /\bregister\s*\(\s*(\w+)\s*,\s*\{\s*prefix\s*:\s*['"]([^'"]+)['"]/g;
    while ((m = PREFIX_RE.exec(indexSrc)) !== null) {
        const file = imports[m[1]];
        if (file) prefixes[file] = m[2];
    }
    // Also register without prefix (root-mounted)
    const NOPREFIX_RE = /\bregister\s*\(\s*(\w+)\s*\)/g;
    while ((m = NOPREFIX_RE.exec(indexSrc)) !== null) {
        const file = imports[m[1]];
        if (file && !(file in prefixes)) prefixes[file] = '';
    }

    const routes = [];
    for (const [file, prefix] of Object.entries(prefixes)) {
        const fp = path.join(routesDir, `${file}.ts`);
        if (!fs.existsSync(fp)) continue;
        const src = fs.readFileSync(fp, 'utf-8');
        const ROUTE_RE = /\bfastify\.(get|post|put|patch|delete)\s*<[^>]*>\s*\(\s*['"]([^'"]+)['"]/g;
        const ROUTE_RE2 = /\bfastify\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
        while ((m = ROUTE_RE.exec(src)) !== null) {
            routes.push({ verb: m[1].toUpperCase(), path: prefix + m[2], file });
        }
        while ((m = ROUTE_RE2.exec(src)) !== null) {
            if (!routes.some((r) => r.verb === m[1].toUpperCase() && r.path === prefix + m[2])) {
                routes.push({ verb: m[1].toUpperCase(), path: prefix + m[2], file });
            }
        }
    }
    return routes;
}

// ─ 3. Match a call to routes (handle :params and wildcards) ──────
function pathToRegex(routePath) {
    const escaped = routePath
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:[a-zA-Z_]\w*/g, '[^/?#]+')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}(?:\\?|$)`);
}

function normalizeCallPath(p) {
    // 0) Unclosed ${ — template literal whose inner expression contained a
    //    string literal that confused our extractor. Treat everything from
    //    the first unclosed ${ as a query-string suffix and drop it.
    if (/\$\{[^}]*$/.test(p)) p = p.replace(/\$\{[^}]*$/, '');
    // 1) Query placeholder at end ("...path${params}" → "...path") —
    //    if ${...} is at end and is NOT immediately preceded by `/`, treat
    //    it as a query-string suffix and strip it (and anything after).
    p = p.replace(/([^/])\$\{[^}]+\}.*$/, '$1');
    // 2) Inline ${...} (path-segment placeholders) → '1' so /:param matches
    p = p.replace(/\$\{[^}]+\}/g, '1');
    // 3) Strip query string + trailing slash
    return p.split('?')[0].replace(/\/$/, '');
}

function callMatchesRoute(call, route) {
    if (call.verb !== 'FETCH' && call.verb !== route.verb) return false;
    return pathToRegex(route.path).test(normalizeCallPath(call.path));
}

const SKIP_PATH_PATTERNS = [
    /^\/auth\/v1\//,           // Direct Supabase auth (intentional)
    /^\s*$/,                   // Empty after normalization
];

// Skip the internal api lib helper itself (it's the implementation, not a call site)
function isApiLibInternal(file) {
    return /apps[\\/](customer|vendor|admin)[\\/]src[\\/]lib[\\/]api\.ts$/.test(file);
}

function shouldSkipCall(call) {
    if (isApiLibInternal(call.file)) return true;
    const norm = normalizeCallPath(call.path);
    if (!norm) return true;
    return SKIP_PATH_PATTERNS.some((re) => re.test(norm));
}

// ─ Main ──────────────────────────────────────────────────────────
const APPS = ['customer', 'vendor', 'admin'];
const allCalls = [];
for (const app of APPS) {
    for (const c of extractFrontendCalls(app)) {
        allCalls.push({ ...c, app });
    }
}

const routes = extractBackendRoutes();
const broken = [];
const ok = [];
const verbMismatch = [];

for (const call of allCalls) {
    if (shouldSkipCall(call)) continue;
    const matchedSame = routes.find((r) => callMatchesRoute(call, r));
    if (matchedSame) {
        ok.push({ call, route: matchedSame });
    } else {
        // Try with any verb to detect verb mismatch
        const matchedAnyVerb = routes.find((r) => pathToRegex(r.path).test(call.path.split('?')[0]));
        if (matchedAnyVerb && call.verb !== 'FETCH') {
            verbMismatch.push({ call, route: matchedAnyVerb });
        } else {
            broken.push(call);
        }
    }
}

const calledPaths = new Set(ok.map((x) => `${x.route.verb} ${x.route.path}`));
const unusedRoutes = routes.filter((r) => !calledPaths.has(`${r.verb} ${r.path}`));

// ─ Output ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  Wallet API connectivity audit');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Frontend calls scanned: ${allCalls.length}`);
console.log(`  Backend routes scanned: ${routes.length}`);
console.log(`  Matched:                ${ok.length}`);
console.log(`  Broken (no backend):    ${broken.length}`);
console.log(`  Verb mismatch:          ${verbMismatch.length}`);
console.log(`  Unused backend routes:  ${unusedRoutes.length}`);

if (broken.length) {
    console.log('\n── BROKEN CALLS (no matching backend route) ──');
    for (const c of broken) {
        console.log(`  ✗ [${c.app.padEnd(8)}] ${c.verb.padEnd(7)} ${c.path}`);
        console.log(`     in ${path.relative(ROOT, c.file)}`);
    }
}

if (verbMismatch.length) {
    console.log('\n── VERB MISMATCH ──');
    for (const v of verbMismatch) {
        console.log(`  ⚠ [${v.call.app.padEnd(8)}] frontend ${v.call.verb} ${v.call.path}`);
        console.log(`     backend exposes ${v.route.verb} ${v.route.path} (${v.route.file}.ts)`);
        console.log(`     in ${path.relative(ROOT, v.call.file)}`);
    }
}

if (process.argv.includes('--show-unused') && unusedRoutes.length) {
    console.log('\n── UNUSED BACKEND ROUTES (not called by any frontend) ──');
    for (const r of unusedRoutes) {
        console.log(`  · ${r.verb.padEnd(7)} ${r.path}   (${r.file}.ts)`);
    }
}

console.log('');
process.exit(broken.length > 0 || verbMismatch.length > 0 ? 1 : 0);
