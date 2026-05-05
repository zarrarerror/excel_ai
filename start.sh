#!/bin/bash
cd /home/runner/workspace/backend
npm install --silent

echo "Cleaning null bytes from JS files..."
for f in server.js routes/auth.js routes/chat.js routes/webhook.js routes/admin.js lib/supabase.js; do
  if [ -f "$f" ]; then
    python3 -c "
import sys
data = open('$f','rb').read()
cleaned = data.replace(b'\x00',b'')
open('$f','wb').write(cleaned)
print('$f: removed',len(data)-len(cleaned),'null bytes')
"
  fi
done

echo "Starting server..."
node server.js
