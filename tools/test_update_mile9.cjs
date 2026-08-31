const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

async function testUpdateWithMile9Exact() {
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log('1. Reading meter 47005310009...');
  let readRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: '47005310009' })
  });
  let data = await readRes.json();
  console.log('Before update stationId:', data?.result?.data?.[0]?.stationId);

  console.log('2. Updating meter 47005310009 with stationId = "MILE 9"...');
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
      remark: 'MILE 9 Test'
    }])
  });
  console.log('Update res:', await updateRes.text());

  readRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: '47005310009' })
  });
  data = await readRes.json();
  console.log('After update stationId:', data?.result?.data?.[0]?.stationId);
}

testUpdateWithMile9Exact().catch(console.error);
