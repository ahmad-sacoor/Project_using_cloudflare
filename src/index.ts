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
	const target = url.searchParams.get("url");
	if (!target) {
		return jsonError(
			"bad_request",
			'Missing query param "url". Example: /fetch?url=https://example.com',
			400
		);
	}

	let targetUrl: URL;
	try {
		targetUrl = new URL(target);
	} catch {
		return jsonError("bad_request", "Invalid URL provided.", 400);
	}

	if (targetUrl.protocol !== "https:") {
		return jsonError("bad_request", "Only https URLs are allowed.", 400);
	}

	const start = Date.now();

	let upstream: Response;
	try {
		upstream = await fetch(targetUrl.toString());
	} catch (err) {
		const elapsedMs = Date.now() - start;
		return jsonResponse(
			{
				targetUrl: targetUrl.toString(),
				status: null,
				elapsedMs,
				contentType: null,
				preview: null,
				error: "upstream_fetch_failed",
				message: err instanceof Error ? err.message : "Failed to fetch upstream URL.",
			},
			502,
			{ "X-Edge-Fetch-Ms": String(elapsedMs) }
		);
	}

	const elapsedMs = Date.now() - start;
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

	return jsonResponse(
		{
			targetUrl: targetUrl.toString(),
			status: upstream.status,
			elapsedMs,
			contentType,
			preview,
		},
		200,
		{ "X-Edge-Fetch-Ms": String(elapsedMs) }
	);
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
