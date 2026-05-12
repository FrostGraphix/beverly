"use strict";

const major = Number(process.versions.node.split(".")[0]);
if (major !== 22) {
  console.error(`Expected Node 22, got ${process.version}`);
  process.exit(1);
}

console.log(process.version);
