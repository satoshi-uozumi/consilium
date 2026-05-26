# Reference Dockerfile — build context must be the consilium repo root:
#   docker build -f examples/Dockerfile .
FROM node:20-alpine
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY packages/ ./packages/

RUN npm install
RUN npm run build