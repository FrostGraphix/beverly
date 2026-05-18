import { demoLogin, setCookie } from "./api.js";

export const walletAuthModes = Object.freeze({
  login: "login",
  signup: "signup",
  forgot: "forgot",
  reset: "reset"
});

const modeHashes = Object.freeze({
  [walletAuthModes.login]: "#/vendor/login",
  [walletAuthModes.signup]: "#/vendor/signup",
  [walletAuthModes.forgot]: "#/vendor/forgot-password",
  [walletAuthModes.reset]: "#/vendor/password-reset"
});

const authCopy = Object.freeze({
  [walletAuthModes.login]: {
    title: "Sign in to continue",
    subtitle: "Access balances, funding, vending, and every receipt from one Beverly wallet workspace.",
    submitLabel: "Sign in",
    switchPrompt: "New to Beverly Wallet?",
    switchLabel: "Create access",
    alternateAction: "Recover access"
  },
  [walletAuthModes.signup]: {
    title: "Create your wallet access",
    subtitle: "Stage a customer-ready wallet profile with a verified contact and an activation secret.",
    submitLabel: "Create account",
    switchPrompt: "Already have access?",
    switchLabel: "Return to sign in",
    alternateAction: "Use a recovery code"
  },
  [walletAuthModes.forgot]: {
    title: "Recover your wallet access",
    subtitle: "We will issue a recovery code to the identity on file so you can set a fresh password.",
    submitLabel: "Send recovery code",
    switchPrompt: "Remembered your details?",
    switchLabel: "Return to sign in",
    alternateAction: "Enter recovery code"
  },
  [walletAuthModes.reset]: {
    title: "Set a secure password",
    subtitle: "Confirm the recovery or temporary code, then lock in a new password for your Beverly wallet profile.",
    submitLabel: "Complete setup",
    switchPrompt: "Need a new code?",
    switchLabel: "Request another one",
    alternateAction: "Return to sign in"
  }
});

export function resolveWalletAuthMode(hash = "") {
  const value = String(hash || "").toLowerCase();
  if (value.includes("signup")) return walletAuthModes.signup;
  if (value.includes("forgot-password")) return walletAuthModes.forgot;
  if (value.includes("password-reset")) return walletAuthModes.reset;
  return walletAuthModes.login;
}

export function walletAuthHash(mode = walletAuthModes.login) {
  return modeHashes[mode] || modeHashes[walletAuthModes.login];
}

export function walletAuthCopy(mode = walletAuthModes.login) {
  return authCopy[mode] || authCopy[walletAuthModes.login];
}

export function defaultWalletAuthForm() {
  return {
    fullName: "",
    businessName: "",
    identity: "vendor.demo@acob.ng",
    phone: "+2348012345678",
    password: "",
    confirmPassword: "",
    recoveryCode: "",
    remember: true,
    acceptTerms: false
  };
}

export function walletAuthHighlights() {
  return [
    { label: "Wallet funding", value: "Manual review with proof traceability" },
    { label: "Token delivery", value: "Generate or remotely dispatch from one queue" },
    { label: "Receipts", value: "Keep every vend and recovery step auditable" }
  ];
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function hasPhoneLikeValue(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length >= 10;
}

function strongPassword(value) {
  return String(value || "").length >= 8;
}

export function validateWalletAuthForm(mode = walletAuthModes.login, form = {}) {
  const errors = {};
  const identity = String(form.identity || "").trim();
  const password = String(form.password || "");
  const confirmPassword = String(form.confirmPassword || "");
  const phone = String(form.phone || "").trim();
  const fullName = String(form.fullName || "").trim();
  const recoveryCode = String(form.recoveryCode || "").trim();

  if (mode === walletAuthModes.login) {
    if (!identity) errors.identity = "Email or phone is required.";
    if (!password) errors.password = "Password is required.";
    return errors;
  }

  if (mode === walletAuthModes.signup) {
    if (!fullName) errors.fullName = "Full name is required.";
    if (!identity || !isEmail(identity)) errors.identity = "Enter a valid email address.";
    if (!phone || !hasPhoneLikeValue(phone)) errors.phone = "Enter a valid phone number.";
    if (!strongPassword(password)) errors.password = "Use at least 8 characters.";
    if (confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";
    if (!form.acceptTerms) errors.acceptTerms = "Accept the wallet terms to continue.";
    return errors;
  }

  if (mode === walletAuthModes.forgot) {
    if (!identity && !phone) {
      errors.identity = "Provide the email or phone linked to your wallet.";
      return errors;
    }
    if (identity && !isEmail(identity) && !hasPhoneLikeValue(identity)) {
      errors.identity = "Use a valid email address or phone number.";
    }
    if (phone && !hasPhoneLikeValue(phone)) errors.phone = "Enter a valid phone number.";
    return errors;
  }

  if (!identity || !isEmail(identity)) errors.identity = "Enter the wallet email on file.";
  if (!recoveryCode) errors.recoveryCode = "Recovery or temporary code is required.";
  if (!strongPassword(password)) errors.password = "Use at least 8 characters.";
  if (confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

export function runWalletAuthDemo(mode = walletAuthModes.login, form = {}) {
  if (mode === walletAuthModes.login) {
    if (String(form.password || "").includes("Bv@")) {
      return {
        authenticated: false,
        nextMode: walletAuthModes.reset,
        notice: "Temporary password detected. Set a permanent password to continue."
      };
    }
    return {
      authenticated: true,
      nextMode: walletAuthModes.login,
      notice: "Welcome back. Wallet operations are ready."
    };
  }

  if (mode === walletAuthModes.signup) {
    return {
      authenticated: false,
      nextMode: walletAuthModes.reset,
      notice: "Account staged. Use the activation code from Beverly support to complete setup."
    };
  }

  if (mode === walletAuthModes.forgot) {
    return {
      authenticated: false,
      nextMode: walletAuthModes.reset,
      notice: "Recovery code issued. Enter it below with your new password."
    };
  }

  return {
    authenticated: true,
    nextMode: walletAuthModes.login,
    notice: "Password updated. Your wallet session is now active."
  };
}

export function writeWalletDemoSession({ passwordResetRequired = false, accountStatus = "approved" } = {}) {
  demoLogin("vendor");
  setCookie("vendorOrganizationId", "vendor-demo-org");
  setCookie("walletStatus", "active");
  setCookie("onboardingStatus", accountStatus);
  setCookie("passwordResetRequired", String(passwordResetRequired));
}
