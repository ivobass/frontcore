# Deploy no Coolify — FrontCore / FrontRest IA

> Referência preparatória. A configuração final do Coolify é detalhada na
> Fase 10. Este documento garante que a Fase 1 já está **preparada** para
> Coolify e Cloudflare, sem depender de IP público direto.

## Topologia

```
Utilizador ──HTTPS──> Cloudflare ──HTTPS──> Servidor (80/443) ──> Traefik (Coolify) ──> web / api
                                                                          │
                                              rede interna Docker: postgres / redis / minio
```

- Apenas `web` e `api` são expostos por domínio (Traefik + Let's Encrypt).
- `postgres`, `redis`, `minio` permanecem **só** na rede interna.
- Consola MinIO (9001) **nunca** é exposta publicamente.

## DNS (Cloudflare)

| Subdomínio          | Destino interno | Proxy Cloudflare        |
|---------------------|-----------------|-------------------------|
| `app.dominio.pt`    | web:3000        | **Proxied** (laranja)   |
| `api.dominio.pt`    | api:3001        | **Proxied** (laranja)   |
| `s3.dominio.pt`     | minio:9000      | **DNS only** (decisão Fase 5) |

- SSL no Cloudflare: **Full (strict)** (Traefik provisiona cert válido na origem).

## Variáveis de ambiente em produção

Definir no Coolify (não no `.env` versionado):

```
NODE_ENV=production
TRUST_PROXY_HOPS=2
CORS_ORIGINS=https://app.dominio.pt
NEXT_PUBLIC_API_URL=https://api.dominio.pt/api
APP_URL=https://app.dominio.pt
API_URL=https://api.dominio.pt
COOKIE_DOMAIN=.dominio.pt
COOKIE_SECURE=true
# Segredos: POSTGRES_*, MINIO_*, JWT_*, ANTHROPIC_API_KEY (geridos pelo Coolify)
```

## Escala — connection pooling

Cada container abre o seu pool ao Postgres. Em local limitamos com
`connection_limit=10`. **Antes de escalar horizontalmente** (várias réplicas de
api/workers), introduzir **PgBouncer** em modo *transaction* entre a aplicação e
o Postgres, sob pena de esgotar o teto de conexões (~100 por defeito).

## Migrações em produção

Correr `prisma migrate deploy` (não `dev`) como passo de release:

```
pnpm db:deploy
```
