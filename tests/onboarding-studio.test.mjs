import assert from "node:assert";
import { routeManifest } from "../src/data/route-manifest.js";
import { actionEndpoint } from "../src/services/action-service.mjs";
import { managementFields, managementFormSeed } from "../src/services/management-forms.mjs";
import {
  buildOnboardingBoard,
  normalizeOnboardingRows,
  normalizeOnboardingTotal,
  onboardingPrefillRow,
  payloadStationIdFromAction,
  selectStationValue,
  stationOptionsFromRows
} from "../src/services/onboarding-studio-service.mjs";

const meterRoute = routeManifest.find((route) => route.hash === "#/admin/meter");
const onboardingRoute = routeManifest.find((route) => route.hash === "#/system/station-onboarding-studio");

assert(meterRoute, "Meter route should exist");
assert(onboardingRoute, "Onboarding route should exist");
assert(meterRoute.actions.includes("Add"));
assert(meterRoute.actions.includes("Edit"));
assert(meterRoute.actions.includes("Delete"));
assert(meterRoute.actions.includes("Import"));
assert.strictEqual(onboardingRoute.customComponent, "OnboardingStudioPage");

assert.strictEqual(actionEndpoint(meterRoute, "Add"), "/api/meter/create");
assert.strictEqual(actionEndpoint(meterRoute, "Edit"), "/api/meter/update");
assert.strictEqual(actionEndpoint(meterRoute, "Delete"), "/api/meter/delete");
assert.strictEqual(actionEndpoint(routeManifest.find((route) => route.hash === "#/admin/station"), "Add"), "/api/station/create");
assert.strictEqual(actionEndpoint(routeManifest.find((route) => route.hash === "#/management/gateway"), "Add"), "/api/gateway/create");
assert.strictEqual(actionEndpoint(routeManifest.find((route) => route.hash === "#/management/account"), "Add"), "/api/account/create");

const meterAddFields = managementFields(meterRoute, "Add");
assert(meterAddFields.some((field) => field.name === "meterId" && field.required));
assert(meterAddFields.some((field) => field.name === "type" && field.type === "select"));
assert(meterAddFields.some((field) => field.name === "communicationWay" && field.type === "select"));
assert(meterAddFields.some((field) => field.name === "stationId" && field.required));

assert.deepStrictEqual(
  managementFormSeed(meterRoute, "Edit", {
    meterId: "M-1001",
    type: 0,
    isThreePhase: 1,
    communicationWay: 1,
    protocolVersion: "2.2",
    lat: 9.08,
    lng: 7.49,
    stationId: "tunga",
    remark: "QA"
  }),
  {
    meterId: "M-1001",
    type: "0",
    isThreePhase: "1",
    communicationWay: "1",
    protocolVersion: "2.2",
    lat: 9.08,
    lng: 7.49,
    stationId: "TUNGA",
    remark: "QA"
  }
);

const stationResponse = {
  code: 0,
  data: {
    data: [
      { stationId: "tunga", name: "Tunga Field" },
      { id: "MUSHA", name: "Musha" }
    ],
    total: 2
  }
};
const stationRows = normalizeOnboardingRows(stationResponse);
assert.strictEqual(normalizeOnboardingTotal(stationResponse), 2);
assert.deepStrictEqual(
  stationOptionsFromRows(stationRows).map((option) => option.value),
  ["TUNGA", "MUSHA"]
);
assert.strictEqual(selectStationValue("missing", stationOptionsFromRows(stationRows)), "TUNGA");

const readyBoard = buildOnboardingBoard({
  stationRows,
  gatewayRows: [{ gatewayId: "GW-1", stationId: "TUNGA" }],
  meterRows: [{ meterId: "M-1", stationId: "TUNGA", communicationWay: "1" }],
  customerRows: [{ customerId: "C-1", stationId: "TUNGA" }],
  accountRows: [{ customerId: "C-1", meterId: "M-1", stationId: "TUNGA" }],
  tariffRows: [{ tariffId: "RES", price: "350" }],
  selectedStation: "tunga"
});
assert.strictEqual(readyBoard.readiness.provisioning, true);
assert.strictEqual(readyBoard.readiness.vending, true);
assert.strictEqual(readyBoard.readiness.remote, true);
assert.strictEqual(readyBoard.readiness.report, true);
assert.deepStrictEqual(onboardingPrefillRow("account", readyBoard), {
  stationId: "TUNGA",
  customerId: "C-1",
  customerStationId: "TUNGA",
  meterId: "M-1",
  meterStationId: "TUNGA",
  tariffId: "RES",
  ctRatio: "1",
  communicationWay: "1"
});
assert.strictEqual(payloadStationIdFromAction({ payload: [{ stationId: "ogufa" }] }), "OGUFA");

console.log("onboarding-studio ok");
