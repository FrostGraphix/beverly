"use strict";

function walletPaymentEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    CUSTOMER_APP_URL: "http://localhost:5173",
    VENDOR_PORTAL_URL: "http://localhost:5174",
    CUSTOMER_FUNDING_CALLBACK_URL: "http://localhost:5173/wallet/fund?payment=return",
    VENDOR_FUNDING_CALLBACK_URL: "http://localhost:5174/wallet/fund?payment=return",
    CUSTOMER_METER_ORDER_CALLBACK_URL: "http://localhost:5173/meter-orders",
  };
}

module.exports = { walletPaymentEnv };
