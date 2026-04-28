import assert from "node:assert";
import { maxUploadBytes, uploadAcceptValue, validateUploadFile } from "../src/services/upload-policy.mjs";

assert(uploadAcceptValue().includes(".bin"));
assert.strictEqual(validateUploadFile({ name: "firmware.bin", size: 1024, type: "application/octet-stream" }), "");
assert(validateUploadFile({ name: "firmware.exe", size: 1024, type: "application/x-msdownload" }).includes("Allowed upload types"));
assert(validateUploadFile({ name: "large.bin", size: maxUploadBytes + 1, type: "application/octet-stream" }).includes("4MB"));

console.log(JSON.stringify({
  maxUploadBytes,
  status: "upload policy passed"
}, null, 2));
