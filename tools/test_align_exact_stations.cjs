const fs = require('fs');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

async function testAlignExactStations() {
  console.log('1. Setting Beverly user station to "MILE 9 & 10"...');
  const userRes = await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: 'Beverly',
      roleId: 'admin',
      stationId: 'MILE 9 & 10',
      status: true,
      email: 'beverly@org.acoblighting.com'
    }])
  });
  console.log('User update status:', userRes.status, await userRes.text());

  // Test recreating meter 47005310009 with user in "MILE 9 & 10"
  console.log('2. Deleting meter 47005310009 from MILE 9...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'MILE 9', status: true }])
  });
  await fetch(`${baseUrl}/api/meter/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ meterId: '47005310009' }])
  });

  console.log('3. Setting Beverly station to "MILE 9 & 10" and recreating meter...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'MILE 9 & 10', status: true }])
  });

  const createRes = await fetch(`${baseUrl}/api/meter/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      meterId: '47005310009',
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: 'MILE 9 & 10',
      lat: 0,
      lng: 0,
      remark: 'NO NAME'
    }])
  });
  console.log('Meter create status:', createRes.status, await createRes.text());

  // Check readback of meter
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
  console.log('Meter readback stationId:', readData?.result?.data?.[0]?.stationId);

  // Now test creating account binding for 47005310009!
  console.log('\n4. Testing /api/account/create for 47005310009...');
  const accRes = await fetch(`${baseUrl}/api/account/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      customerId: '47005310009',
      meterId: '47005310009',
      tariffId: '123',
      ctRatio: '1',
      stationId: 'MILE 9 & 10'
    }])
  });
  console.log('Account create result:', await accRes.text());
}

testAlignExactStations().catch(console.error);
