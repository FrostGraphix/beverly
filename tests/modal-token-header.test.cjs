const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const cssPath = path.join(__dirname, "..", "src", "styles", "legacy-modals.css");
const css = fs.readFileSync(cssPath, "utf8");

assert(
  /\.modal-token-flow \.base-modal-shell__header\s*\{[^}]*padding:\s*12px 22px !important/.test(css),
  "token modals must reduce the BaseModalShell header padding"
);

assert(
  /\.modal-token-flow \.modal-header\s*\{[^}]*padding:\s*0 !important[^}]*background:\s*transparent !important[^}]*border:\s*0 !important/s.test(css),
  "token modal header must remove the inner title placeholder"
);

assert(
  /\.modal-token-flow \.modal-header-left\s*\{[^}]*background:\s*transparent !important[^}]*box-shadow:\s*none !important/s.test(css),
  "token modal title group must stay transparent"
);

assert(
  /\.modal\.base-modal-shell \.modal-header-left,[\s\S]*?\.picker-modal\.base-modal-shell \.modal-header-left\s*\{[^}]*gap:\s*10px[^}]*align-items:\s*center/s.test(css),
  "modal header title groups must stay centered and compact"
);

assert(
  /\.modal\.base-modal-shell \.modal-action-badge,[\s\S]*?\.picker-modal\.base-modal-shell \.modal-action-badge\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/s.test(css),
  "modal action badges must align to compact SOP sizing"
);

assert(
  /\.modal-token-flow \.modal-close\s*\{[^}]*margin-left:\s*auto/.test(css),
  "token modal close button must stay on the far right"
);

assert(
  /\.modal-title\s*\{[^}]*font-size:\s*14px[^}]*line-height:\s*1\.25/s.test(css),
  "modal titles must use the compact SOP text size"
);

assert(
  !/\.modal-title\s*\{[^}]*font-size:\s*clamp\(18px,\s*6vw,\s*24px\)/s.test(css),
  "mobile modal titles must not expand past SOP text size"
);

assert(
  /\.modal\.base-modal-shell > \.base-modal-shell__footer,[\s\S]*?\.picker-modal\.base-modal-shell > \.base-modal-shell__footer\s*\{[^}]*padding:\s*12px 22px !important/.test(css),
  "modal shell footers must use compact padding"
);

assert(
  /\.modal\.base-modal-shell \.modal-actions,[\s\S]*?\.picker-modal\.base-modal-shell \.modal-actions\s*\{[^}]*padding:\s*0 !important[^}]*background:\s*transparent !important[^}]*border:\s*0 !important/s.test(css),
  "modal action rows must remove inner footer placeholders"
);

console.log("modal token header contract passed");
