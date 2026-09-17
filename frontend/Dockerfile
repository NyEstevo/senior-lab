# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# ---------- dev ----------
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------- build ----------
FROM base AS build
# Vazio por padrão: o bundle passa a chamar /api/... no mesmo host que serve o site.
# Em nuvem, o Load Balancer roteia /api/* para o backend, então não existe host separado.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm install
COPY . .
RUN npm run build

# ---------- prod ----------
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# Sem USER não-root: a imagem oficial do nginx precisa de root no master para criar
# /var/cache/nginx e escrever o PID. Os workers já baixam privilégio para o usuário
# "nginx" sozinhos. Para rodar 100% sem root, a alternativa é a imagem
# nginxinc/nginx-unprivileged (escuta na 8080, exige ajuste de NSG/LB no Terraform).
EXPOSE 80
