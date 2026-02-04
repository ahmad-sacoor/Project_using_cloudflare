/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/whoami") {
			return handleWhoAmI(request, url);
		}

		if (request.method === "GET" && url.pathname === "/fetch") {
			return handleFetch(url);
		}

		return jsonError(
			"not_found",
			`No route for ${request.method} ${url.pathname}. Try /whoami or /fetch?url=https://example.com`,
			404
		);
	},
};

function handleWhoAmI(request: Request, url: URL): Response {
	const userAgent = request.headers.get("user-agent") ?? "unknown";
	const cf = (request as any).cf as { country?: string; colo?: string } | undefined;

	return jsonResponse({
		method: request.method,
		pathname: url.pathname,
		userAgent,
		country: cf?.country ?? null,
		colo: cf?.colo ?? null,
		ipNote:
			"Client IP is not guaranteed here. In production it may appear in trusted headers (e.g., CF-Connecting-IP), but local dev often won’t show it.",
	});
}

async function handleFetch(url: URL): Promise<Response> {
	const targetUrl = getValidatedHttpsUrl(url);
	if (!targetUrl) {
		return jsonError(
			"bad_request",
			'Missing/invalid "url". Example: /fetch?url=https://example.com',
			400
		);
	}

	const cache = caches.default;
	const cacheKey = new Request(targetUrl.toString(), { method: "GET" });

	const cached = await cache.match(cacheKey);
	if (cached) return withHeader(cached, "X-Cache", "HIT");

	const timed = await fetchWithTiming(targetUrl.toString());
	if (!timed.ok) {
		return jsonResponse(timed.errorBody, 502, { "X-Edge-Fetch-Ms": String(timed.elapsedMs) });
	}

	const body = await buildFetchSummary(
		targetUrl.toString(),
		timed.response,
		timed.elapsedMs
	);

	const resp = jsonResponse(body, 200, {
		"X-Edge-Fetch-Ms": String(timed.elapsedMs),
		"X-Cache": "MISS",
		"Cache-Control": "public, max-age=60",
	});

	await cache.put(cacheKey, resp.clone());
	return resp;
}

function getValidatedHttpsUrl(url: URL): URL | null {
	const target = url.searchParams.get("url");
	if (!target) return null;

	let targetUrl: URL;
	try {
		targetUrl = new URL(target);
	} catch {
		return null;
	}

	if (targetUrl.protocol !== "https:") return null;
	return targetUrl;
}

function withHeader(resp: Response, key: string, value: string): Response {
	const headers = new Headers(resp.headers);
	headers.set(key, value);
	return new Response(resp.body, { status: resp.status, headers });
}

async function fetchWithTiming(
	targetUrl: string
): Promise<
	| { ok: true; response: Response; elapsedMs: number }
	| { ok: false; elapsedMs: number; errorBody: any }
> {
	const start = Date.now();
	try {
		const response = await fetch(targetUrl);
		const elapsedMs = Date.now() - start;
		return { ok: true, response, elapsedMs };
	} catch (err) {
		const elapsedMs = Date.now() - start;
		return {
			ok: false,
			elapsedMs,
			errorBody: {
				targetUrl,
				status: null,
				elapsedMs,
				contentType: null,
				preview: null,
				error: "upstream_fetch_failed",
				message: err instanceof Error ? err.message : "Failed to fetch upstream URL.",
			},
		};
	}
}

async function buildFetchSummary(targetUrl: string, upstream: Response, elapsedMs: number) {
	const contentType = upstream.headers.get("content-type") ?? null;

	const previewable =
		typeof contentType === "string" &&
		(contentType.startsWith("text/") || contentType.includes("application/json"));

	let preview: string | null = null;
	if (previewable) {
		try {
			const text = await upstream.text();
			preview = text.slice(0, 300);
		} catch {
			preview = null;
		}
	}

	return {
		targetUrl,
		status: upstream.status,
		elapsedMs,
		contentType,
		preview,
	};
}

function jsonResponse(
	data: unknown,
	status = 200,
	extraHeaders: Record<string, string> = {}
): Response {
	const headers = new Headers({
		"Content-Type": "application/json; charset=utf-8",
		...extraHeaders,
	});
	return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function jsonError(code: string, message: string, status = 400): Response {
	return jsonResponse({ error: code, message }, status);
}
