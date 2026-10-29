var browserTestsDone = (async function() {
	const output = document.querySelector("#results");
	const assert = (value, message) => { if (!value) throw new Error(message); };
	const { ScoreboardClient, localDate, compareScores, groupScores, combineScores } = LogosScoreboards;
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
		{ id: 2, date: 2, daily: localDate(), outcome: "won", elapsed: 130000 },
		{ id: 3, date: 1, daily: "20200101", outcome: "won", elapsed: 1000 },
	];
	const client = new ScoreboardClient(store, "https://example.test/api/scoreboards", async () => ({ runs }), fetcher);
	const originalName = await store.getName();
	let checks = 0;
	try {
		await store.setName("Ada");
		assert(await new ScoreboardStore("logos-scoreboards:other-endpoint").getName() === "Ada", "endpoint change lost shared name"); checks++;
		await client.join(groups[0], "Family");
		await client.join(groups[1], "Friends");
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
		await store.setName("Grace");
		await store.rename(groups[0], "Our family");
		assert((await store.group(groups[0])).joinedAt === joinedAt, "edit reset joining boundary"); checks++;
		runs.push({ id: 4, date: Date.now() + 1, daily: "20200102", outcome: "won", elapsed: 5000 });
		await Promise.all([client.sync(), new ScoreboardClient(store, client.endpoint, client.history, fetcher).sync()]);
		assert(rows.get(groups[0]).length === 2 && rows.get(groups[1]).length === 2, "multiple clients duplicated a submission"); checks++;
		assert(rows.get(groups[0])[1].name === "Grace" && rows.get(groups[1])[1].name === "Grace", "posting name not shared across groups"); checks++;
		for (let i = 0; i < 5; i++) rows.get(groups[0]).push({ id: crypto.randomUUID(), name: "Ada", date: localDate(), outcome: "won", elapsed: i, generatorVersion: 1, sequence: ++sequence });
		await client.sync();
		assert((await store.records(groups[0])).length === 7, "incremental pagination lost records"); checks++;
		const sorted = (await store.records(groups[0])).sort(compareScores);
		assert(sorted[0].elapsed === 0 && sorted.at(-1).outcome === "lost", "daily ranking order incorrect"); checks++;
		await store.leave(groups[0]);
		assert(!await store.group(groups[0]) && !(await store.records(groups[0])).length && !(await store.uploads(groups[0])).length, "leave retained group data"); checks++;
		assert((await store.records(groups[1])).length === 2, "leave affected another group"); checks++;
		assert(rows.get(groups[1])[0].name === "Ada", "name change altered published scores"); checks++;
		await store.setName("");
		runs.push({ id: 5, date: Date.now() + 1, daily: "20200103", outcome: "won", elapsed: 5000 });
		await client.sync();
		assert(rows.get(groups[1]).length === 2, "blank name queued a score"); checks++;
		await store.setName("Grace");
		await client.sync();
		assert(rows.get(groups[1]).length === 3, "filling name did not recover pending result"); checks++;
		await store.leave(groups[1]);
		assert(await store.getName() === "Grace", "leaving all groups erased name"); checks++;
		await client.join(groups[0], "Family");
		await client.join(groups[1], "Friends");
		runs.push({ id: 6, date: 2, daily: "20200101", outcome: "won" });
		runs.push({ id: 7, date: 1, daily: "20190101", outcome: "won", elapsed: 2000 });
		const beforeBackfill = posts;
		await client.reconcile("20200101");
		assert(posts === beforeBackfill, "backfill reconciliation touched the network"); checks++;
		for (const id of groups) {
			const uploads = await store.uploads(id);
			assert(uploads.length === 1 && uploads[0].runId === 3, "backfill did not queue only the selected day's first outcome"); checks++;
		}
		await client.reconcile("20200101");
		assert((await store.uploads(groups[0])).length === 1, "repeated backfill duplicated queued result"); checks++;
		await client.sync();
		const afterBackfill = posts;
		await client.reconcile("20200101");
		await client.sync();
		assert(posts === afterBackfill, "backfill reposted an acknowledged score"); checks++;
		for (const id of groups) await store.leave(id);
		const continuationGroups = [crypto.randomUUID(), crypto.randomUUID()];
		groups.push(...continuationGroups);
		const continuedRuns = [{ id: 10, date: 1, daily: "20200102", outcome: "lost", elapsed: 123000 }];
		const continuedClient = new ScoreboardClient(store, client.endpoint, async () => ({ runs: continuedRuns }), fetcher);
		for (const id of continuationGroups) await continuedClient.join(id, "New group");
		await continuedClient.reconcile("20200102");
		await continuedClient.sync();
		await store.setName("Renamed");
		continuedRuns.push({ id: 11, date: 2, daily: "20200102", outcome: "won" });
		continuedRuns.push({ id: 12, date: 3, daily: "20200102", outcome: "won" });
		offline = true;
		await continuedClient.sync().catch(() => {});
		for (const id of continuationGroups) {
			const uploads = await store.uploads(id);
			assert(uploads.length === 2 && uploads[0].sent && !uploads[1].sent &&
			       uploads[1].record.continuationOf === uploads[0].record.id,
			       "continuation did not reference the already shared loss"); checks++;
			const grouped = groupScores(uploads.map(item => ({ ...item.record, pending: !item.sent })));
			assert(grouped.length === 1 && grouped[0].completed && grouped[0].pending &&
			       grouped[0].outcome === "lost" && grouped[0].elapsed === 123000 && grouped[0].name === "Grace",
			       "pending completion changed the original score or was not grouped"); checks++;
		}
		offline = false; lostReply = true;
		await continuedClient.sync().catch(() => {});
		await continuedClient.sync();
		for (const id of continuationGroups) {
			assert(rows.get(id).length === 2, "continuation retry duplicated the record"); checks++;
			const records = await store.records(id);
			const original = records.find(record => !record.continuationOf);
			const completion = records.find(record => record.continuationOf);
			assert(!groupScores([original])[0].completed && groupScores(records)[0].completed,
			       "incremental completion did not update the displayed loss"); checks++;
			assert(groupScores([completion]).length === 0, "orphan continuation became a standalone win"); checks++;
			const stranger = { ...original, id: crypto.randomUUID() };
			assert(!groupScores([stranger, completion])[0].completed, "same-name score matched another player's completion"); checks++;
			assert(!groupScores([original, { ...completion, date: "19990101" }])[0].completed,
			       "completion matched a different daily"); checks++;
		}
		const sent = posts;
		await continuedClient.sync();
		assert(posts === sent, "acknowledged continuation was reposted"); checks++;
		const lateGroup = crypto.randomUUID();
		groups.push(lateGroup);
		await continuedClient.join(lateGroup, "Joined later");
		await continuedClient.reconcile();
		assert(!(await store.uploads(lateGroup)).length, "old completion bypassed joining boundary without its loss"); checks++;
		await continuedClient.reconcile("20200102");
		const backfilled = await store.uploads(lateGroup);
		assert(backfilled.length === 2 && backfilled[1].record.continuationOf === backfilled[0].record.id,
		       "explicit backfill did not queue the loss and its completion together"); checks++;
		const score = { id: "one", date: localDate(), name: "Ada", outcome: "lost", elapsed: 123000, generatorVersion: 1 };
		const combined = combineScores([score, { ...score, id: "two", completed: true, pending: true, runId: 42 }]);
		assert(combined.length === 1 && combined[0].completed && combined[0].pending && combined[0].runId === 42,
		       "combined score lost completion, pending status, or Chronicle link"); checks++;
		assert(!score.completed && !score.pending, "combining mutated a group score"); checks++;
		for (const different of [{ name: "Grace" }, { date: "19990101" }, { outcome: "won" },
			{ elapsed: 123001 }, { elapsed: null }, { generatorVersion: 2 }]) {
			assert(combineScores([score, { ...score, ...different }]).length === 2,
			       "combined distinct scores: " + JSON.stringify(different)); checks++;
		}
		await testForum(assert);
		checks++;

		output.textContent = `PASS: ${checks} scoreboard checks`;
		return true;
	} catch (error) { output.textContent = "FAIL: " + error.stack; return false; }
	finally {
		for (const id of groups) await store.leave(id);
		await store.setName(originalName);
	}
})();

async function testForum(assert) {
	const frame = document.createElement("iframe");
	frame.src = "../../index.html";
	frame.style.width = "1000px";
	frame.style.height = "800px";
	const loaded = new Promise(resolve => frame.onload = resolve);
	document.body.append(frame);
	await loaded;
	const app = frame.contentWindow, doc = app.document;
	await app.puzzle.onlineReady;
	const endpoint = doc.querySelector('meta[name="logos-scoreboards-endpoint"]').content;
	const store = new app.ScoreboardStore("logos-scoreboards:" + endpoint);
	const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
	const today = app.LogosScoreboards.localDate();
	// Exercise cached and pending rows without a live scoreboard service.
	app.fetch = async () => { throw Error("offline"); };
	const current = () => doc.querySelector('.forum-groups [aria-current="true"]')?.title;
	const rows = () => [...doc.querySelectorAll("#forum-menu tbody tr")];
	async function waitFor(test) {
		const deadline = Date.now() + 5000;
		while (!test()) {
			if (Date.now() > deadline) throw Error("Timed out waiting for Forum render");
			await new Promise(resolve => setTimeout(resolve, 20));
		}
	}
	async function openDaily() {
		app.puzzle.showDailyResult({ date: today, outcome: "lost", difficulty: "easy" });
		await doc.querySelector(".daily-scoreboards").onclick();
	}
	function close() { doc.querySelector("#forum-menu .modal-close").click(); }
	try {
		for (const [i, id] of ids.entries()) {
			await store.join({ id, label: "Group " + i, joinedAt: i, joinDate: today });
			await store.merge(id, { cursor: 1, records: [
				{ id: crypto.randomUUID(), date: today, name: "Shared", outcome: "won", elapsed: 1000, generatorVersion: 1 },
				{ id: crypto.randomUUID(), date: today, name: "Player " + i, outcome: "won", elapsed: 2000 + i, generatorVersion: 1 },
			] });
		}
		await openDaily();
		assert(current() === "All" && rows().length === 4, "daily entry did not combine all boards");
		assert(rows()[0].cells[0].textContent === "Shared", "combined scores not ranked");
		assert(doc.querySelector(".forum-groups").classList.contains("forum-groups-circular"), "All missing from circular navigation");
		const navigation = doc.querySelector(".forum-groups");
		const center = navigation.querySelector('[aria-current="true"]').getBoundingClientRect();
		function assertCentered() {
			const nav = navigation.getBoundingClientRect();
			const buttons = [...navigation.children].map(button => button.getBoundingClientRect());
			const centers = buttons.map(bounds => bounds.left + bounds.width / 2);
			assert(Math.abs(centers[1] - nav.left - nav.width / 2) < 1,
			       "selected board is not centered");
			assert(Math.abs(buttons[0].left - nav.left) < 1 && Math.abs(buttons[2].right - nav.right) < 1,
			       "neighboring boards are not aligned to the outside edges");
		}
		assertCentered();
		assert(center.width < navigation.clientWidth / 4, "All underline stretches beyond its label");
		async function assertFades() {
			await waitFor(() => [...navigation.querySelectorAll(".forum-group-label")].every(label =>
				label.classList.contains("forum-group-overflow") === (label.scrollWidth > label.clientWidth)));
			for (const label of navigation.querySelectorAll(".forum-group-label")) {
				const style = app.getComputedStyle(label);
				assert(style.textOverflow === "clip", "group name still reserves space for an ellipsis");
				assert((style.maskImage !== "none") === (label.scrollWidth > label.clientWidth),
				       "fade does not match label overflow");
				const left = navigation.classList.contains("forum-groups-circular") && label.parentElement.dataset.step === "-1";
				const offset = left ? label.scrollWidth - label.clientWidth : 0;
				assert(Math.abs(label.scrollLeft - offset) <= 1, "group name clipped at the wrong end");
				if (label.scrollWidth > label.clientWidth)
					assert(style.maskImage.includes(left ? "to left" : "to right"), "group name fades at the wrong end");
			}
			for (const arrow of navigation.querySelectorAll(".forum-group-arrow"))
				assert(app.getComputedStyle(arrow).maskImage === "none", "navigation arrow was faded");
		}
		await assertFades();
		await store.rename(ids[0], "Cville Logos Club");
		close();
		await openDaily();
		assertCentered();
		navigation.querySelector('[data-step="1"]').click();
		await waitFor(() => current() === "Cville Logos Club" && rows().length === 2);
		await new Promise(resolve => setTimeout(resolve, 250));
		await doc.fonts.ready;
		const selectedLabel = navigation.querySelector('[aria-current="true"] .forum-group-label');
		assert(selectedLabel.scrollWidth <= selectedLabel.clientWidth, "Cville Logos Club was truncated when selected");
		await assertFades();
		assertCentered();
		close();
		await openDaily();
		await store.rename(ids[2], "Very long group name ".repeat(4));
		close();
		await openDaily();
		assertCentered();
		await assertFades();
		for (const arrow of navigation.querySelectorAll(".forum-group-arrow")) {
			const bounds = arrow.getBoundingClientRect(), button = arrow.parentElement.getBoundingClientRect();
			assert(bounds.width > 0 && bounds.left >= button.left && bounds.right <= button.right,
			       "truncation hid a carousel arrow");
		}
		frame.style.width = "320px";
		navigation.querySelector('[data-step="-1"]').click();
		await waitFor(() => current() === "Very long group name ".repeat(4));
		await new Promise(resolve => setTimeout(resolve, 250));
		assertCentered();
		await assertFades();
		const narrowNav = navigation.getBoundingClientRect();
		for (const button of navigation.children) {
			const bounds = button.getBoundingClientRect();
			assert(bounds.left >= narrowNav.left - 1 && bounds.right <= narrowNav.right + 1,
			       "long selected name overflowed narrow navigation");
		}
		for (const arrow of navigation.querySelectorAll(".forum-group-arrow")) {
			const bounds = arrow.getBoundingClientRect(), button = arrow.parentElement.getBoundingClientRect();
			assert(bounds.width > 0 && bounds.left >= button.left && bounds.right <= button.right,
			       "narrow navigation hid a carousel arrow");
		}
		frame.style.width = "1000px";
		await new Promise(resolve => setTimeout(resolve, 50));
		await assertFades();
		close();
		await openDaily();
		await store.rename(ids[0], "Group 0");
		await store.rename(ids[2], "Group 2");
		doc.querySelector('.forum-groups [data-step="1"]').click();
		await waitFor(() => current() === "Group 0" && rows().length === 2);
		close();
		await openDaily();
		assert(current() === "All", "daily entry retained previous group selection");
		doc.querySelector(".forum-manage").click();
		await doc.querySelector('.scoreboards-groups li[data-group="' + ids[1] + '"] button').onclick();
		await waitFor(() => current() === "Group 1" && rows().length === 2);
		assert(!doc.querySelector('#online-menu').textContent.includes("All"), "virtual board appeared in Friends management");
		close();
		doc.querySelector("#online-menu .modal-close").click();
		app.puzzle.toggleModal(app.puzzle.scores, app.puzzle.scoresButton, "Close");
		await doc.querySelector(".pantheon-forum-link button").onclick();
		assert(current() === "All" && rows().length === 4, "Pantheon entry did not default to All");
		await store.leave(ids[2]);
		close();
		await doc.querySelector(".pantheon-forum-link button").onclick();
		assert(current() === "All" && rows().length === 3 && doc.querySelector(".forum-groups").children.length === 3,
		       "All did not update after leaving a group");
		await store.leave(ids[1]);
		close();
		await doc.querySelector(".pantheon-forum-link button").onclick();
		assert(current() === "Group 0" && rows().length === 2 && doc.querySelector(".forum-groups").children.length === 1,
		       "single group still offered All");
		assert(doc.querySelector(".forum-groups button").disabled, "single group navigation not disabled");
		await store.leave(ids[0]);
		close();
		await doc.querySelector(".pantheon-forum-link button").onclick();
		assert(!doc.querySelector(".forum-no-groups").hidden && !doc.querySelector(".forum-groups").children.length,
		       "empty membership retained virtual board");
	} finally {
		for (const id of ids) await store.leave(id);
		frame.remove();
	}
}
