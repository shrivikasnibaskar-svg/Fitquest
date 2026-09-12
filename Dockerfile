FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Data (the SQLite file) should be mounted to persist across container restarts
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/fitquest.db

CMD ["node", "server.js"]
