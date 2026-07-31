const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const logoSourcePath = 'C:\\Users\\ACOB\\OneDrive\\Documents\\ACOB logo 222.png';
const logoDestPath = path.resolve(__dirname, '../acob-logo.png');
const publicLogoPath = path.resolve(__dirname, '../public/brand/acob-logo.png');

console.log('Copying exact ACOB logo...');
fs.copyFileSync(logoSourcePath, logoDestPath);

// Create directory if not exists
const publicBrandDir = path.resolve(__dirname, '../public/brand');
if (!fs.existsSync(publicBrandDir)) {
  fs.mkdirSync(publicBrandDir, { recursive: true });
}
fs.copyFileSync(logoSourcePath, publicLogoPath);

// Convert logo to Base64 data URL
const logoBuffer = fs.readFileSync(logoSourcePath);
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

// Read HTML file
const htmlPath = path.resolve(__dirname, '../acob_beverly_training_plan.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace the SVG block inside .acob-logo-wrapper with <img src="..." />
const logoWrapperRegex = /<div class="acob-logo-wrapper">[\s\S]*?<\/div>/;
const newLogoHtml = `<div class="acob-logo-wrapper" style="background: transparent; padding: 0;">
          <img src="${logoBase64}" alt="ACOB Lighting Technology Limited Logo" style="height: 52px; width: auto; object-fit: contain; display: block;" />
        </div>`;

html = html.replace(logoWrapperRegex, newLogoHtml);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML updated with exact Base64 logo!');

// Re-generate PDF using Edge
const pdfPath = path.resolve(__dirname, '../acob_beverly_training_plan.pdf');
const artifactPdfPath = 'C:\\Users\\ACOB\\.gemini\\antigravity\\brain\\b0596cb2-6635-4c76-b737-47e9fd14d6f7\\acob_beverly_training_plan.pdf';
const edgeBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const cmd = `"${edgeBin}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;
execSync(cmd, { stdio: 'inherit' });
console.log('PDF re-generated successfully!');

if (fs.existsSync(pdfPath)) {
  fs.copyFileSync(pdfPath, artifactPdfPath);
  console.log('PDF copied to artifacts directory!');
}
