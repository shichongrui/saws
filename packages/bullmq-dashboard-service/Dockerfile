FROM node:26-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY dist ./dist

CMD ["node", "dist/run-dashboard.js"]
