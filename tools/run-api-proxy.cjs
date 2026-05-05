"use strict";

const http = require("http");
const referenceHandler = require("../api/reference");

const apiPort = Number(process.env.API_PORT || 9410);

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

const apiServer = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  try {
    await referenceHandler(request, {
      status(statusCode) {
        return {
          json(body) {
            writeJson(response, statusCode, body);
          }
        };
      }
    });
  } catch (error) {
    writeJson(response, 500, {
      code: 500,
      msg: error instanceof Error ? error.message : "Internal error",
      reason: error instanceof Error ? error.message : "Internal error",
      data: null,
      result: null
    });
  }
});

apiServer.listen(apiPort, "127.0.0.1", () => {
  console.log(`api proxy http://127.0.0.1:${apiPort}`);
});
