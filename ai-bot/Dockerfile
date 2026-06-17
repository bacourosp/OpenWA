FROM node:22-alpine

# git + build tools sometimes needed by npx-installed MCP servers
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
