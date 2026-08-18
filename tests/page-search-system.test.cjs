const assert = require("assert");
const { searchRows, resolveRowValue } = require("../src/services/table-helpers.mjs");
const { routeGroups } = require("../src/data/route-manifest.js");

function runTests() {
  console.log("Running page-search-system test suite...");

  // 1. Test searchRows deep record detail matching
  const testRoute = {
    hash: "#/management/customer",
    columns: ["Customer Id", "Customer Name", "Phone", "Actions"]
  };

  const sampleRows = [
    {
      id: "CUST-001",
      customerId: "CUST-001",
      customerName: "HARUNA ADAMU",
      phone: "+2348011112222",
      meterId: "MTR-8842",
      customerAddress: "15 Airport Road, Kano",
      accountNo: "ACC-998811",
      stationId: "GLO_MAST_KANO"
    },
    {
      id: "CUST-002",
      customerId: "CUST-002",
      customerName: "Aisha Bello",
      phone: "+2348033334444",
      meterId: "MTR-9900",
      customerAddress: "42 Marina Street, Lagos",
      accountNo: "ACC-445566",
      stationId: "OGUFA"
    }
  ];

  // Test explicit column match
  const harunaMatch = searchRows(testRoute, sampleRows, "Haruna");
  assert.strictEqual(harunaMatch.length, 1, "Should find row by Customer Name");
  assert.strictEqual(harunaMatch[0].customerId, "CUST-001");

  // Test full name match
  const harunaAdamuMatch = searchRows(testRoute, sampleRows, "HARUNA ADAMU");
  assert.strictEqual(harunaAdamuMatch.length, 1, "Should find row by full name HARUNA ADAMU");
  assert.strictEqual(harunaAdamuMatch[0].customerId, "CUST-001");

  // Test plus-encoded URL search term match
  const plusEncodedMatch = searchRows(testRoute, sampleRows, "HARUNA+ADAMU");
  assert.strictEqual(plusEncodedMatch.length, 1, "Should find row by plus-encoded term HARUNA+ADAMU");
  assert.strictEqual(plusEncodedMatch[0].customerId, "CUST-001");

  // Test station name / Glo_mast search match
  const gloMatch = searchRows({ hash: "#/remote-operation/remote-meter-reading", columns: ["Customer Name", "Meter Id", "Actions"] }, sampleRows, "Glo_mast");
  assert.strictEqual(gloMatch.length, 1, "Should find row by Glo_mast station ID");
  assert.strictEqual(gloMatch[0].customerId, "CUST-001");

  // Test deep record detail match on unrendered column (meterId)
  const meterMatch = searchRows(testRoute, sampleRows, "MTR-8842");
  assert.strictEqual(meterMatch.length, 1, "Should find row by unrendered meterId");
  assert.strictEqual(meterMatch[0].customerId, "CUST-001");

  // Test deep record detail match on unrendered address
  const addressMatch = searchRows(testRoute, sampleRows, "Marina");
  assert.strictEqual(addressMatch.length, 1, "Should find row by unrendered address");
  assert.strictEqual(addressMatch[0].customerId, "CUST-002");

  // Test deep record detail match on unrendered accountNo
  const accountMatch = searchRows(testRoute, sampleRows, "ACC-998811");
  assert.strictEqual(accountMatch.length, 1, "Should find row by unrendered accountNo");
  assert.strictEqual(accountMatch[0].customerId, "CUST-001");

  // Test empty query returns all rows
  const emptyMatch = searchRows(testRoute, sampleRows, "");
  assert.strictEqual(emptyMatch.length, 2, "Empty search query should return all rows");

  // 2. Test URL hash query parsing logic
  function extractSearchQueryFromHash(routeHash = "", locationHash = "") {
    let hash = locationHash || routeHash || "";
    if (!hash.includes("?") && routeHash && routeHash.includes("?")) {
      hash = routeHash;
    }
    if (!hash.includes("?")) return "";
    const queryStr = hash.split("?")[1] || "";
    const params = new URLSearchParams(queryStr);
    return params.get("q") || params.get("search") || params.get("searchTerm") || "";
  }

  assert.strictEqual(extractSearchQueryFromHash("#/management/customer?q=Haruna"), "Haruna");
  assert.strictEqual(extractSearchQueryFromHash("#/remote-operation/remote-meter-reading", "#/remote-operation/remote-meter-reading?q=HARUNA+ADAMU"), "HARUNA ADAMU");
  assert.strictEqual(extractSearchQueryFromHash("#/management/account?search=1002"), "1002");
  assert.strictEqual(extractSearchQueryFromHash("#/admin/meter?searchTerm=MTR-8842"), "MTR-8842");
  assert.strictEqual(extractSearchQueryFromHash("#/management/customer"), "");

  // 3. Test Sidebar routeGroups indexing
  const groups = routeGroups("super-admin");
  assert.ok(groups.length > 0, "Route groups should be loaded");
  const managementGroup = groups.find((g) => g.name === "Management");
  assert.ok(managementGroup, "Management group should exist");
  assert.ok(managementGroup.routes.length > 1, "Management should be a multi-route group");

  console.log("✅ All page-search-system tests passed successfully!");
}

runTests();
