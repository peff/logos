import worker from "./worker.js";

function assert(value, message = "assertion failed") {
	if (!value) throw new Error(message);
}

const report = {
	id: "ab68dd83-793c-449c-a2a9-d52bc3dfb450",
	senderId: "171409b8-a54c-47a2-84a5-e7c13f1722b2",
	seed: "02b839f1",
	generatorVersion: 1,
	ratingVersion: "stretch-scarcity-1",
	oldLevel: "medium",
	newLevel: "hard",
	answer: "about-right",
	outcome: "won",
	elapsedMs: 466000,
	hintsUsed: false,
	continuedAfterLoss: false,
	zenMode: false,
};

function request(data = report, headers = {}) {
	return new Request("https://example.test/api/feedback", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(data),
	});
}

function database() {
	const calls = [];
	return { calls, prepare(sql) {
		return { bind(...values) {
			return { async run() { calls.push({ sql, values }); } };
		} };
	} };
}

Deno.test("feedback binds report fields and records server receive time", async () => {
	const DB = database();
	const before = Date.now();
	const response = await worker.fetch(request(), { DB });
	assert(response.status === 200 && (await response.json()).ok);
	assert(DB.calls.length === 1);
	const [id, time, ...values] = DB.calls[0].values;
	assert(id === report.id && time >= before && time <= Date.now());
	assert(JSON.stringify(values) === JSON.stringify([
		"02b839f1", 1, "stretch-scarcity-1", "medium", "hard", "about-right",
		466000, 0, 0, 0, report.senderId, null, "won",
	]));
});

Deno.test("assisted completions and unavailable times are accepted", async () => {
	const DB = database();
	const response = await worker.fetch(request({ ...report, elapsedMs: null,
		hintsUsed: true, continuedAfterLoss: true, zenMode: true }), { DB });
	assert(response.status === 200);
	assert(JSON.stringify(DB.calls[0].values.slice(8, 12)) === "[null,1,1,1]");
});

Deno.test("invalid reports never reach the database", async () => {
	const DB = database();
	for (const data of [null, [], {}, { ...report, seed: "oops" },
		{ ...report, outcome: "draw" }, { ...report, outcome: undefined },
		{ ...report, id: "oops" }, { ...report, answer: "yes" },
		{ ...report, oldLevel: "expert" }, { ...report, generatorVersion: 2 },
		{ ...report, ratingVersion: "future" }, { ...report, elapsedMs: -1 },
		{ ...report, elapsedMs: 1.5 }, { ...report, hintsUsed: "false" },
		{ ...report, senderId: undefined }, { ...report, senderId: "bad" },
		{ ...report, playerName: 123 }, { ...report, playerName: "x".repeat(81) },
		{ ...report, playerName: "two\nlines" },
		{ ...report, email: "unexpected@example.test" },
	]) {
		assert((await worker.fetch(request(data), { DB })).status === 400);
	}
	assert(DB.calls.length === 0);
});

Deno.test("routing and CORS permit unauthenticated local-file submissions but no reads", async () => {
	const preflight = await worker.fetch(new Request("https://example.test/api/feedback", {
		method: "OPTIONS", headers: { Origin: "null" },
	}), {});
	assert(preflight.status === 204);
	assert(preflight.headers.get("Access-Control-Allow-Origin") === "*");
	assert(preflight.headers.get("Access-Control-Allow-Methods") === "POST, OPTIONS");
	const get = await worker.fetch(new Request("https://example.test/api/feedback"), {});
	assert(get.status === 405);
	assert((await worker.fetch(new Request("https://example.test/other"), {})).status === 404);
	const response = await worker.fetch(request(report, { Origin: "null" }), { DB: database() });
	assert(response.status === 200 && response.headers.get("Access-Control-Allow-Origin") === "*");
});

Deno.test("body validation limits size even without Content-Length", async () => {
	assert((await worker.fetch(request(report, { "Content-Type": "text/plain" }), {})).status === 415);
	for (const [body, status] of [["{", 400], [" ".repeat(4097), 413]]) {
		const response = await worker.fetch(new Request("https://example.test/api/feedback", {
			method: "POST", headers: { "Content-Type": "application/json" }, body,
		}), {});
		assert(response.status === status);
		assert(response.headers.get("Access-Control-Allow-Origin") === "*");
	}
});

Deno.test("database failure is retryable and does not expose internal details", async () => {
	const response = await worker.fetch(request(), {
		DB: { prepare() { throw new Error("private database details"); } },
	});
	assert(response.status === 503);
	assert(!(await response.text()).includes("private"));
});

Deno.test("sender identity groups reports independently of optional names", async () => {
	const DB = database();
	for (const [id, playerName] of [
		[report.id, "  O'Brien  "],
		["cae36c1c-6a71-4c9b-af82-10a345c68580", ""],
	]) {
		const response = await worker.fetch(request({ ...report, id, playerName }), { DB });
		assert(response.status === 200);
	}
	assert(DB.calls[0].values[0] !== DB.calls[1].values[0]);
	assert(DB.calls.every(call => call.values[12] === report.senderId));
	assert(DB.calls[0].values[13] === "O'Brien");
	assert(DB.calls[1].values[13] === null);
});

Deno.test("feedback preserves losses and completions after a loss", async () => {
	for (const [outcome, continuedAfterLoss] of [["lost", false], ["won", true]]) {
		const DB = database();
		const response = await worker.fetch(request({ ...report, outcome,
			continuedAfterLoss, zenMode: continuedAfterLoss }), { DB });
		assert(response.status === 200);
		assert(DB.calls[0].values[10] === Number(continuedAfterLoss));
		assert(DB.calls[0].values[14] === outcome);
	}
});

Deno.test("feedback accepts unchanged difficulty labels", async () => {
	const DB = database();
	const response = await worker.fetch(request({ ...report, oldLevel: "hard" }), { DB });
	assert(response.status === 200);
	assert(DB.calls[0].values[5] === "hard" && DB.calls[0].values[6] === "hard");
});

Deno.test("feedback accepts and preserves all supported difficulty rule versions", async () => {
	for (const ratingVersion of ["stretch-scarcity-1", "stretch-scarcity-2", "allowance3-scarcity-1", "placement-composite-1"]) {
		const DB = database();
		const response = await worker.fetch(request({ ...report, ratingVersion }), { DB });
		assert(response.status === 200);
		assert(DB.calls[0].values[4] === ratingVersion);
	}
});

Deno.test("feedback accepts the current rating without a historical comparison", async () => {
	const DB = database();
	const {oldLevel, ...current} = report;
	const response = await worker.fetch(request({...current, ratingVersion: "placement-composite-1"}), {DB});
	assert(response.status === 200);
	assert(DB.calls[0].values[5] === null && DB.calls[0].values[6] === "hard");
});
