FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005
COPY .next/standalone ./
COPY .next/static ./.next/static
EXPOSE 3005
CMD ["node", "server.js"]
