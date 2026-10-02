#!/usr/bin/env node
"use strict";

/**
 * Retired OEM pre-staging command.
 *
 * Generic manufacturer defaults can misroute money, meter operations, and
 * customer data. OEM records, capabilities, endpoint methods, and vending
 * strategies must originate from the certified OEM provisioning workflow.
 *
 * This command deliberately makes no database or provider request.
 */

console.error(
  "[prestage] retired: use the certified OEM provisioning workflow with verified provider specifications."
);
process.exitCode = 1;
