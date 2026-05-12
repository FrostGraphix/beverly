import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const axios = require('axios');

const token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt','utf8').trim() : '';
axios.interceptors.request.use(c => { c.headers.Authorization = 'Bearer ' + token; return c; });

// We must dynamically import because the project uses ES modules
async function run() {
  const { fetchTableData } = await import('./src/services/table-service.js');
  const { managementRoutes } = await import('./src/data/route-manifest.js');
  
  const customerRoute = managementRoutes.find(r => r.title === 'Customer');
  const gatewayRoute = managementRoutes.find(r => r.title === 'Gateway');
  
  for (const route of [customerRoute, gatewayRoute]) {
    console.log(`\n=== Testing ${route.title} ===`);
    try {
      const res = await fetchTableData(route, { pageNumber: 1, pageSize: 2 });
      console.log(`Fetched ${res.rows.length} rows`);
      if (res.rows[0]) {
        console.log('Row keys:', Object.keys(res.rows[0]).join(', '));
        console.log('id:', res.rows[0].id);
        console.log('name:', res.rows[0].name);
        console.log('customerId:', res.rows[0].customerId);
      }
    } catch (e) {
      console.log('ERROR:', e.message);
      if (e.response) console.log('Response msg:', e.response.data);
    }
  }
}

run().catch(console.error);
