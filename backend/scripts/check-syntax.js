const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.npm-cache', '.git'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); count++; }
    else if (file.endsWith('.html')) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=|application\/ld\+json/i.test(match[1]) || !match[2].trim()) continue;
        new vm.Script(match[2], { filename: file }); count++;
      }
    }
  }
}
walk(root);
console.log('Syntax checked ' + count + ' JavaScript files and inline scripts.');
