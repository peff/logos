(function(root) {
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	function localDate(date = new Date()) {
		return String(date.getFullYear()).padStart(4, "0") + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
	}
	class ScoreboardClient {
		constructor(store, endpoint, history, fetcher = (...args) => fetch(...args)) {
			this.store = store;
			this.endpoint = endpoint.replace(/\/$/, "");
			this.history = history;
			this.fetcher = fetcher;
		}
		async join(id, label, name) {
			if (!uuid.test(id) || !name.trim() || name.length > 80 || !label.trim() || label.length > 80 ||
			    /[\u0000-\u001f\u007f]/.test(name + label)) throw new Error("Enter a group label and your name (up to 80 characters).");
			return this.store.join({ id, label: label.trim(), name: name.trim(), joinedAt: Date.now(), joinDate: localDate() });
		}
		async reconcile() {
			const groups = await this.store.groups();
			if (!groups.length) return;
			const history = await this.history();
			if (!history) throw new Error("The Chronicle could not be loaded.");
			for (const group of groups) await this.store.queue(group.id, history.runs, (run, name) => ({
				id: crypto.randomUUID(), date: run.daily, name, outcome: run.outcome,
				elapsed: run.elapsed ?? null, generatorVersion: run.generatorVersion || 1,
			}));
		}
		async call(id, options) {
			const unavailable = "Could not reach the scoreboard. Shared scores may be out of date.";
			const response = await this.fetcher(this.endpoint + "/" + id, {
				...options, signal: AbortSignal.timeout(15000), credentials: "omit", referrerPolicy: "no-referrer",
			}).catch(() => { throw new Error(unavailable); });
			if (!response.ok) throw new Error(unavailable);
			return response.json();
		}
		sync() {
			this.syncAgain = true;
			if (!this.syncing) this.syncing = (async () => {
				do { this.syncAgain = false; await this.performSync(); } while (this.syncAgain);
			})().finally(() => { this.syncing = null; });
			return this.syncing;
		}
		async performSync() {
			await this.reconcile();
			let failure;
			for (const group of await this.store.groups()) {
				try {
					for (const item of await this.store.uploads(group.id)) {
						if (item.sent) continue;
						if (!await this.store.group(group.id)) break;
						await this.call(group.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.record) });
						await this.store.ack(group.id, item.runId);
					}
					let cursor = group.cursor;
					for (;;) {
						if (!await this.store.group(group.id)) break;
						const page = await this.call(group.id + "?after=" + cursor);
						if (!Array.isArray(page.records) || !Number.isSafeInteger(page.cursor) || page.cursor < cursor ||
						    page.records.length > 200 || page.more && page.cursor === cursor)
							throw new Error("Invalid scoreboard response.");
						await this.store.merge(group.id, page);
						cursor = page.cursor;
						if (!page.more) break;
					}
				} catch (error) { failure = error; }
			}
			if (failure) throw failure;
		}
	}
	function compareScores(a, b) {
		const rank = r => r.outcome === "won" ? r.elapsed === null ? 1 : 0 : 2;
		return rank(a) - rank(b) || (rank(a) === 0 ? a.elapsed - b.elapsed : 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
	}
	root.LogosScoreboards = { ScoreboardClient, localDate, compareScores, validId: id => uuid.test(id) };
})(globalThis);
