# Magic Hour

Magic Hour is published from this repository with **GitHub Pages**. The production website and public shipment tracking pages use the GitHub Pages origin:

- Website: https://muskysocial.github.io/MuskyP2V-AI-Studio/
- Public shipment link: https://muskysocial.github.io/MuskyP2V-AI-Studio/?shipment=<tracking-slug>
- Source repository: https://github.com/muskysocial/MuskyP2V-AI-Studio

## Hosting and deployment

- Static website, assets, PWA shell, and public tracking entry page: GitHub Pages.
- Frontend deployments: `.github/workflows/pages.yml` runs on every push to `main`.
- Supabase Edge Function deployments: `.github/workflows/deploy-supabase-functions.yml` deploys the tracked functions from this repository.
- Database, authentication, private file storage, realtime data, and Edge Function runtime: the existing Supabase project `uhlxjbnzjxmvepqqiblb`.
- Payments are processed by Paystack through the `paystack-membership` Supabase Edge Function.
- No Vercel API routes or Vercel-only server runtime are part of this repository's hosting architecture.

GitHub Pages is a static host. It does not run Node.js server routes or host a database. Supabase remains the backend service so existing accounts, shipment records, uploads, payments, and Edge Functions continue to work.

## GitHub Actions setup

The Pages workflow is automatic after GitHub Pages is enabled for this repository with GitHub Actions as the deployment source.

To enable automatic Edge Function releases, add this repository Actions secret:

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token with permission to deploy Edge Functions to project `uhlxjbnzjxmvepqqiblb`.

The project reference and each function's JWT verification setting are versioned in `supabase/config.toml`. Existing Supabase runtime secrets (for example Paystack and AI provider credentials) remain configured in Supabase and are not copied into GitHub.

## Supabase Edge Functions

All active project Edge Function source is versioned under `supabase/functions/`. The GitHub deployment workflow deploys the complete tracked set when function source or configuration changes on `main`.

## Shipment tracking

Shipment records, passwords, conversations, events, and push subscriptions remain in Supabase. Public tracking links use the GitHub Pages website and the `shipment` query parameter. The public tracking page calls the `shipment-public` and `shipment-push` Edge Functions.

The local shipment engine is in `tracking-engine.js`; run its tests with:

```bash
node --test tracking-engine.test.js
```

The tracking engine produces planned route estimates and scheduled progress. It does not claim to provide carrier-confirmed scans or live GPS unless a verified carrier/GPS integration is connected.

## Local validation

```bash
node --check app.js
node --check api.js
node --check tracking-engine.js
node --test tracking-engine.test.js
```
