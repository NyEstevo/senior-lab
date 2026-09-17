# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# ---------- dev ----------
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build (compila TS) ----------
FROM base AS build
RUN npm install
COPY . .
RUN npm run build

# ---------- prod ----------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
