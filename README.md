# Edge Proxy on Cloudflare Workers

This project is a small edge-based HTTP proxy built using Cloudflare Workers. It demonstrates how request handling, caching, rate limiting, and basic security checks can be implemented at the network edge.

The goal of this project is to understand how Cloudflare Workers execute code close to users and how edge caching improves performance and reduces origin load.

---

## Live deployment

- **UI:** `https://edge-proxy.ahmad-edge-proxy.workers.dev/ui`
- **Worker base URL:** `https://edge-proxy.ahmad-edge-proxy.workers.dev`
- **workers.dev subdomain:** `https://ahmad-edge-proxy.workers.dev` (requires my login info)

Cloudflare dashboard subdomain settings:

- `https://dash.cloudflare.com/ef70462f973133795a5e6a30098b6b9b/workers/subdomain`

Deployment info:

- **Project:** `edge-proxy`

> Note: After creating/updating a `workers.dev` subdomain, Cloudflare may take a few minutes for DNS records to update.

---

## What this project does

The Worker exposes a small HTTP API that runs globally on Cloudflare’s edge network. It allows you to:

- Inspect incoming requests
- Fetch external HTTPS resources through the edge
- Cache responses at the edge
- Apply rate limiting
- Block unsafe targets (basic SSRF protection)

All responses are returned as JSON. A minimal browser UI is included to make testing easier.

---

## How it works

1. A request is sent to the Worker’s public `workers.dev` URL.
2. Cloudflare routes the request to the nearest data center.
3. The Worker code runs at the edge and:
   - parses the request URL and headers
   - validates input parameters
   - blocks unsafe targets (localhost / private networks)
   - checks the Cloudflare edge cache
4. If a cached response exists, it is returned immediately.
5. If not cached, the Worker fetches the target URL, measures latency, caches the response, and returns a JSON summary.

Caching happens per Cloudflare edge location, meaning users in the same region benefit from shared cache hits.

---

## Endpoints

### GET /

Returns a simple JSON message confirming the Worker is running and listing available endpoints.

---

### GET /whoami

Returns information about the incoming request.

Example response:

    {
      "method": "GET",
      "pathname": "/whoami",
      "userAgent": "curl/8.0.0",
      "country": "PT",
      "colo": "LIS"
    }

---

### GET /fetch?url=https://example.com

Fetches an external HTTPS URL through the Worker.

Behavior:

- Validates that the url query parameter exists
- Only allows https:// URLs (not http)
- Blocks localhost and private network targets (basic SSRF protection)
- Measures fetch latency
- Caches successful responses at the edge for 60 seconds

Example response:

    {
      "targetUrl": "https://example.com",
      "status": 200,
      "elapsedMs": 42,
      "contentType": "text/html",
      "preview": "<!doctype html><html>..."
    }

Response headers include:

- X-Cache: HIT | MISS
- X-Edge-Fetch-Ms: <latency>
- Retry-After (when rate limited)

---

## Rate limiting

The /fetch endpoint is rate-limited to 20 requests per minute per client identifier.

This is implemented using in-memory state and is intended as a demonstration only.In a production system, Durable Objects or KV would be used to share state across edge instances.

---

## Security considerations

- Only HTTPS URLs are allowed
- Requests to localhost and private network ranges are blocked
- Input validation is applied to all user-provided URLs
- Rate limiting prevents abuse of the fetch endpoint

---

## Testing the project

### Option 1: Browser UI

Open the following URL in your browser:

    https://edge-proxy.ahmad-edge-proxy.workers.dev/ui

From the UI you can:

- Call /whoami
- Fetch external URLs
- Observe cache HIT/MISS behavior
- Trigger rate limiting by repeatedly calling /fetch

---

### Option 2: Using curl

Call /whoami:

    curl https://edge-proxy.ahmad-edge-proxy.workers.dev/whoami

Call /fetch:

    curl -i "https://edge-proxy.ahmad-edge-proxy.workers.dev/fetch?url=https://example.com"

Run the same command twice to observe:

- First request → X-Cache: MISS
- Second request → X-Cache: HIT (from the same region)

---

## Local development

Install dependencies and start the local dev server:

    npm install
    npx wrangler dev

The Worker will be available at:

    http://127.0.0.1:8787

---

## What this project demonstrates

- Cloudflare Workers edge runtime
- Request routing and validation
- Edge caching behavior
- Latency measurement
- Rate limiting
- Basic SSRF protection
- Differences between local development and deployed edge behavior
