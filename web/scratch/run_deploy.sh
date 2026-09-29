#!/bin/bash
set -e
echo "Starting deployment..."
cd /home/ubuntu/building-task-manager/web
sudo docker run --rm --env-file /home/ubuntu/inspecthero-web.env -v /home/ubuntu/building-task-manager/web:/app -w /app node:20-alpine sh -c 'NODE_ENV=development npm install --legacy-peer-deps && NODE_OPTIONS="--max-old-space-size=2048" npm run build'
sudo docker build -t inspecthero-web:latest .
sudo docker stop inspecthero-web || true
sudo docker rm inspecthero-web || true
sudo docker run -d --name inspecthero-web --restart unless-stopped --add-host=host.docker.internal:host-gateway -p 3005:3005 -v /home/ubuntu/private_reports:/app/private_reports -v /home/ubuntu/private_tiles:/app/private_tiles --env-file /home/ubuntu/inspecthero-web.env inspecthero-web:latest
echo "Deploy finished, patching keys..."
bash /home/ubuntu/replace.sh
echo "All done!"
