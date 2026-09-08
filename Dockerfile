# Frontend (Angular admin-web) — standalone nginx-servirana statička
# slika, deployana preko Dokploy odvojeno od backend servisa
# (server/Dockerfile). Vidi deploy/README.md za deploy pristupe.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist/fornect-admin-web/browser /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template

# Podrazumijevane vrijednosti za lokalno isprobavanje van Dokploy-a —
# u Dokploy-u se BACKEND_HOST/BACKEND_PORT postavljaju na stvarno ime
# i port backend servisa.
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=3000

EXPOSE 80
