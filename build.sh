#!/bin/sh
set -e
cd "$(dirname "$0")"

bunx tsc

rm -rf staging
mkdir -p staging/extension
cp package.json colors.json icon.png icon.svg staging/extension/
cp -r out staging/extension/
cp "[Content_Types].xml" extension.vsixmanifest staging/

rm -f r-qol.vsix
cd staging && zip -r ../r-qol.vsix . && cd ..
rm -rf staging

echo "Built r-qol.vsix ($(du -h r-qol.vsix | cut -f1))"
