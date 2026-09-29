#!/bin/bash
set -e
cd /home/ubuntu/building-task-manager/web

echo "Building Next.js standalone..."
sudo docker run --rm --env-file /home/ubuntu/inspecthero-web.env -v /home/ubuntu/building-task-manager/web:/app -w /app node:20-alpine sh -c 'NODE_ENV=development npm install --legacy-peer-deps && NODE_OPTIONS="--max-old-space-size=2048" npm run build'

echo "Building Docker image..."
sudo docker build -t inspecthero-web:latest -f Dockerfile .

echo "Loading and running container..."
sudo docker stop inspecthero-web || true
sudo docker rm inspecthero-web || true
sudo docker run -d --name inspecthero-web --restart unless-stopped -p 3005:3005 -v /home/ubuntu/private_reports:/app/private_reports -v /home/ubuntu/private_tiles:/app/private_tiles --env-file /home/ubuntu/inspecthero-web.env inspecthero-web:latest

echo "Patching keys..."
bash /home/ubuntu/replace.sh
echo "Deploy completed successfully!"
