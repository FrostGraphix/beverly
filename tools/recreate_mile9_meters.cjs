const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

async function testWithSuperToken() {
  console.log('1. Deleting 47005314285 with superToken...');
  const delRes = await fetch(`${baseUrl}/api/meter/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ meterId: '47005314285' }])
  });
  console.log('Delete status:', delRes.status, await delRes.text());

  console.log('2. Creating 47005314285 with stationId: "MILE 9" using superToken...');
  const createRes = await fetch(`${baseUrl}/api/meter/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      meterId: '47005314285',
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: 'MILE 9',
      lat: 0,
      lng: 0,
      remark: 'OLAREWAJU ABIODUN CHIEF'
    }])
  });
  console.log('Create status:', createRes.status, await createRes.text());

  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  const readRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: '47005314285' })
  });
  const readData = await readRes.json();
  console.log('Readback meter after superToken create:');
  console.log(JSON.stringify(readData?.result?.data?.[0], null, 2));
}

testWithSuperToken().catch(console.error);
