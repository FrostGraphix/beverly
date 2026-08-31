const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

async function testFrom0001() {
  // 1. Switch Beverly user station back to '0001'
  console.log('1. Setting Beverly user station to "0001"...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: 'Beverly',
      roleId: 'admin',
      stationId: '0001',
      status: true,
      email: 'beverly@org.acoblighting.com'
    }])
  });

  // 2. Now Beverly is in '0001' and can see meters in '0001'.
  // Let's test updating meter 47005310009 to stationId: 'MILE 9' using superToken!
  console.log('2. Updating meter 47005310009 from 0001 to stationId = "MILE 9"...');
  const updateRes = await fetch(`${baseUrl}/api/meter/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      meterId: '47005310009',
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: 'MILE 9',
      lat: 0,
      lng: 0,
      remark: 'MILE 9 Station'
    }])
  });
  console.log('Update res:', updateRes.status, await updateRes.text());

  // 3. Read back
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  const readRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: '47005310009' })
  });
  const readData = await readRes.json();
  console.log('Readback meter data:');
  console.log(JSON.stringify(readData?.result?.data?.[0], null, 2));
}

testFrom0001().catch(console.error);
