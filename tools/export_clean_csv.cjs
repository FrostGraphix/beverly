const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\ACOB\\Downloads\\Beverly_Account_Import_Template (1) (1).csv';
const content = fs.readFileSync(srcPath, 'utf8');

// Copy directly to a clean workspace path for easy reference
const targetPath = path.join(__dirname, 'Beverly_Mile_9_10_Clean_Account_Import.csv');
fs.writeFileSync(targetPath, content.trim() + '\n', 'utf8');
console.log('Created clean export file at:', targetPath);
