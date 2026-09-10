# Fornect backend — standalone Fastify servis, deployan preko
# Dokploy odvojeno od Angular admin-web frontenda.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts

# Ne pokreći kao root u produkciji — node:22-alpine već ima 'node'
# korisnika (uid 1000) spreman za ovo, bez dodatnog podešavanja.
USER node

EXPOSE 3000

# Migracije se primjenjuju pri svakom startu kontejnera — skripta je
# idempotentna (schema_migrations tabela pamti šta je već primijenjeno),
# pa je ovo sigurno i pri restartu bez novih migracija.
# ";" a ne "&&" — ako migracija ipak konacno ne uspije (ne samo
# prolazna DNS/mrezna greska na startu, koju waitForDatabase u
# migrate.js vec pokriva), server i dalje treba da se digne umjesto
# da cijeli API padne zbog jedne neuspjele migracije.
CMD ["sh", "-c", "node scripts/migrate.js; node dist/server.js"]
