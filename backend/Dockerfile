FROM node:20-alpine AS dev

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

# Install dependencies
RUN npm ci

# Copy source code (for initial image; in docker-compose dev we still mount ./src)
COPY src ./src

# Start in watch mode (dev)
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM dev AS builder

# Copy source code
# (already copied in dev stage)

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --no-audit --no-fund

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/main"]
