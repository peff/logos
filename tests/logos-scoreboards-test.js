(async function() {
	const output = document.querySelector("#results");
	const assert = (value, message) => { if (!value) throw new Error(message); };
	const { ScoreboardClient, localDate, compareScores } = LogosScoreboards;
	const store = new ScoreboardStore();
	const groups = [crypto.randomUUID(), crypto.randomUUID()];
	const rows = new Map(); let sequence = 0, offline = false, lostReply = false, posts = 0;
	const fetcher = async (url, options) => {
		if (offline) throw Error("offline");
		const parsed = new URL(url); const id = parsed.pathname.split("/").at(-1);
		const data = rows.get(id) || []; rows.set(id, data);
		if (options.method === "POST") {
			posts++;
			const record = JSON.parse(options.body);
			if (!data.some(r => r.id === record.id)) data.push({ ...record, sequence: ++sequence });
			if (lostReply) { lostReply = false; throw Error("response lost"); }
			return Response.json({ ok: true });
		}
		const cursor = Number(parsed.searchParams.get("after"));
		const remaining = data.filter(r => r.sequence > cursor);
		const records = remaining.slice(0, 2);
		return Response.json({ records, cursor: records.at(-1)?.sequence || cursor, more: remaining.length > 2 });
	};
	const runs = [
		{ id: 1, date: 1, daily: localDate(), outcome: "lost", elapsed: 123000 },
		{ id: 2, date: 2, daily: localDate(), outcome: "won" },
		{ id: 3, date: 1, daily: "20200101", outcome: "won", elapsed: 1000 },
	];
	const client = new ScoreboardClient(store, "https://example.test/api/scoreboards", async () => ({ runs }), fetcher);
	let checks = 0;
	try {
		await client.join(groups[0], "Family", "Ada");
		await client.join(groups[1], "Friends", "Ada");
		offline = true;
		await client.sync().catch(() => {});
		assert((await store.uploads(groups[0])).length === 1, "join must queue only today's first result"); checks++;
		offline = false; lostReply = true;
		await client.sync().catch(() => {});
		await client.sync();
		assert(rows.get(groups[0]).length === 1 && rows.get(groups[1]).length === 1, "lost response created a duplicate"); checks++;
		assert(rows.get(groups[0])[0].outcome === "lost", "continuation replaced first outcome"); checks++;
		const before = posts;
		await client.sync(); assert(posts === before, "acked scores were uploaded again"); checks++;
		const joinedAt = (await store.group(groups[0])).joinedAt;
		await client.join(groups[0], "Our family", "Grace");
		assert((await store.group(groups[0])).joinedAt === joinedAt, "edit reset joining boundary"); checks++;
		runs.push({ id: 4, date: Date.now() + 1, daily: "20200102", outcome: "won", elapsed: 5000 });
		await Promise.all([client.sync(), new ScoreboardClient(store, client.endpoint, client.history, fetcher).sync()]);
		assert(rows.get(groups[0]).length === 2 && rows.get(groups[1]).length === 2, "multiple clients duplicated a submission"); checks++;
		assert(rows.get(groups[0])[1].name === "Grace" && rows.get(groups[1])[1].name === "Ada", "posting names not local to each group"); checks++;
		for (let i = 0; i < 5; i++) rows.get(groups[0]).push({ id: crypto.randomUUID(), name: "Ada", date: localDate(), outcome: "won", elapsed: i, generatorVersion: 1, sequence: ++sequence });
		await client.sync();
		assert((await store.records(groups[0])).length === 7, "incremental pagination lost records"); checks++;
		const sorted = (await store.records(groups[0])).sort(compareScores);
		assert(sorted[0].elapsed === 0 && sorted.at(-1).outcome === "lost", "daily ranking order incorrect"); checks++;
		await store.leave(groups[0]);
		assert(!await store.group(groups[0]) && !(await store.records(groups[0])).length && !(await store.uploads(groups[0])).length, "leave retained group data"); checks++;
		assert((await store.records(groups[1])).length === 2, "leave affected another group"); checks++;
		output.textContent = `PASS: ${checks} scoreboard checks`;
	} catch (error) { output.textContent = "FAIL: " + error.stack; }
	finally { for (const id of groups) await store.leave(id); }
})();
