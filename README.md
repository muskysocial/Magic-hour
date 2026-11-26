# Magic Hour

Magic Hour is published from this repository with GitHub Pages.

- Website: https://muskysocial.github.io/magic-hour/
- Public shipment tracking: https://muskysocial.github.io/magic-hour/?shipment=<tracking-slug>
- Source repository: https://github.com/muskysocial/magic-hour

## Hosting and deployment

- Static website, assets, PWA shell, and public shipment tracking entry: GitHub Pages.
- Frontend deployments: `.github/workflows/pages.yml` runs on pushes to `main`.
- Supabase Edge Function deployment: `.github/workflows/deploy-supabase-functions.yml` deploys tracked functions from this repository.
- Authentication, database, private storage, realtime, and Edge Function runtime: the existing Supabase project `uhlxjbnzjxmvepqqiblb`.
- Payments: Paystack through the `paystack-membership` Supabase Edge Function.

GitHub Pages is a static host. It does not run Node.js server routes or host a database. Supabase remains the backend so existing accounts, shipment records, uploads, payments, and Edge Functions continue to work.

## GitHub Actions setup

To enable automatic Edge Function releases, add this repository Actions secret:

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token with permission to deploy Edge Functions to project `uhlxjbnzjxmvepqqiblb`.

The project reference and each function's JWT verification setting are versioned in `supabase/config.toml`. Runtime secrets (including Paystack and AI provider credentials) remain configured in Supabase and must not be committed to GitHub.

## Shipment tracking

Shipment records, passwords, conversations, events, and push subscriptions remain in Supabase. Public tracking links use the Magic Hour Pages website and the `shipment` query parameter. The public tracking page calls the `shipment-public` and `shipment-push` Edge Functions.

The local shipment engine is in `tracking-engine.js`; run its tests with:

```bash
node --test tracking-engine.test.js
```

## Local validation

```bash
node --check app.js
node --check api.js
node --check tracking-engine.js
node --test tracking-engine.test.js
```
