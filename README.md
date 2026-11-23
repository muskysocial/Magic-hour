# Magic Hour AI Studio — clean rebuild

The previous website front end has been cleared from this branch. This is a blank starting point for the new website.

## Preserved backend connection

- Existing Supabase project URL and publishable key are retained in `api.js`.
- `app.js` imports the shared client and checks the current authentication session.
- No database tables, user accounts, storage buckets, authentication settings, or backend data are deleted by this front-end reset.

## New front end

Build the replacement interface from scratch in `index.html`, `app.css`, and `app.js`.

The Supabase publishable key is intended for browser use with Row Level Security enabled. Never add a service-role key to client-side files.

## Hybrid shipment tracking engine

The Shipment Journey workspace uses a bundled local reference directory for major airports, cities, airlines, carriers and aircraft models. Route geometry, estimated distance, checkpoint ETAs and animated movement are calculated locally in `tracking-engine.js`; shipment route creation and progress do not call a carrier tracking API or external route/geocoding API.

- Road, air and sea journeys use a locally calculated route corridor and scheduled movement profile.
- Senders can manage checkpoints, pauses, route obstructions and delivery timing from the shipment workspace.
- Flight metadata includes flight number, aircraft model, registration and origin/destination airport codes.
- Logistics carriers include GIG Logistics, FedEx, DHL, UPS, Aramex and other supported services.
- A carrier tracking number can be stored as a reference. Carrier-confirmed data is not fetched automatically; sender-entered updates remain marked as manual until a real carrier connection is implemented.
- Public tracking pages show a simulated/planned route and ETA, not live aircraft surveillance, verified vehicle GPS or carrier scan events.
- Map imagery still loads from public map tile providers; the movement and route calculation engine itself is local and API-independent.

Run the local engine tests with `node --test tracking-engine.test.js`.
