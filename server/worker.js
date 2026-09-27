const levels = ["easy", "medium", "hard"];
const answers = ["about-right", "felt-easier", "felt-harder", "unsure"];
const fields = ["id", "senderId", "seed", "generatorVersion", "ratingVersion", "oldLevel",
	"newLevel", "answer", "outcome", "elapsedMs", "hintsUsed", "continuedAfterLoss", "zenMode"];
const maxBodyBytes = 4096;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function validFeedback(data) {
	return data && typeof data == "object" && !Array.isArray(data) &&
		fields.every(key => Object.hasOwn(data, key)) &&
		Object.keys(data).every(key => fields.includes(key) || key == "playerName") &&
		typeof data.id == "string" && uuid.test(data.id) &&
		typeof data.senderId == "string" && uuid.test(data.senderId) &&
		(data.playerName === undefined || typeof data.playerName == "string" &&
		 data.playerName.length <= 80 && !/[\u0000-\u001f\u007f]/.test(data.playerName)) &&
		typeof data.seed == "string" && /^[0-9a-f]{8}$/.test(data.seed) &&
		data.generatorVersion === 1 &&
		data.ratingVersion === "stretch-scarcity-1" &&
		levels.includes(data.oldLevel) && levels.includes(data.newLevel) &&
		answers.includes(data.answer) &&
		["won", "lost"].includes(data.outcome) &&
		(data.elapsedMs === null ||
		 Number.isSafeInteger(data.elapsedMs) && data.elapsedMs >= 0) &&
		typeof data.hintsUsed == "boolean" &&
		typeof data.continuedAfterLoss == "boolean" &&
		typeof data.zenMode == "boolean";
}

function reply(status, body, extra = {}) {
	return new Response(body === null ? null : JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			// Unauthenticated writes also work from local file:// copies of Logos.
			"Access-Control-Allow-Origin": "*",
			...extra,
		},
	});
}

async function readBody(request) {
	if (!request.body)
		return { error: 400 };
	const reader = request.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done)
				break;
			size += value.length;
			if (size > maxBodyBytes) {
				await reader.cancel();
				return { error: 413 };
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	try {
		return { data: JSON.parse(new TextDecoder().decode(bytes)) };
	} catch (_) {
		return { error: 400 };
	}
}

export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname !== "/api/feedback")
			return reply(404, { error: "Not found" });
		if (request.method === "OPTIONS")
			return reply(204, null, {
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
				"Access-Control-Max-Age": "86400",
			});
		if (request.method !== "POST")
			return reply(405, { error: "Use POST" }, { Allow: "POST, OPTIONS" });
		if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()
		    !== "application/json")
			return reply(415, { error: "Expected application/json" });
		const body = await readBody(request);
		if (body.error)
			return reply(body.error, { error: body.error === 413 ?
				"Report too large" : "Invalid JSON" });
		const data = body.data;
		if (!validFeedback(data))
			return reply(400, { error: "Invalid feedback fields" });
		try {
			await env.DB.prepare(`
				INSERT INTO difficulty_feedback
					(id, received_at, seed, generator_version, rating_version,
					 old_level, new_level, answer, elapsed_ms, hints_used,
					 continued_after_loss, zen_mode, sender_id, player_name, outcome)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO NOTHING
			`).bind(data.id, Date.now(), data.seed, data.generatorVersion,
				data.ratingVersion, data.oldLevel, data.newLevel, data.answer,
				data.elapsedMs, Number(data.hintsUsed), Number(data.continuedAfterLoss),
				Number(data.zenMode), data.senderId, data.playerName?.trim() || null, data.outcome).run();
		} catch (_) {
			return reply(503, { error: "Feedback could not be saved; try again" });
		}
		return reply(200, { ok: true });
	},
};
