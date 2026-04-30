const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../src/styles/reference.css');
let css = fs.readFileSync(cssPath, 'utf8');

const replacements = [
  { from: /font-family: var\(--font\);/g, to: 'font-family: var(--font-family);' },
  { from: /var\(--page\)/g, to: 'var(--bg-page)' },
  { from: /var\(--text\)/g, to: 'var(--text-main)' },
  { from: /var\(--muted\)/g, to: 'var(--text-muted)' },
  { from: /var\(--strong\)/g, to: 'var(--text-strong)' },
  
  { from: /var\(--blue\)/g, to: 'var(--primary)' },
  { from: /#1890ff/gi, to: 'var(--primary)' },
  { from: /#409eff/gi, to: 'var(--primary)' },
  { from: /#2196f3/gi, to: 'var(--primary)' },
  { from: /#028ee2/gi, to: 'var(--primary)' },
  { from: /#028ed8/gi, to: 'var(--primary)' },
  
  { from: /var\(--success\)/g, to: 'var(--success)' },
  { from: /#67c23a/gi, to: 'var(--success)' },
  { from: /#42b983/gi, to: 'var(--success)' },
  
  { from: /var\(--danger\)/g, to: 'var(--danger)' },
  { from: /#f56c6c/gi, to: 'var(--danger)' },
  { from: /#ef4444/gi, to: 'var(--danger)' },
  
  { from: /#fff/gi, to: 'var(--bg-card)' },
  { from: /#ffffff/gi, to: 'var(--bg-card)' },
  
  { from: /#606266/g, to: 'var(--text-main)' },
  { from: /#909399/g, to: 'var(--text-muted)' },
  { from: /#303133/g, to: 'var(--text-strong)' },
  { from: /#666/g, to: 'var(--text-main)' },
  
  { from: /#dcdfe6/gi, to: 'var(--border-color)' },
  { from: /#d8dce5/gi, to: 'var(--border-color)' },
  { from: /#e6e6e6/gi, to: 'var(--border-color)' },
  { from: /var\(--line\)/g, to: 'var(--border-color)' },
  
  { from: /box-shadow: 0 1px 2px rgba\(0,0,0,\.02\)/g, to: 'box-shadow: var(--shadow-sm)' },
  { from: /box-shadow: 0 3px 7px rgba\(0,0,0,\.11\)/g, to: 'box-shadow: var(--shadow-md)' },
  { from: /box-shadow: 4px 4px 40px rgba\(0,0,0,\.05\)/g, to: 'box-shadow: var(--shadow-md)' },
  { from: /box-shadow: 0 12px 28px rgba\(43,67,91,\.09\)/g, to: 'box-shadow: var(--shadow-lg)' },
  { from: /box-shadow: 0 4px 20px rgba\(0,0,0,\.05\)/g, to: 'box-shadow: var(--shadow-md)' },
  { from: /box-shadow: 0 2px 12px rgba\(0,0,0,\.2\)/g, to: 'box-shadow: var(--shadow-lg)' },
  
  { from: /border-radius: 4px/g, to: 'border-radius: var(--radius-sm)' },
  { from: /border-radius: 6px/g, to: 'border-radius: var(--radius-md)' },
  { from: /border-radius: 8px/g, to: 'border-radius: var(--radius-md)' },
  { from: /border-radius: 2px/g, to: 'border-radius: var(--radius-sm)' },
  
  { from: /transition: all \.28s ease/g, to: 'transition: all var(--transition-normal)' },
  { from: /transition: all \.2s ease/g, to: 'transition: all var(--transition-fast)' },
  { from: /transition: all \.3s ease/g, to: 'transition: all var(--transition-normal)' },
  { from: /transition: width \.4s cubic-bezier\(0\.4, 0, 0\.2, 1\), transform \.4s cubic-bezier\(0\.4, 0, 0\.2, 1\)/g, to: 'transition: width var(--transition-layout), transform var(--transition-layout)' },
  { from: /transition: margin-left \.4s cubic-bezier\(0\.4, 0, 0\.2, 1\)/g, to: 'transition: margin-left var(--transition-layout)' },
  { from: /transition: left \.4s cubic-bezier\(0\.4, 0, 0\.2, 1\)/g, to: 'transition: left var(--transition-layout)' }
];

replacements.forEach(r => {
  css = css.replace(r.from, r.to);
});

fs.writeFileSync(cssPath, css, 'utf8');
console.log('Refactoring complete.');
