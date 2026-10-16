# Aurore R2 gateway

Worker source for the private `aurore-memories` R2 bucket. It stores files under normalized prefixes:

- `memories/<Aurore-ID-user-uuid>/<uuid>-<filename>`
- `profiles/<Aurore-ID-user-uuid>/<uuid>-<filename>`

The similarly named folders currently visible in R2 are not relied on; existing objects are not moved or deleted.

## Required Cloudflare configuration

1. Set the Worker build/root directory to `workers/aurore-r2-gateway` when connecting this directory to Cloudflare Workers Builds.
2. Bind the existing private R2 bucket `aurore-memories` to the variable `AURORE_R2`.
3. Add the Worker variable `AURORE_ID_SUPABASE_PUBLISHABLE_KEY` with the publishable key from Supabase project `woyzakzpqtzwjiyysuum`.
4. Add the Worker secret `AURORE_ID_SUPABASE_SERVICE_ROLE_KEY` with the service-role/secret key from that same project. Never place this key in GitHub, the browser, or `wrangler.toml`.
5. Update `ALLOWED_ORIGINS` to include the exact production origins for Aurore Mémoire and the future Aurore Profil/Talents site.
6. Deploy only after Aurore ID has a working authenticated session flow. The current Aurore ID landing page documents that central login/SSO is not yet active.

## API

- `GET /health`: non-sensitive health check.
- `POST /api/r2/upload`: authenticated multipart form with `service=memories|profiles` and `file=<File>`.
- `GET /api/r2/objects/<uuid>`: downloads an owner's file; profile files are public only when that user's profile is public.
- `DELETE /api/r2/objects/<uuid>`: deletes an owner's file.

Memory files: images, audio, PDF; maximum 25 MiB. Profile files: JPEG, PNG, WebP, AVIF; maximum 8 MiB. SVG and executable formats are rejected.

## Important

R2 remains private. The Worker validates bearer tokens against Aurore ID and accesses object metadata using its server-only service key. Do not expose the service key to frontend code. The existing Aurore Mémoire application still stores study cards locally; this gateway handles file objects only and does not claim to synchronize cards or revision statistics.
