# Magic Hour

Magic Hour is published from this repository with GitHub Pages.

- Intended website URL after the repository is renamed to `magic-hour`: https://muskysocial.github.io/magic-hour/
- Public shipment tracking: https://muskysocial.github.io/magic-hour/?shipment=<tracking-slug>
- Intended source repository after rename: https://github.com/muskysocial/magic-hour

## Hosting and deployment

- Static website, assets, PWA shell, and public shipment tracking entry: GitHub Pages.
- Frontend deployments: `.github/workflows/pages.yml` runs on pushes to `main`.
- Supabase Edge Function deployment: `.github/workflows/deploy-supabase-functions.yml` deploys tracked functions from this repository.
- Authentication, database, private storage, realtime, and Edge Function runtime: the existing Supabase project `uhlxjbnzjxmvepqqiblb`.
- Payments: Paystack through the `paystack-membership` Supabase Edge Function.

GitHub Pages is a static host. It does not run Node.js server routes or host a database. Supabase remains the backend so existing accounts, shipment records, uploads, payments, and Edge Functions continue to work.

## Required one-time GitHub setup

1. Rename this repository to `magic-hour` in GitHub: **Settings → General → Repository name → Rename**.
2. Confirm GitHub Pages is enabled with **Deploy from a branch / GitHub Actions** (the repository workflow uses GitHub Actions).
3. Add a repository Actions secret named `SUPABASE_ACCESS_TOKEN`:
   - Open Supabase account settings at https://supabase.com/dashboard/account/tokens.
   - Create a personal access token labelled `Magic Hour GitHub Actions`.
   - Copy it once; do not put it in source code or share it in chat.
   - In GitHub open **Settings → Secrets and variables → Actions → New repository secret**.
   - Set the name to `SUPABASE_ACCESS_TOKEN` and paste the token as the value.
   - Open **Actions → Deploy Supabase Edge Functions → Run workflow**, choose `main`, and run it.
4. In Supabase **Authentication → URL Configuration**, set Site URL to `https://muskysocial.github.io/magic-hour/` and add that exact URL to the Redirect URLs allowlist.
5. In Supabase **Authentication → Email Templates**, copy the repository templates from `supabase/templates/` into Confirm signup, Magic link, and Reset password. Set the SMTP sender display name to `Magic Hour` in **Authentication → SMTP Settings** (if custom SMTP is configured).

The Supabase account personal access token is for GitHub Actions deployment. It is not the Supabase anon/publishable key or service-role key. Existing runtime secrets (Paystack and AI provider credentials) remain configured in Supabase and must not be committed to GitHub.

## Supabase Edge Functions

All 14 active project Edge Function source files are versioned under `supabase/functions/`. The GitHub deployment workflow deploys the complete tracked set when function source or configuration changes on `main`. CORS is currently configured to allow all origins (`*`) in the tracked function sources; this includes the GitHub Pages origin.

## Payments

The Paystack initialization function sets the callback URL to `https://muskysocial.github.io/magic-hour/?payment=complete` and includes Magic Hour application metadata. Before a live payment test, verify the Supabase `PAYSTACK_SECRET_KEY` is the intended test key and use a Paystack test transaction.

## Shipment tracking

All three saved shipment tracking links in the database have been updated to the new intended GitHub Pages URL. Shipment records, passwords, conversations, events, and push subscriptions remain in Supabase. The public tracking page calls the `shipment-public` and `shipment-push` Edge Functions.

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
