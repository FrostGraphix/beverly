module.exports = async function handler(request, response) {
  const mod = await import("./wallet.mjs");
  return mod.default(request, response);
};
