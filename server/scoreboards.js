/* Group IDs are bearer credentials. Names and membership stay on the client. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validScore(data) {
	if (!data || typeof data !== "object" || Array.isArray(data)) return false;
	const fields = ["id", "date", "name", "outcome", "elapsed", "generatorVersion"];
	if (Object.keys(data).length !== fields.length || !fields.every(k => Object.hasOwn(data, k))) return false;
	if (typeof data.id !== "string" || !uuid.test(data.id) || typeof data.date !== "string" || !/^\d{8}$/.test(data.date)) return false;
	const date = new Date(`${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6)}T12:00:00Z`);
	return Number.isFinite(+date) && date.toISOString().slice(0, 10).replaceAll("-", "") === data.date &&
		typeof data.name === "string" && data.name.trim().length > 0 && data.name.length <= 80 &&
		!/[\u0000-\u001f\u007f]/.test(data.name) && ["won", "lost"].includes(data.outcome) &&
		(data.elapsed === null || Number.isSafeInteger(data.elapsed) && data.elapsed >= 0 && data.elapsed <= 31536000000) &&
		Number.isSafeInteger(data.generatorVersion) && data.generatorVersion > 0 && data.generatorVersion <= 1000;
}

export async function scoreboards(request, env, reply, readBody) {
	const url = new URL(request.url);
	const group = url.pathname.slice("/api/scoreboards/".length);
	if (!uuid.test(group)) return reply(400, { error: "Invalid group link" });
	if (request.method === "OPTIONS") return reply(204, null, {
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400",
	});
	try {
		if (request.method === "GET") {
			const after = url.searchParams.get("after") || "0";
			if (!/^\d{1,16}$/.test(after) || !Number.isSafeInteger(Number(after)))
				return reply(400, { error: "Invalid cursor" });
			const { results } = await env.DB.prepare(`SELECT sequence, payload FROM daily_scores
				WHERE group_id = ? AND sequence > ? ORDER BY sequence LIMIT 201`).bind(group, Number(after)).all();
			const records = results.slice(0, 200).map(row => ({ sequence: row.sequence, ...JSON.parse(row.payload) }));
			return reply(200, { records, cursor: records.at(-1)?.sequence ?? Number(after), more: results.length > 200 });
		}
		if (request.method !== "POST") return reply(405, { error: "Use GET or POST" });
		if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
			return reply(415, { error: "Expected application/json" });
		const body = await readBody(request);
		if (body.error) return reply(body.error, { error: "Invalid or oversized request" });
		if (!validScore(body.data)) return reply(400, { error: "Invalid score" });
		await env.DB.prepare(`INSERT INTO daily_scores (group_id, id, payload) VALUES (?, ?, ?)
			ON CONFLICT(group_id, id) DO NOTHING`).bind(group, body.data.id, JSON.stringify(body.data)).run();
		return reply(200, { ok: true });
	} catch (_) {
		return reply(503, { error: "Scoreboard unavailable; try again" });
	}
}
