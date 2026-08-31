const fs = require('fs');
const path = require('path');

const srcPath = 'c:\\Users\\ACOB\\Desktop\\VS Code\\Beverly\\tools\\Beverly_Mile_9_10_Clean_Account_Import.csv';
const content = fs.readFileSync(srcPath, 'utf8');

const downloadFolder = 'C:\\Users\\ACOB\\Downloads';
const targetName = 'Beverly_Mile_9_10_Account_Import_Ready.csv';
const targetPath = path.join(downloadFolder, targetName);

fs.writeFileSync(targetPath, content.trim() + '\n', 'utf8');
console.log('Successfully saved to Downloads folder:', targetPath);
