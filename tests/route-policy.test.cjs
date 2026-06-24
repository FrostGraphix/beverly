const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const policyPath = path.join(root, 'backend/wallet/src/contracts/route-policy.ts');
const serverPath = path.join(root, 'backend/wallet/src/server.ts');
const adminPath = path.join(root, 'backend/wallet/src/routes/admin.ts');

test('canonical route policy replaces regex financial classification', () => {
    const server = fs.readFileSync(serverPath, 'utf8');
    const policy = fs.readFileSync(policyPath, 'utf8');
    assert.doesNotMatch(server, /isFinancialMutation/);
    assert.match(server, /resolveMutationRoutePolicy/);
    assert.match(policy, /\/api\/v1\/vendor\/vend/);
    assert.match(policy, /\/api\/v1\/admin\/funding\/:id\/approve/);
    assert.match(policy, /cacheable: false/);
    const gateway = fs.readFileSync(path.join(root, 'api/reference.js'), 'utf8');
    assert.match(gateway, /isCanonicalMoneyMutation/);
    const gatewayClassifier = gateway.match(/function isCanonicalFinancialMutation[\s\S]*?\n}\n/);
    assert.ok(gatewayClassifier, 'gateway classifier must exist');
    assert.doesNotMatch(gatewayClassifier[0], /RegExp|\.some\(/);
});

test('developer console remains disabled by default', () => {
    const server = fs.readFileSync(serverPath, 'utf8');
    const admin = fs.readFileSync(adminPath, 'utf8');
    const env = fs.readFileSync(path.join(root, 'backend/wallet/src/config/env.ts'), 'utf8');
    assert.match(env, /DEV_CONSOLE_ENABLED: z\.coerce\.boolean\(\)\.default\(false\)/);
    assert.match(server, /env\.NODE_ENV === 'production' \|\| !env\.DEV_CONSOLE_ENABLED/);
    assert.match(admin, /x-break-glass-token/);
    assert.match(admin, /reauth_required/);
    assert.match(admin, /z\.literal\('test'\)/);
});

test('mutation policy inventory covers wallet route modules', () => {
    const policy = fs.readFileSync(policyPath, 'utf8');
    const routeDir = path.join(root, 'backend/wallet/src/routes');
    const mutationCalls = fs.readdirSync(routeDir)
        .filter((file) => file.endsWith('.ts'))
        .flatMap((file) => Array.from(fs.readFileSync(path.join(routeDir, file), 'utf8').matchAll(/fastify\.(?:post|put|patch|delete)\('([^']+)'/g)))
        .map((match) => match[1])
        .filter((pathname) => !pathname.startsWith('/dev/'));
    assert.ok(mutationCalls.length >= 100, 'expected a substantial mutation inventory');
    const policyEntries = (policy.match(/\b(?:post|put|patch|del)\('/g) ?? []).length;
    assert.ok(policyEntries >= 100, 'policy inventory must remain comprehensive');
    assert.match(policy, /\.map\(\(path\) => post\(`/);
});
