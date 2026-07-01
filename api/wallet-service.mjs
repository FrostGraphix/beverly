import { build } from "../backend/wallet/dist/server.js";

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = build().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

function targetUrl(rawUrl = "/") {
  const [pathname, query] = rawUrl.split("?", 2);
  const target = pathname.replace(/^\/api\/wallet-service/, "") || "/";
  return query ? `${target}?${query}` : target;
}

export default async function handler(request, response) {
  try {
    const app = await getApp();
    const method = String(request.method || "GET").toUpperCase();
    const payload = ["GET", "HEAD"].includes(method)
      ? undefined
      : typeof request.body === "string" || Buffer.isBuffer(request.body)
        ? request.body
        : JSON.stringify(request.body ?? {});
    const result = await app.inject({
      method,
      url: targetUrl(request.url),
      headers: request.headers,
      payload,
    });

    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) response.setHeader(name, value);
    }
    response.statusCode = result.statusCode;
    response.end(result.body);
  } catch (error) {
    console.error("[wallet-serverless]", error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      error: "wallet_backend_failed",
      message: "Wallet backend failed to start.",
    }));
  }
}
