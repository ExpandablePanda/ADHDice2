> Archived on 2026-08-03.
>
> This material is historical and unverified.
> Source configuration may still exist.
> Public Pages variables, Edge deployment, and user-facing activation were not verified.
> Do not follow it as current deployment authority without a fresh source and deployment review.
> Current README entry point remains at [README.md](../../../README.md).
>
## Google destination and traffic setup (manual; not yet complete)

ADHDice 6.29.0 adds configuration and secure routing foundations only. The user-facing Places, location, traffic, refresh, and Maps controls remain deferred to 6.29.1.

### Google Cloud

1. Create or select a billing-enabled Google Cloud project.
2. Enable Maps JavaScript API, Places API (New), and Routes API.
3. Create a browser key restricted to the production GitHub Pages origin and explicit local development origins (for example `http://localhost:3000/*` and `http://127.0.0.1:3000/*`). Restrict its APIs to Maps JavaScript API and Places API (New).
4. Create a separate server key restricted to Routes API only. Do not place this key in browser, GitHub Pages, or `NEXT_PUBLIC_*` configuration.
5. Configure conservative Routes API quotas, a billing budget, and billing alerts. Durable per-user server-side rate limiting is deferred; the approved boundary is authenticated requests, strict validation, client throttling/signature suppression/caching, and Google Cloud quotas.

### GitHub Pages

1. Add the browser key as a GitHub Actions build secret.
2. Expose only that browser key to the existing static Pages build as `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=true` and `NEXT_PUBLIC_APP_ORIGIN` to the exact production Pages origin during the build.
4. Never add `GOOGLE_MAPS_ROUTES_API_KEY` to the static build or any `NEXT_PUBLIC_*` variable.

### Supabase Edge Function

Set these server-only Supabase secrets, then manually deploy `on-time-route` when ready:

```text
GOOGLE_MAPS_ROUTES_API_KEY=server-key-restricted-to-routes-api
GOOGLE_MAPS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-production-pages-origin
```

`GOOGLE_MAPS_ALLOWED_ORIGINS` is an exact comma-separated allowlist. Add every explicit development origin actually used and the configured production origin; wildcards are not accepted. No SQL migration is required for 6.29.0 because the On-Time plan remains stored in the existing JSONB column.

### Location privacy

In 6.29.1, coordinates will be acquired only after the user presses `Use current location` and sent to the authenticated Edge Function for route calculation. ADHDice will not persist or sync those coordinates in Supabase, planner JSON, local storage, analytics, or logs. Traffic results, route distance, polylines, and device freshness state also remain device-only and unsynced.
