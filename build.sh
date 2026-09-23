#!/bin/sh
set -e
cd "$(dirname "$0")"

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

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

if [ "$INSTALL" -eq 1 ]; then
  code --install-extension r-qol.vsix
fi
