FROM node:20-alpine
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY packages/ ./packages/
COPY specialists/ ./specialists/

RUN npm install
RUN npm run build
