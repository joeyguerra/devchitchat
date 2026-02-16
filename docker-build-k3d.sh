#!/bin/bash
set -e
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
sed -i '' -e "s|local/devchitchat-web:[0-9]*\.[0-9]*\.[0-9]*|local/devchitchat-web:$VERSION|g" charts/web/deployment.yaml
docker build -t local/devchitchat-web:$VERSION .
k3d image import local/devchitchat-web:$VERSION -c ${KUBE_CLUSTER:-local}