FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Directory for session persistence
RUN mkdir -p auth_info_baileys

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
