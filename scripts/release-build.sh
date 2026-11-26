#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
archive="todo-cli-$version.tgz"

npm ci
npm run build
npm test
mkdir -p dist
npm pack --pack-destination dist

cd dist
if command -v sha256sum >/dev/null 2>&1; then
    digest=$(sha256sum < "$archive")
else
    digest=$(shasum -a 256 < "$archive")
fi
printf '%s  %s\n' "${digest%% *}" "$archive" > SHA256SUMS
cat SHA256SUMS
