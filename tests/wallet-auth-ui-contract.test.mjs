import assert from "node:assert";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  defaultWalletAuthForm,
  resolveWalletAuthMode,
  runWalletAuthDemo,
  validateWalletAuthForm,
  walletAuthCopy,
  walletAuthModes
} from "../src/services/vendor-auth-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorAuthPage = fs.readFileSync(path.join(root, "src/components/vendor/VendorAuthPage.vue"), "utf8");

assert.strictEqual(resolveWalletAuthMode("#/vendor/login"), walletAuthModes.login);
assert.strictEqual(resolveWalletAuthMode("#/vendor/signup"), walletAuthModes.signup);
assert.strictEqual(resolveWalletAuthMode("#/vendor/forgot-password"), walletAuthModes.forgot);
assert.strictEqual(resolveWalletAuthMode("#/vendor/password-reset"), walletAuthModes.reset);

const blankForm = { ...defaultWalletAuthForm(), identity: "", phone: "" };
assert.strictEqual(validateWalletAuthForm(walletAuthModes.login, blankForm).identity, "Email or phone is required.");
assert.strictEqual(validateWalletAuthForm(walletAuthModes.signup, blankForm).fullName, "Full name is required.");
assert.strictEqual(validateWalletAuthForm(walletAuthModes.forgot, blankForm).identity, "Provide the email or phone linked to your wallet.");
assert.strictEqual(validateWalletAuthForm(walletAuthModes.reset, { ...blankForm, identity: "wallet@beverly.test", recoveryCode: "", password: "short", confirmPassword: "short" }).recoveryCode, "Recovery or temporary code is required.");

assert.deepStrictEqual(
  runWalletAuthDemo(walletAuthModes.forgot, blankForm),
  {
    authenticated: false,
    nextMode: walletAuthModes.reset,
    notice: "Recovery code issued. Enter it below with your new password."
  }
);

assert(vendorAuthPage.includes("wallet-auth-switch"), "Auth UI should expose mode switching.");
assert.strictEqual(walletAuthCopy(walletAuthModes.signup).title, "Create your wallet access");
assert.strictEqual(walletAuthCopy(walletAuthModes.forgot).title, "Recover your wallet access");
assert.strictEqual(walletAuthCopy(walletAuthModes.reset).title, "Set a secure password");
assert(vendorAuthPage.includes("wallet-auth-proof-item"), "Auth UI should include wallet proof points.");

console.log("wallet-auth-ui-contract ok");
