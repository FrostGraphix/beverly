import assert from "node:assert";
import { buildWritePayload, confirmationMessage, isWriteEndpoint, needsAuthorizationPassword, usesArrayPayload, validateWriteForm } from "../src/services/write-helpers.mjs";

assert.strictEqual(isWriteEndpoint("/api/account/create"), true);
assert.strictEqual(isWriteEndpoint("/api/account/read"), false);
assert.strictEqual(isWriteEndpoint("/API/File/Upload"), true);
assert.strictEqual(usesArrayPayload("/api/account/create"), true);
assert.strictEqual(usesArrayPayload("/api/token/creditToken/generate"), false);
assert.strictEqual(needsAuthorizationPassword("Delete"), true);
assert.strictEqual(needsAuthorizationPassword("Export"), false);
assert.strictEqual(validateWriteForm("Add", { customerId: "1", meterId: "2", authorizationPassword: "secret" }, [{ name: "customerId" }, { name: "meterId" }]), "");
assert.strictEqual(validateWriteForm("Add", { customerId: "", meterId: "2", authorizationPassword: "secret" }, [{ name: "customerId" }, { name: "meterId" }]), "customerId is required");
assert.strictEqual(validateWriteForm("Add", { customerId: "1", meterId: "2" }, [{ name: "customerId" }, { name: "meterId" }]), "authorizationPassword is required");
assert.deepStrictEqual(buildWritePayload("/api/account/create", { customerId: "1", authorizationPassword: "secret", confirmationText: "ok" }), [{ customerId: "1", confirmationText: "ok" }]);
assert.deepStrictEqual(buildWritePayload("/api/token/creditToken/generate", { customerId: "1", authorizationPassword: "secret" }), { customerId: "1" });
assert(confirmationMessage("Delete", "Customer").includes("Customer"));
assert(confirmationMessage("Import", "File Upload").includes("upload"));

console.log(JSON.stringify({
  arrayPayload: usesArrayPayload("/api/account/create"),
  writeEndpoint: isWriteEndpoint("/api/account/create"),
  status: "write helpers passed"
}, null, 2));
