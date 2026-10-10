import worker from "./worker.js";
import { validScore } from "./scoreboards.js";
const assert = (condition, message = "assertion failed") => { if (!condition) throw new Error(message); };
const group = "11111111-1111-4111-8111-111111111111";
const score = { id: "22222222-2222-4222-8222-222222222222", date: "20261010", name: "Ada", outcome: "won", elapsed: 123000, generatorVersion: 1 };
const req = (method = "GET", data, suffix = "") => new Request("https://example.test/api/scoreboards/" + group + suffix, {
	method, headers: { "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
Deno.test("scoreboards validate dates, names, times and exact record shape", () => {
	assert(validScore(score)); assert(validScore({ ...score, elapsed: null }));
	for (const patch of [{ date: "20260229" }, { date: "20261301" }, { name: " " }, { name: "x\n" },
		{ name: "x".repeat(81) }, { elapsed: -1 }, { elapsed: 1.1 }, { elapsed: 1e20 },
		{ id: [score.id] }, { outcome: "draw" }, { extra: 1 }, { generatorVersion: 0 }])
		assert(!validScore({ ...score, ...patch }), JSON.stringify(patch));
});
Deno.test("scoreboards bound reads and return an incremental cursor", async () => {
	let args;
	const DB = { prepare(sql) { assert(sql.includes("LIMIT 201")); return { bind(...values) { args = values; return {
		all: async () => ({ results: Array.from({ length: 201 }, (_, i) => ({ sequence: 10 + i, payload: JSON.stringify(score) })) }),
	}; } }; } };
	const response = await worker.fetch(req("GET", undefined, "?after=9"), { DB });
	const page = await response.json();
	assert(response.status === 200 && page.more && page.cursor === 209 && page.records.length === 200);
	assert(JSON.stringify(args) === JSON.stringify([group, 9]));
	assert((await worker.fetch(req("GET", undefined, "?after=-1"), { DB })).status === 400);
});
Deno.test("scoreboard writes are parameterized and idempotent", async () => {
	let values;
	const DB = { prepare(sql) { assert(sql.includes("ON CONFLICT(group_id, id) DO NOTHING")); return {
		bind(...args) { values = args; return { run: async () => {} }; },
	}; } };
	assert((await worker.fetch(req("POST", score), { DB })).status === 200);
	assert(values[0] === group && values[1] === score.id && JSON.parse(values[2]).name === "Ada");
	assert((await worker.fetch(req("POST", { ...score, name: "x".repeat(5000) }), { DB })).status === 413);
	assert((await worker.fetch(req("OPTIONS"), { DB })).headers.get("Access-Control-Allow-Methods").includes("GET"));
	assert((await worker.fetch(req("DELETE"), { DB })).status === 405);
	assert((await worker.fetch(req("POST", score), { DB: { prepare() { throw Error(); } } })).status === 503);
});
