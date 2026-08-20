'use strict';
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx === -1 || line.startsWith('#')) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
        val = val.slice(1, -1);
    }
    env[key] = val;
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

client.from('oem_credentials').select('*').limit(5).then(r => {
    if (r.error) { console.error('Error:', r.error.message); process.exit(1); }
    console.log('oem_credentials rows (all):');
    console.log(JSON.stringify(r.data, null, 2));
    if (r.data && r.data.length > 0) {
        console.log('Column names:', Object.keys(r.data[0]).join(', '));
    }
}).catch(e => { console.error(e.message); process.exit(1); });
