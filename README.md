# MuskySocials

MuskySocials is being rebuilt as a mobile-first social community for Android and iPhone.

## New application entry point

- `index.html` — clean app entry point and authentication mount.
- `app.css` — responsive full-screen mobile interface.
- `app.js` — Supabase sign-in, profile loading, Home feed, and the five primary navigation destinations.

## Primary navigation

1. Profile
2. Post
3. Message
4. Market
5. Trade

Home is the default landing screen. Marketplace is a separate destination and is not embedded in Home. Additional services belong in the More menu.

## Backend

The current Supabase project URL and publishable key are retained in the client. No service-role key is used in the browser. Existing tables and RLS policies must be audited before connecting member publishing, private messaging, marketplace, and trade operations.

## Rebuild status

This is an in-progress rebuild foundation. The legacy front-end modules are retained temporarily as reference material while their working features and backend dependencies are migrated. They are not loaded by the new `index.html`.

Do not treat this branch as production-ready until feature connections, access policies, mobile device checks, and deployment checks have passed.
