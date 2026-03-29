# BrewMap Data Pipeline — SPEC

## Goal
Replace runtime Overpass API calls with pre-cached data in Cloudflare KV.
App loads instantly from cached data. Weekly GitHub Actions cron refreshes it.

## Architecture (modeled after MyStrainAI harvest-dispensary-menus.mjs)

### Scripts to Create

#### 1. `scripts/harvest-coffee-shops.mjs`
Main scraper — runs in GitHub Actions weekly.

**Flow per city:**
1. Query Overpass API for cafes/coffee shops (same query as current frontend)
2. Filter chains (Starbucks, Dunkin, etc.)
3. Extract OSM metadata: name, address, hours, website, phone, cuisine tags
4. Generate flavor estimates (same deterministic hash logic as frontend)
5. Write to Cloudflare KV

**Cities:** Start with 30 major US cities:
NYC, LA, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego,
Dallas, Austin, Seattle, Portland, Denver, Nashville, San Francisco,
Miami, Atlanta, Boston, Minneapolis, Detroit, Las Vegas, Charlotte,
New Orleans, Pittsburgh, Columbus, Indianapolis, Milwaukee, Salt Lake City,
Galveston, Honolulu

**Rate limiting:** 1-second delay between cities (Overpass rate limit)
**Timeout:** 60 minutes total in GitHub Actions

#### 2. `scripts/lib/kv-writer.mjs`
Adapted from MyStrainAI. Writes paginated data to Cloudflare KV.

**KV Structure:**
```
coffee:cities:index           → { cities: [...], lastUpdated, totalShops }
coffee:city:{slug}:meta       → { name, lat, lng, shopCount, lastUpdated }
coffee:city:{slug}:shops      → [ all shops with flavor data ]
```

**TTL:** 8 days (weekly harvest + 1 day buffer)

#### 3. `.github/workflows/harvest-coffee.yml`
```yaml
on:
  schedule:
    - cron: '0 11 * * 0'  # Sundays 4am PT (11:00 UTC)
  workflow_dispatch:        # Manual trigger
```

**Env vars needed (GitHub Secrets):**
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_KV_NAMESPACE_ID (create new namespace: "brewmap-cache")

#### 4. Cloudflare Worker (or Pages Function)
Simple API that reads from KV and returns JSON:
- `GET /api/cities` → cities index
- `GET /api/city/{slug}` → all shops for that city
- Frontend fetches from this instead of Overpass

#### 5. Frontend Changes (`index.html`)
- Replace `scanArea()` Overpass query with KV API fetch
- Keep city search (Nominatim geocoding) for finding cities
- When user searches a city → check if it's in our cached list → load from KV
- If city not cached → fall back to live Overpass query (existing behavior)
- "My Location" → reverse geocode → find nearest cached city → load from KV

### Data Schema (per shop in KV)
```json
{
  "id": 12345678,
  "name": "Stumptown Coffee Roasters",
  "lat": 45.5202,
  "lng": -122.6742,
  "address": "128 SW 3rd Ave, Portland, OR",
  "hours": "Mo-Fr 06:00-18:00; Sa-Su 07:00-17:00",
  "website": "https://stumptowncoffee.com",
  "phone": "+1-503-295-6144",
  "rating": 4.3,
  "reviewCount": 412,
  "flavorTags": [
    { "tag": "dark", "score": 79 },
    { "tag": "bold", "score": 74 }
  ],
  "flavorProfile": { "dark": 79, "bold": 74, "rich": 69 }
}
```

### Migration Path
1. Build scraper + KV writer + workflow (can test with `workflow_dispatch`)
2. Run initial harvest manually → verify data in KV
3. Create Worker/Pages Function API
4. Update frontend to use KV API with Overpass fallback
5. Enable weekly cron
6. Deploy

### Benefits
- **Instant load** — no more Overpass timeouts or 60s waits
- **Reliable** — cached data always available, no external API dependency at runtime
- **Scalable** — add new cities by adding to the config array
- **Consistent** — every user sees the same data (no per-request API variability)

### Reference Files (MyStrainAI)
- `~/Projects/mystrainai/scripts/harvest-dispensary-menus.mjs` — main scraper pattern
- `~/Projects/mystrainai/scripts/lib/kv-writer.mjs` — KV write logic
- `~/Projects/mystrainai/.github/workflows/harvest-dispensaries.yml` — cron config
