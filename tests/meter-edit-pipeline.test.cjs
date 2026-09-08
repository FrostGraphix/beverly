"use strict";

const assert = require("node:assert");
const test = require("node:test");
const path = require("path");

// Load backend services
const storage = require("../backend/src/services/storage-adapter");

// Import frontend services dynamically
async function loadModules() {
  const managementFormsMod = await import("../src/services/management-forms.mjs");
  const writeHelpersMod = await import("../src/services/write-helpers.mjs");
  const actionServiceMod = await import("../src/services/action-service.mjs");
  const routeManifestMod = await import("../src/data/route-manifest.js");
  return {
    ...managementFormsMod,
    ...writeHelpersMod,
    ...actionServiceMod,
    routeManifest: routeManifestMod.default || routeManifestMod.routes || routeManifestMod
  };
}

test("Meter Edit Pipeline - End-to-End Suite", async (t) => {
  const {
    managementForms,
    managementFormSeed,
    validateWriteForm,
    buildWritePayload,
    submitRouteAction,
    routeManifest
  } = await loadModules();

  const meterRoute = Array.isArray(routeManifest)
    ? routeManifest.find((r) => r.hash === "#/admin/meter")
    : { hash: "#/admin/meter", title: "Meter", actions: ["Edit", "Add", "Delete"] };

  assert.ok(meterRoute, "Meter route manifest exists");

  await t.test("1. Management Form Configuration for Meter Edit", () => {
    const editFields = managementForms["#/admin/meter"]?.Edit;
    assert.ok(Array.isArray(editFields), "Edit fields array is defined for #/admin/meter");

    const fieldNames = editFields.map((f) => f.name);
    assert.ok(fieldNames.includes("meterId"), "Includes meterId");
    assert.ok(fieldNames.includes("type"), "Includes type");
    assert.ok(fieldNames.includes("isThreePhase"), "Includes isThreePhase");
    assert.ok(fieldNames.includes("communicationWay"), "Includes communicationWay");
    assert.ok(fieldNames.includes("protocolVersion"), "Includes protocolVersion");
    assert.ok(fieldNames.includes("stationId"), "Includes stationId");
    assert.ok(fieldNames.includes("remark"), "Includes remark");
    assert.ok(fieldNames.includes("lat"), "Includes lat");
    assert.ok(fieldNames.includes("lng"), "Includes lng");

    const meterIdField = editFields.find((f) => f.name === "meterId");
    assert.strictEqual(meterIdField.readonly, true, "meterId is readonly in Edit mode");

    const typeField = editFields.find((f) => f.name === "type");
    assert.strictEqual(typeField.type, "select", "type is a select field");
    assert.strictEqual(typeField.options.length, 3, "type has 3 options (Electricity, Water, Gas)");

    const phaseField = editFields.find((f) => f.name === "isThreePhase");
    assert.strictEqual(phaseField.type, "select", "isThreePhase is a select field");
    assert.strictEqual(phaseField.options.length, 2, "isThreePhase has 2 options (Single, Three)");

    const commField = editFields.find((f) => f.name === "communicationWay");
    assert.strictEqual(commField.type, "select", "communicationWay is a select field");
  });

  await t.test("2. Form Seeding from Diverse Table Row Formats", () => {
    // Row format from standard Calinmeter API read
    const calinmeterRow = {
      meterId: "47005310009",
      meterType: "Electricity",
      type: 0,
      isThreePhase: 0,
      communicationWay: "LoraWan",
      communicationWayCode: 1,
      protocolVersion: "2.2",
      stationId: "OFEMILI",
      lat: "6.5244",
      lng: "3.3792",
      remark: "Main feeder unit"
    };

    const seed = managementFormSeed(meterRoute, "Edit", calinmeterRow);
    assert.strictEqual(seed.meterId, "47005310009");
    assert.strictEqual(seed.type, "0", "Normalized Electricity to 0");
    assert.strictEqual(seed.isThreePhase, "0", "Normalized Single Phase to 0");
    assert.strictEqual(seed.communicationWay, "1", "Normalized LoraWan to 1");
    assert.strictEqual(seed.protocolVersion, "2.2");
    assert.strictEqual(seed.stationId, "OFEMILI", "StationId is capitalized");
    assert.strictEqual(seed.lat, "6.5244");
    assert.strictEqual(seed.lng, "3.3792");
    assert.strictEqual(seed.remark, "Main feeder unit");

    // Row format with boolean phase and string type
    const altRow = {
      id: "47005310017",
      meter_type: "water",
      is_three_phase: true,
      communication_way: "gprs",
      station_id: "mile 9 & 10",
      remark: "Sub station"
    };

    const altSeed = managementFormSeed(meterRoute, "Edit", altRow);
    assert.strictEqual(altSeed.meterId, "47005310017");
    assert.strictEqual(altSeed.type, "1", "Normalized water to 1");
    assert.strictEqual(altSeed.isThreePhase, "1", "Normalized boolean true to 1");
    assert.strictEqual(altSeed.communicationWay, "0", "Normalized gprs to 0");
    assert.strictEqual(altSeed.stationId, "MILE 9 & 10", "Uppercase station");
    assert.strictEqual(altSeed.remark, "Sub station");
  });

  await t.test("3. Form Validation & Payload Normalization", () => {
    const validForm = {
      meterId: "47005310009",
      type: "0",
      isThreePhase: "0",
      communicationWay: "1",
      protocolVersion: "2.2",
      stationId: "OFEMILI",
      lat: "6.5244",
      lng: "3.3792",
      remark: "Updated remark note"
    };

    const validError = validateWriteForm("Edit", meterRoute, validForm, managementForms["#/admin/meter"].Edit);
    assert.strictEqual(validError, "", "Valid form passes validation");

    const payload = buildWritePayload("/api/meter/update", validForm, managementForms["#/admin/meter"].Edit);
    assert.ok(Array.isArray(payload), "Payload is wrapped in array for /api/meter/update");
    assert.strictEqual(payload[0].meterId, "47005310009");
    assert.strictEqual(payload[0].type, 0, "type is converted to number");
    assert.strictEqual(payload[0].isThreePhase, 0, "isThreePhase is converted to number");
    assert.strictEqual(payload[0].communicationWay, 1, "communicationWay is converted to number");
    assert.strictEqual(payload[0].stationId, "OFEMILI");
    assert.strictEqual(payload[0].lat, 6.5244, "lat is converted to number");
    assert.strictEqual(payload[0].lng, 3.3792, "lng is converted to number");
    assert.strictEqual(payload[0].remark, "Updated remark note");

    // Invalid coordinate test
    const invalidCoordForm = { ...validForm, lat: "95.5" };
    const coordError = validateWriteForm("Edit", meterRoute, invalidCoordForm, managementForms["#/admin/meter"].Edit);
    assert.ok(coordError.includes("lat must be between -90 and 90"), "Detects invalid latitude");

    // Invalid type test
    const invalidTypeForm = { ...validForm, type: "9" };
    const typeError = validateWriteForm("Edit", meterRoute, invalidTypeForm, managementForms["#/admin/meter"].Edit);
    assert.ok(typeError.includes("type must be 0, 1, or 2"), "Detects invalid type");
  });

  await t.test("4. Storage Adapter Persistence for Meters", async () => {
    const testMeterData = {
      meterId: "TEST_METER_9999",
      type: 0,
      isThreePhase: 1,
      communicationWay: 1,
      protocolVersion: "2.2",
      stationId: "TEST_STATION",
      remark: "Test meter update persistence",
      lat: 6.5,
      lng: 3.3
    };

    const saved = await storage.upsertMeterRecord(testMeterData);
    assert.ok(saved, "upsertMeterRecord returned result");
    assert.strictEqual(saved.upstream_id || saved.meterId || saved.raw_payload?.meterId, "TEST_METER_9999");

    const deleted = await storage.deleteMeterRecord("TEST_METER_9999");
    assert.strictEqual(deleted, 1, "deleteMeterRecord deleted test record");
  });

  await t.test("5. End-to-End Action Execution with Verification", async () => {
    let readCalled = false;
    let updateCalled = false;

    const mockApi = {
      async postApi(endpoint, body) {
        if (endpoint === "/api/meter/update") {
          updateCalled = true;
          return { code: 0, msg: "success", result: { updated: 1 } };
        }
        if (endpoint === "/api/meter/read") {
          readCalled = true;
          return {
            code: 0,
            result: {
              data: [
                {
                  meterId: "47005310009",
                  type: 0,
                  isThreePhase: 0,
                  communicationWay: 1,
                  communicationWayCode: 1,
                  protocolVersion: "2.2",
                  stationId: "OFEMILI",
                  lat: 6.5244,
                  lng: 3.3792,
                  remark: "Updated remark note"
                }
              ]
            }
          };
        }
        return { code: 0 };
      }
    };

    const validForm = {
      meterId: "47005310009",
      type: "0",
      isThreePhase: "0",
      communicationWay: "1",
      protocolVersion: "2.2",
      stationId: "OFEMILI",
      lat: "6.5244",
      lng: "3.3792",
      remark: "Updated remark note"
    };

    const result = await submitRouteAction(meterRoute, "Edit", validForm, {
      api: mockApi,
      liveWritesAllowed: true
    });

    assert.strictEqual(updateCalled, true, "Called /api/meter/update");
    assert.strictEqual(readCalled, true, "Called /api/meter/read for verification");
    assert.strictEqual(result.verified, true, "Verification succeeded");
  });

  await t.test("6. No-Change Edit Acceptance (Calinmeter Code 99)", async () => {
    const mockNoChangeApi = {
      async postApi(endpoint) {
        if (endpoint === "/api/meter/update") {
          return { code: 99, msg: "No data has been changed", reason: "No data has been changed" };
        }
        if (endpoint === "/api/meter/read") {
          return {
            code: 0,
            result: {
              data: [
                {
                  meterId: "47005310009",
                  type: 0,
                  isThreePhase: 0,
                  communicationWay: 1,
                  protocolVersion: "2.2",
                  stationId: "OFEMILI",
                  remark: "Unchanged"
                }
              ]
            }
          };
        }
        return { code: 0 };
      }
    };

    const validForm = {
      meterId: "47005310009",
      type: "0",
      isThreePhase: "0",
      communicationWay: "1",
      protocolVersion: "2.2",
      stationId: "OFEMILI",
      remark: "Unchanged"
    };

    const result = await submitRouteAction(meterRoute, "Edit", validForm, {
      api: mockNoChangeApi,
      liveWritesAllowed: true
    });

    assert.strictEqual(result.verified, true, "No-change update was accepted cleanly without throwing");
  });

  await t.test("7. Form Seeding with Missing/String Communication & Default Fallbacks", () => {
    const rawRowWithoutComms = {
      meterId: "47000480929",
      meterType: "Electricity",
      isThreePhase: 0,
      protocolVersion: "2.2",
      stationId: "TUNGA",
      lat: 0,
      lng: 0,
      remark: ""
    };

    const seed = managementFormSeed(meterRoute, "Edit", rawRowWithoutComms);
    assert.strictEqual(seed.communicationWay, "1", "Defaults missing communicationWay to 1 (LoraWan)");
    assert.strictEqual(seed.type, "0", "Defaults Electricity to 0");
    assert.strictEqual(seed.isThreePhase, "0", "Defaults Single Phase to 0");

    const validationErr = validateWriteForm("Edit", meterRoute, seed, managementForms["#/admin/meter"].Edit);
    assert.strictEqual(validationErr, "", "Form is immediately valid without leaving communication blank");
  });

  await t.test("8. Cross-Station / Retained Upstream Station Verification Acceptance", async () => {
    // Simulates user editing meter 47000480929 in station TUNGA while upstream Calinmeter returns UMAISHA
    const mockCrossStationApi = {
      async postApi(endpoint, body) {
        if (endpoint === "/api/meter/update") {
          return { code: 0, msg: "success", result: { updated: 1 } };
        }
        if (endpoint === "/api/meter/read") {
          return {
            code: 0,
            result: {
              data: [
                {
                  meterId: "47000480929",
                  type: 0,
                  isThreePhase: 0,
                  communicationWay: 1,
                  protocolVersion: "2.2",
                  stationId: "UMAISHA", // Upstream retains UMAISHA partition
                  lat: 0,
                  lng: 0,
                  remark: ""
                }
              ]
            }
          };
        }
        return { code: 0 };
      }
    };

    const formWithTungaStation = {
      meterId: "47000480929",
      type: "0",
      isThreePhase: "0",
      communicationWay: "1",
      protocolVersion: "2.2",
      stationId: "TUNGA", // Form selected TUNGA
      lat: "0",
      lng: "0",
      remark: ""
    };

    const result = await submitRouteAction(meterRoute, "Edit", formWithTungaStation, {
      api: mockCrossStationApi,
      liveWritesAllowed: true
    });

    assert.strictEqual(result.verified, true, "Verification succeeds and does not throw stationId mismatch error");
  });
});

