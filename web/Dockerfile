FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache poppler-utils imagemagick tesseract-ocr tesseract-ocr-data-deu tesseract-ocr-data-eng

ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME="0.0.0.0"

COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public
COPY scripts ./scripts

EXPOSE 3005
CMD ["node", "server.js"]
