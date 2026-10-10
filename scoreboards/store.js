/* Separate from the Chronicle: cache and queued uploads may be discarded on leave. */
(function(root) {
	const request = req => new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	class ScoreboardStore {
		constructor(name = "logos-scoreboards") { this.name = name; }
		async transaction(mode, callback) {
			const opening = indexedDB.open(this.name, 1);
			opening.onupgradeneeded = () => {
				opening.result.createObjectStore("groups", { keyPath: "id" });
				for (const [name, key] of [["records", "id"], ["uploads", "runId"]]) {
					const store = opening.result.createObjectStore(name, { keyPath: ["group", key] });
					store.createIndex("group", "group");
				}
			};
			const db = await request(opening);
			db.onversionchange = () => db.close();
			try {
				const tx = db.transaction(["groups", "records", "uploads"], mode);
				const done = new Promise((resolve, reject) => {
					tx.oncomplete = resolve;
					tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted"));
				});
				try {
					const result = await callback(Object.fromEntries(
						["groups", "records", "uploads"].map(name => [name, tx.objectStore(name)])), request);
					await done;
					return result;
				} catch (error) {
					try { tx.abort(); } catch (_) { /* Already finished. */ }
					await done.catch(() => {});
					throw error;
				}
			} finally { db.close(); }
		}
		groups() { return this.transaction("readonly", (s, q) => q(s.groups.getAll())); }
		group(id) { return this.transaction("readonly", (s, q) => q(s.groups.get(id))); }
		async join(group) {
			return this.transaction("readwrite", async (s, q) => {
				const old = await q(s.groups.get(group.id));
				const value = old ? { ...old, label: group.label, name: group.name } : { ...group, cursor: 0 };
				s.groups.put(value);
				return value;
			});
		}
		leave(id) {
			return this.transaction("readwrite", async (s, q) => {
				s.groups.delete(id);
				for (const name of ["records", "uploads"])
					for (const key of await q(s[name].index("group").getAllKeys(id))) s[name].delete(key);
			});
		}
		queue(id, runs, makeRecord) {
			return this.transaction("readwrite", async (s, q) => {
				const group = await q(s.groups.get(id));
				if (!group) return;
				const first = new Set();
				const known = new Set((await q(s.uploads.index("group").getAllKeys(id))).map(key => key[1]));
				for (const run of runs) {
					if (!run.daily || run.multiplayer || first.has(run.daily)) continue;
					first.add(run.daily);
					if (run.daily !== group.joinDate && run.date < group.joinedAt) continue;
					if (known.has(run.id)) continue;
					s.uploads.add({ group: id, runId: run.id, record: makeRecord(run, group.name), sent: false });
				}
			});
		}
		uploads(id) { return this.transaction("readonly", (s, q) => q(s.uploads.index("group").getAll(id))); }
		ack(id, runId) {
			return this.transaction("readwrite", async (s, q) => {
				const item = await q(s.uploads.get([id, runId]));
				if (item) s.uploads.put({ ...item, sent: true });
			});
		}
		merge(id, page) {
			return this.transaction("readwrite", async (s, q) => {
				const group = await q(s.groups.get(id));
				if (!group) return;
				for (const record of page.records) s.records.put({ ...record, group: id });
				s.groups.put({ ...group, cursor: Math.max(group.cursor, page.cursor) });
			});
		}
		records(id) { return this.transaction("readonly", (s, q) => q(s.records.index("group").getAll(id))); }
	}
	root.ScoreboardStore = ScoreboardStore;
})(globalThis);
