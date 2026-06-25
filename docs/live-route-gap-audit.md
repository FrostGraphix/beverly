# Live Route Gap Audit

Generated: 2026-06-25T11:13:48.703Z

| Route | Endpoint | Source | Gap |
| --- | --- | --- | --- |
| Dashboard | `/api/dashboard` | live-ready | none |
| Report Centre | `/api/reports/settlement` | mixed | needs live sample |
| Credit Token | `/api/account/read` | live-ready | none |
| Change Meter Key | `/api/account/read` | live-ready | none |
| Clear Tamper Token | `/api/account/read` | live-ready | none |
| Clear Credit Token | `/api/account/read` | live-ready | none |
| Set Maximum Power Limit Token | `/api/account/read` | live-ready | none |
| Credit Token Record | `/api/token/creditTokenRecord/readMore` | live-ready | none |
| Clear Tamper Token Record | `/api/token/clearTamperTokenRecord/read` | live-ready | none |
| Clear Credit Token Record | `/api/token/clearCreditTokenRecord/read` | live-ready | none |
| Set Maximum Power Limit Token Record | `/api/token/setMaximumPowerLimitTokenRecord/read` | live-ready | none |
| Meter Reading | `/api/account/read` | live-ready | none |
| Meter Control | `/api/account/read` | live-ready | none |
| Meter Token | `/api/account/read` | live-ready | none |
| Meter Reading Task | `/API/RemoteMeterTask/GetReadingTask` | live-ready | none |
| Meter Control Task | `/API/RemoteMeterTask/GetControlTask` | live-ready | none |
| Meter Token Task | `/API/RemoteMeterTask/GetTokenTask` | live-ready | none |
| Long Nonpurchase Situation | `/API/PrepayReport/LongNonpurchaseSituation` | live-ready | none |
| Low Purchase Situation | `/API/PrepayReport/LowPurchaseSituation` | live-ready | none |
| Consumption Statistics | `/api/DailyDataMeter/readHourly` | live-derived | none |
| Interval Data | `/api/DailyDataMeter/readHourly` | live-ready | none |
| Abnormal Alarm | `/api/local/abnormal-alarms` | mixed | needs live sample |
| Station Consumption | `/api/local/consumption/station-analytics` | mixed | needs live sample |
| Gateway | `/api/gateway/read` | live-ready | none |
| Customer | `/api/customer/read` | live-ready | none |
| Tariff | `/api/tariff/read` | live-ready | none |
| Account | `/api/account/read` | live-ready | none |
| User | `/api/user/read` | live-ready | none |
| Role | `/api/role/read` | live-ready | none |
| Log | `/api/Log/read` | live-ready | none |
| Station | `/api/station/read` | live-ready | none |
| Item | `/api/item/read` | live-ready | none |
| Meter | `/api/meter/read` | live-ready | none |
| Debt | `/api/debt/read` | live-ready | none |
| DLMS | `/api/dlms/read` | live-ready | none |
| DLT645 | `/api/dlt645/read` | blocked | blocked by upstream |
| GPRS Tasks | `/API/GPRSMeterTask/GPRSGetTokenTask` | mixed | needs live sample |
| GPRS Online Status | `/API/GPRSOnlineStatus/Read` | live-ready | none |
| Load Profile | `/api/LoadProfile/ElectricEnergyCurve` | live-ready | none |
| Event Notification | `/API/EventNotification/Read` | live-ready | none |
| Firmware Update | `/API/UpdateFirmwareTask/GetUpdateFirmwareTask` | live-ready | none |
| File Upload | `/api/File/Upload` | guarded-write | write endpoint stays guarded |
| Station Onboarding Studio | `/api/tariff/read` | live-ready | none |
| Automation Command | `/api/system/automation-control` | mixed | needs live sample |

## Known Upstream Defect

`/API/PrepayReport/ConsumptionStatistics` returns code 99 with valid schema payloads.
The app now derives that report from `/api/DailyDataMeter/readHourly`.
This keeps the route live-backed without sampled rows.
