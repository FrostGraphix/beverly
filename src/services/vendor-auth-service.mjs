import { demoLogin } from "./api";

export function enterVendorPortalDemo() {
  return demoLogin("vendor");
}

export function enterStaffWalletDemo() {
  return demoLogin("admin");
}
