FROM node:20-alpine AS dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Patch CRA dev-server websocket protocol for HTTPS reverse proxy.
# CRA exposes WDS_SOCKET_HOST/PORT/PATH, but not protocol; behind TLS-terminating nginx
# the client must use wss:// to avoid Mixed Content errors.
RUN node -e "\
const fs=require('fs');\
const p='/app/node_modules/react-scripts/config/webpackDevServer.config.js';\
let s=fs.readFileSync(p,'utf8');\
if(s.includes('WDS_SOCKET_PROTOCOL')){console.log('webpackDevServer.config.js already patched');process.exit(0);}\
s=s.replace(\
  \"const sockPort = process.env.WDS_SOCKET_PORT;\",\
  \"const sockPort = process.env.WDS_SOCKET_PORT;\\nconst sockProtocol = process.env.WDS_SOCKET_PROTOCOL;\"\
);\
const needle=\"port: sockPort,\";\
if(!s.includes(needle)) throw new Error('Expected webSocketURL port line not found');\
s=s.replace(needle, needle+\"\\n        ...(sockProtocol ? { protocol: sockProtocol } : {}),\");\
fs.writeFileSync(p,s,'utf8');\
console.log('Patched',p);\
"

# Copy source code (for initial image; in docker-compose dev we still mount ./src)
COPY public ./public
COPY src ./src
COPY tsconfig.json ./tsconfig.json

# React dev server
EXPOSE 3000
CMD ["npm", "run", "start"]

FROM dev AS builder

# Copy rest of files needed for production build
COPY . .

# Build-time config for CRA (used by `npm run build`)
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_WS_URL=${REACT_APP_WS_URL}

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
