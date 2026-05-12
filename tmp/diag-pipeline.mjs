// Simulates the exact same data pipeline as TablePage.vue
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const fs = require('fs');

const token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt','utf8').trim() : '';

// Inline the columnKey function exactly as in table-helpers.mjs
function columnKey(label) {
  const map = {
    "Address": "address", "Battery Status": "batteryStatus", "CertifiName": "certifiName",
    "CertifiNo": "certifiNo", "Collection Date": "collectionDate", "Communication Way": "communicationWay",
    "Create Time": "createDate", "Credit Balance": "creditBalance", "CT Ratio": "ctRatio",
    "Current Reverse": "currentReverse", "Current Unbalance": "currentUnbalance",
    "Customer Address": "customerAddress", "Customer Id": "customerId", "Customer Name": "customerName",
    "Data Item": "dataItem", "Data Value": "dataValue", "Gateway Id": "gatewayId", "Id": "id",
    "Last Hour Usage": "lastHourUsage", "Last Purchase Date": "lastPurchaseDate",
    "Last Purchase Paid": "lastPurchasePaid", "Last Purchase Unit": "lastPurchaseUnit",
    "Magnetic Status": "magneticStatus", "Maximum Demand": "maximumDemand",
    "Maximum Power(W)": "maximumPower", "Meter Id": "meterId", "Meter Type": "meterType",
    "Name": "name", "Nonpurchase Days": "nonpurchaseDays", "Phone": "phone", "Power": "power",
    "Price": "price", "Protocol Version": "protocolVersion", "Receipt Id": "receiptId",
    "Relay Status": "relayStatus", "Remark": "remark", "Station Id": "stationId", "Status": "status",
    "Success Rate": "successRate", "Tariff Id": "tariffId", "Terminal Cover": "terminalCover",
    "Time": "createDate", "Token": "token", "Token(Recharge)": "token", "Total Energy": "totalEnergy",
    "Total Paid": "totalPaid", "Total Unit": "totalUnit", "Update Time": "updateDate",
    "Upper Open": "upperOpen", "User Id": "userId", "VAT Charge": "tax", "Vend": "vend",
    "Version": "version", "Class Id": "classId", "OBIS": "obis", "Type": "type"
  };
  return map[label] || label.charAt(0).toLowerCase() + label.slice(1).replace(/\s+/g, "");
}

// cell() method exactly as in TablePage.vue
function cell(row, column) {
  const key = columnKey(column);
  let value = row[key];
  if (value === undefined || value === null) {
    const actualKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (actualKey) value = row[actualKey];
  }
  return value === undefined || value === null ? "" : value;
}

function formatColumnName(column) {
  if (!column) return "";
  if (column === "successRate") return "Success Rate";
  return column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase());
}

// Test routes
const routes = [
  { title: "Credit Token", api: "/api/account/read", columns: ["customerId","customerName","meterId","meterType","communicationWay","tariffId","protocolVersion","remark","createDate","stationId","Actions"] },
  { title: "Gateway", api: "/api/gateway/read", columns: ["status","successRate","id","name","remark","createDate","updateDate","stationId","Actions"] },
  { title: "Customer", api: "/api/customer/read", columns: ["id","name","phone","address","certifiName","certifiNo","remark","createDate","updateDate","stationId","Actions"] },
];

for (const route of routes) {
  try {
    const res = await axios.post(`http://127.0.0.1:9312${route.api}`, 
      { pageNumber: 1, pageSize: 2, lang: 'en' },
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const raw = res.data;
    const inner = raw.data || raw.result || raw;
    const rows = Array.isArray(inner?.data) ? inner.data : Array.isArray(inner?.rows) ? inner.rows : Array.isArray(inner) ? inner : [];
    
    console.log(`\n=== ${route.title} (${rows.length} rows) ===`);
    console.log('Headers:', route.columns.filter(c=>c!=='Actions').map(c => `${formatColumnName(c)}`).join(' | '));
    
    if (rows[0]) {
      console.log('Row keys:', Object.keys(rows[0]).join(', '));
      const cellValues = route.columns.filter(c=>c!=='Actions').map(c => {
        const v = cell(rows[0], c);
        return `${c}=${JSON.stringify(v)}`;
      });
      console.log('Cell values:', cellValues.join(' | '));
      
      // Check for any blank/missing values
      const blanks = route.columns.filter(c=>c!=='Actions').filter(c => {
        const v = cell(rows[0], c);
        return v === "" || v === undefined || v === null;
      });
      if (blanks.length) {
        console.log('⚠️ BLANK COLUMNS:', blanks.join(', '));
      } else {
        console.log('✅ All columns have values');
      }
    } else {
      console.log('❌ NO DATA ROWS');
    }
  } catch (e) {
    console.log(`\n=== ${route.title} ===`);
    console.log('❌ ERROR:', e.response?.status, e.response?.data?.msg || e.message);
  }
}
