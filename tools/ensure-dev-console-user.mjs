#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, 'backend', 'wallet', '.env'));
loadEnvFile(path.join(root, 'backend', 'wallet', '.env.local'));

const email = (process.env.DEV_CONSOLE_EMAIL || 'frostgraphix123@gmail.com').trim().toLowerCase();
const password = process.env.DEV_CONSOLE_PASSWORD;
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!password) {
  console.error('Missing DEV_CONSOLE_PASSWORD.');
  process.exit(1);
}

const requireFromBackend = createRequire(path.join(root, 'backend', 'wallet', 'package.json'));
const { createClient } = requireFromBackend('@supabase/supabase-js');

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application-name': 'beverly-dev-console-bootstrap' } },
});

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((entry) => entry.email?.toLowerCase() === targetEmail);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureAuthUser() {
  const metadata = {
    role_key: 'super-admin',
    role: 'super-admin',
    full_name: 'Dev Console',
  };

  const existing = await findUserByEmail(email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        ...metadata,
        user_id: existing.id,
      },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;

  const user = data.user;
  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...metadata,
      user_id: user.id,
    },
  });
  if (updateError) throw updateError;
  return updated.user;
}

async function main() {
  const user = await ensureAuthUser();

  const rolePayload = {
    name: 'admin',
    role_key: 'super-admin',
    role_name: 'Super Admin',
    label: 'Super Admin',
    description: 'Full wallet administration and access control.',
  };
  const { data: existingRoles, error: rolesLookupError } = await supabase
    .from('roles')
    .select('id')
    .eq('role_key', 'super-admin')
    .limit(1);
  if (rolesLookupError) throw rolesLookupError;
  const roleQuery = existingRoles?.length
    ? supabase.from('roles').update(rolePayload).eq('role_key', 'super-admin')
    : supabase.from('roles').insert(rolePayload);
  const { error: roleError } = await roleQuery;
  if (roleError) throw roleError;

  const { data: existingPermissions, error: permissionsLookupError } = await supabase
    .from('permissions')
    .select('id')
    .eq('role_key', 'super-admin')
    .eq('route_hash', 'dev.console')
    .limit(1);
  if (permissionsLookupError) throw permissionsLookupError;
  if (!existingPermissions?.length) {
    const { error: permissionError } = await supabase.from('permissions').insert({
      role_key: 'super-admin',
      route_hash: 'dev.console',
    });
    if (permissionError) throw permissionError;
  }

  const profilePayload = {
    auth_user_id: user.id,
    user_id: user.id,
    user_name: 'Dev Console',
    email,
    role_key: 'super-admin',
  };
  const { data: existingProfiles, error: profilesLookupError } = await supabase
    .from('users')
    .select('id')
    .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id},email.eq.${email}`)
    .limit(1);
  if (profilesLookupError) throw profilesLookupError;
  const profileQuery = existingProfiles?.length
    ? supabase.from('users').update(profilePayload).eq('id', existingProfiles[0].id)
    : supabase.from('users').insert(profilePayload);
  const { error: profileError } = await profileQuery;
  if (profileError) throw profileError;

  console.log(JSON.stringify({
    status: 'dev console user ready',
    email,
    role: 'super-admin',
    permission: 'dev.console',
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
