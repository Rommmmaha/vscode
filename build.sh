#!/bin/sh
set -e
cd "$(dirname "$0")"

bunx tsc

rm -rf staging
mkdir -p staging/extension
cp package.json colors.json icon.png icon.svg staging/extension/
cp -r out staging/extension/
cp "[Content_Types].xml" extension.vsixmanifest staging/

rm -f qol.vsix
cd staging && zip -r ../qol.vsix . && cd ..
rm -rf staging

echo "Built qol.vsix ($(du -h qol.vsix | cut -f1))"
