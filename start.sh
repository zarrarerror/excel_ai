#!/bin/bash
cd /home/runner/workspace/backend
npm install --silent

echo "Cleaning null bytes from JS files..."
node -e "
var fs=require('fs');
['server.js','routes/auth.js','routes/chat.js','routes/webhook.js','routes/admin.js','lib/supabase.js'].forEach(function(f){
  try{var b=fs.readFileSync(f);var c=Buffer.from(b.filter(function(x){return x!==0;}));if(c.length!==b.length){fs.writeFileSync(f,c);console.log(f+': removed '+(b.length-c.length)+' null bytes');}}catch(e){}
});
"

echo "Starting server..."
node server.js
