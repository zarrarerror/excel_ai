#!/bin/bash
cd /home/runner/workspace/backend
npm install --silent

# Strip null bytes injected by Replit's git checkout (affects all .js files)
echo "Cleaning null bytes from JS files..."
for f in server.js routes/auth.js routes/chat.js routes/webhook.js lib/supabase.js; do
  if [ -f "$f" ]; then
    tr -d '\0' < "$f" > "${f}.clean" && mv "${f}.clean" "$f"
  fi
done

echo "Starting server..."
node server.js
