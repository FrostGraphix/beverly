const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const htmlPath = path.resolve(__dirname, '../acob_beverly_training_plan.html');
const pdfPath = path.resolve(__dirname, '../acob_beverly_training_plan.pdf');
const artifactPdfPath = 'C:\\Users\\ACOB\\.gemini\\antigravity\\brain\\b0596cb2-6635-4c76-b737-47e9fd14d6f7\\acob_beverly_training_plan.pdf';

const edgeBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

console.log('Generating PDF from:', htmlPath);

try {
  const cmd = `"${edgeBin}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log('Edge generated PDF successfully at:', pdfPath);

  if (fs.existsSync(pdfPath)) {
    fs.copyFileSync(pdfPath, artifactPdfPath);
    console.log('Copied PDF to artifact dir:', artifactPdfPath);
  }
} catch (err) {
  console.error('Edge PDF generation failed, trying node script fallback...', err);
}
