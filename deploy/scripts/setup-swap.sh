#!/usr/bin/env bash
set -euo pipefail

if swapon --show | grep -q '/swapfile'; then
  echo 'Swapfile already enabled'
  exit 0
fi

sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

if ! grep -q '^/swapfile ' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo '1GB swapfile enabled'
