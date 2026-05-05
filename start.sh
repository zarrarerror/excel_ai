#!/bin/bash
cd /home/runner/workspace/backend
tr -d "\0" < server.js > /tmp/sv.js && cp /tmp/sv.js server.js
node server.js
