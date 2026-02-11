#!/bin/bash
set -e
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
sed -i '' -e "s|local/hubot-chat-web:[0-9]*\.[0-9]*\.[0-9]*|local/hubot-chat-web:$VERSION|g" charts/web/deployment.yaml
docker build -t local/hubot-chat-web:$VERSION .
k3d image import local/hubot-chat-web:$VERSION -c ${KUBE_CLUSTER:-local}