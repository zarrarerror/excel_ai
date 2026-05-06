#!/bin/bash
cd /home/runner/workspace
GH=https://raw.githubusercontent.com/zarrarerror/excel_ai/main
curl -sf "$GH/addin/taskpane.html" -o addin/taskpane.html && echo "taskpane OK" || echo "taskpane FAILED"
curl -sf "$GH/admin/index.html" -o admin/index.html && echo "admin OK" || echo "admin FAILED"
curl -sf "$GH/reset-password.html" -o reset-password.html && echo "reset-password OK" || echo "reset-password FAILED"
mkdir -p public && for f in pricing terms privacy refund; do curl -sf "$GH/public/$f.html" -o "public/$f.html" && echo "$f OK"; done
find backend -name "*.js" -type f -not -path "*/node_modules/*" | while IFS= read -r f; do tr -d '\000' <"$f" >"$f.x" && mv "$f.x" "$f" && echo "$f cleaned"; done
cd backend && npm 