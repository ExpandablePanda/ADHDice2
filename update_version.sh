#!/bin/bash
sed -i '' "s/v\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/v.$1/" "src/components/task-app.tsx"
echo "Version updated to v.$1"
