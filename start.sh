#!/bin/bash
cd /home/runner/workspace
GH=https://raw.githubusercontent.com/zarrarerror/excel_ai/main
curl -sf "$GH/addin/taskpane.html" -o addin/taskpane.html && echo "taskpane OK" || echo "taskpane FAILED"
curl -sf "$GH/admin/index.html" -o admin/index.html && echo "admin OK" || echo "admin FAILED"
curl -sf "$GH/reset-password.html" -o reset-password.html && echo "reset-password OK" || echo "reset-password FAILED"
node -e 'var fs=require("fs"),p=require("path");(function s(d){try{fs.readdirSync(d).forEach(function(f){var q=p.join(d,f);fs.statSync(q).isDirectory()?s(q):q.endsWith(".js")&&(function(){var b=fs.readFileSync(q),c=b.filter(function(x){return x!==0});c.length<b.length&&(fs.writeFileSync(q,Buffer.from(c)),console.