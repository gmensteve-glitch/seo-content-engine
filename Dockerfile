# Production image for the SEO Content Engine (Next.js 16 + Prisma 6).
# A plain Dockerfile build is host-agnostic (Railway / Render / Fly / any) and
# avoids platform-specific builders.

FROM node:20-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching. `postinstall` runs
# `prisma generate`, so the schema must be present at install time.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Build. A dummy DATABASE_URL keeps `next build` from tripping on datasource
# resolution; the real value is injected at runtime by the host.
COPY . .
RUN npx prisma generate \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
