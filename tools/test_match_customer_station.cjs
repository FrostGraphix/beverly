const fs = require('fs');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const token = process.env.UPSTREAM_BEARER_TOKEN;

async function testMatchCustomerStation() {
  console.log('1. Updating customer 47005310009 station to "MILE 9"...');
  const updateCustRes = await fetch(`${baseUrl}/api/customer/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify([{
      customerId: '47005310009',
      customerName: 'NO NAME',
      stationId: 'MILE 9'
    }])
  });
  console.log('Customer update status:', updateCustRes.status, await updateCustRes.text());

  console.log('\n2. Testing /api/account/create for customer & meter 47005310009 on station MILE 9...');
  const accRes = await fetch(`${baseUrl}/api/account/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify([{
      customerId: '47005310009',
      meterId: '47005310009',
      tariffId: '123',
      ctRatio: '1',
      stationId: 'MILE 9'
    }])
  });
  console.log('Account create result:', await accRes.text());
}

testMatchCustomerStation().catch(console.error);
