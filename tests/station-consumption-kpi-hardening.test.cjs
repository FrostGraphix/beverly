"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826130000_station_consumption_kpi_hardening.sql");
assert(fs.existsSync(migrationPath), "station-consumption KPI hardening migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /create or replace function public\.get_station_consumption_analytics/i);
assert.match(sql, /reading_date\s*<=\s*p_to/i, "meter totals must be resolved as of the selected end date");
assert.match(sql, /left join lateral[\s\S]*order by d\.reading_date desc[\s\S]*limit 1/i, "each meter must contribute only its latest eligible reading");
assert.doesNotMatch(sql, /any\s*\(\s*array\s*\[\s*'TUNGA'/i, "analytics must not contain a station allow-list");
assert.match(sql, /select distinct upper\(station_id\)/i, "refresh orchestration must discover stations from stored readings");
assert.match(sql, /refresh-meter-aggregates-dynamic/i, "one dynamic refresh job must replace fixed per-station jobs");
assert.match(sql, /cron\.unschedule/i);

console.log("station consumption KPI hardening migration contract passed");
