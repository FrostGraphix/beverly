const fs=require('fs'); const s=JSON.parse(fs.readFileSync('tmp/swagger.json','utf8')); console.log(JSON.stringify(s.components.schemas['DailyDataMeterReadRequest'].properties, null, 2));
