export async function onRequest(context) {
  const { request, env } = context;
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (!env.RESET_DATA) return new Response(JSON.stringify({ error: "RESET_DATA KV binding is not configured" }), { status: 503, headers });
  const key = "shared-state";
  if (request.method === "GET") {
    const state = await env.RESET_DATA.get(key, "json");
    return new Response(JSON.stringify({ state: state || null }), { headers });
  }
  if (request.method === "PUT" || request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }
    if (!body || typeof body !== "object" || !Array.isArray(body.tasks) || !Array.isArray(body.brainDump) || !body.settings) {
      return new Response(JSON.stringify({ error: "Invalid RESET state" }), { status: 400, headers });
    }
    body._syncedAt = new Date().toISOString();
    await env.RESET_DATA.put(key, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, syncedAt: body._syncedAt }), { headers });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}