"use strict";

function nowIso() {
  return new Date().toISOString();
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function jsonText(obj) {
  return JSON.stringify(obj || {});
}

function requireText(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    const error = new Error(`Missing required field: ${name}`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

module.exports = {
  nowIso,
  parseJson,
  jsonText,
  requireText
};
