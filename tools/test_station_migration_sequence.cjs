const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

async function testMigrateStationSequence() {
  // Step 1: Ensure user is in station '0001' to delete meter from 0001
  console.log('Step 1: Setting Beverly user station to "0001"...');
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

  // Step 2: Delete meter 47005310009
  console.log('Step 2: Deleting 47005310009 from station 0001...');
  const delRes = await fetch(`${baseUrl}/api/meter/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ meterId: '47005310009' }])
  });
  console.log('Delete status:', delRes.status, await delRes.text());

  // Step 3: Switch Beverly user station to 'MILE 9'
  console.log('Step 3: Setting Beverly user station to "MILE 9"...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: 'Beverly',
      roleId: 'admin',
      stationId: 'MILE 9',
      status: true,
      email: 'beverly@org.acoblighting.com'
    }])
  });

  // Step 4: Create meter 47005310009 in station 'MILE 9'
  console.log('Step 4: Creating meter 47005310009 in station "MILE 9"...');
  const createRes = await fetch(`${baseUrl}/api/meter/create`, {
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
      remark: 'NO NAME'
    }])
  });
  console.log('Create status:', createRes.status, await createRes.text());

  // Step 5: Read back using admin user to verify final stationId
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
  console.log('\nFINAL READBACK FOR 47005310009:');
  console.log(JSON.stringify(readData?.result?.data?.[0], null, 2));
}

testMigrateStationSequence().catch(console.error);
