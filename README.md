# MuskySocials — clean rebuild

The previous website front end has been cleared from this branch. This is a blank starting point for the new website.

## Preserved backend connection

- Existing Supabase project URL and publishable key are retained in `api.js`.
- `app.js` imports the shared client and checks the current authentication session.
- No database tables, user accounts, storage buckets, authentication settings, or backend data are deleted by this front-end reset.

## New front end

Build the replacement interface from scratch in `index.html`, `app.css`, and `app.js`.

The Supabase publishable key is intended for browser use with Row Level Security enabled. Never add a service-role key to client-side files.