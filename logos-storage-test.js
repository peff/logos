/* Use real browser transactions to test migration and persistence. */
var storageTestsDone = (async function() {
	const output = document.querySelector("#results");
	const factory = window.indexedDB;
	const database = "logos-storage-test-" + Date.now();
	const indexedDescriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");
	const localDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
	const values = new Map();
	const storage = {
		getItem(key) { return values.has(key) ? values.get(key) : null; },
		setItem(key, value) { values.set(key, String(value)); },
		removeItem(key) { values.delete(key); },
	};
	Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
	Object.defineProperty(window, "indexedDB", { configurable: true, value: {
		open(name, version) {
			assert(name == "logos", "wrong database name");
			return factory.open(database, version);
		},
	} });
	function assert(condition, message) {
		if (!condition)
			throw new Error(message);
	}
	const passed = [];
	async function test(name, fn) {
		await fn();
		passed.push(name);
		output.textContent = passed.map(name => "PASS " + name).join("\n");
	}
	const win = { date: 1000, seed: 123, elapsed: 500, outcome: "won",
		rows: 6, columns: 6, generatorVersion: 1 };
	const loss = { date: 2000, seed: 456, elapsed: 100, outcome: "lost",
		rows: 6, columns: 6, generatorVersion: 1 };
	const old = { date: 500, seed: 789, elapsed: 900 };
	const legacy = JSON.stringify([
		{ date: win.date, seed: win.seed, elapsed: win.elapsed }, old, 1200,
	]);
	try {
		await test("upgrade version-1 history and index existing runs", async function() {
			await new Promise((resolve, reject) => {
				const request = factory.open(database, 1);
				request.onupgradeneeded = () =>
					request.result.createObjectStore("runs", { autoIncrement: true });
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const transaction = db.transaction("runs", "readwrite");
					const store = transaction.objectStore("runs");
					store.add(win).onsuccess = event => { win.id = event.target.result; };
					store.add(loss).onsuccess = event => { loss.id = event.target.result; };
					transaction.oncomplete = () => { db.close(); resolve(); };
					transaction.onabort = () => { db.close(); reject(transaction.error); };
				};
			});
			const history = await accessRunHistory();
			assert(history.gameStats.won == 1 && history.gameStats.lost == 1 &&
			       history.highScores.length == 1 && history.highScores[0].id == win.id,
			       "upgrade lost existing runs or failed to populate the index");
		});
		await test("history browsing returns wins and losses with their database keys", async function() {
			const history = await accessRunHistory(null, true);
			assert(history.runs.length == 2 && history.runs[0].id == win.id &&
			       history.runs[1].id == loss.id && history.runs[1].outcome == "lost" &&
			       history.runs[1].seed == loss.seed,
			       "full history lost a run, its key, or its fields");
		});
		await test("difficulty backfill preserves the run and survives another read", async function() {
			const before = (await accessRunHistory(null, true)).runs;
			const difficulty = { score: 60.5, level: "medium" };
			assert(await saveRunDifficulty(win.id, difficulty), "cache write failed");
			const after = (await accessRunHistory(null, true)).runs;
			const saved = after.find(run => run.id == win.id);
			assert(saved.difficulty.score == 60.5 && saved.difficulty.level == "medium",
			       "difficulty did not persist");
			delete saved.difficulty;
			assert(JSON.stringify(before) == JSON.stringify(after),
			       "backfill changed other fields, keys, counts, or runs");
			assert(await saveRunDifficulty(999999, difficulty), "missing-key transaction failed");
			assert((await accessRunHistory(null, true)).runs.length == before.length,
			       "backfill recreated a missing run");
		});
		await test("difficulty cache failures are harmless", async function() {
			const open = indexedDB.open;
			indexedDB.open = function() { throw new Error("storage unavailable"); };
			try {
				assert(await saveRunDifficulty(win.id, { score: 1, level: "easy" }) === false,
				       "cache failure escaped to the caller");
			} finally {
				indexedDB.open = open;
			}
		});
		await test("import legacy scores without duplicating recorded wins", async function() {
			storage.setItem("highScores", legacy);
			storage.setItem("gameStats", JSON.stringify({ won: 99, lost: 88 }));
			storage.setItem("soundEffects", "false");
			storage.setItem("multiplayerPlayerName", "test player");
			const history = await accessRunHistory();
			const runs = history.highScores;
			assert(history.gameStats.won == 3 && history.gameStats.lost == 1 && runs.length == 3,
			       "import duplicated a win or preserved obsolete aggregate counts");
			const imported = runs.find(run => run.seed == old.seed);
			assert(imported.date == old.date && imported.elapsed == old.elapsed &&
			       imported.outcome == "won" && imported.rows == 6 &&
			       imported.columns == 6 && imported.generatorVersion == 1,
			       "import lost score data or used incorrect defaults");
			assert(runs.some(run => run.elapsed == 1200 && run.date === null),
			       "an early score with no date or seed was lost");
			assert(!values.has("highScores") && !values.has("gameStats") &&
			       values.get("soundEffects") == "false" &&
			       values.get("multiplayerPlayerName") == "test player",
			       "cleanup left obsolete data or removed preferences");
		});
		await test("repeating an import is harmless", async function() {
			storage.setItem("highScores", legacy);
			assert((await accessRunHistory()).gameStats.won == 3,
			       "repeating the migration duplicated scores");
		});
		await test("new runs are appended even when their score matches", async function() {
			const repeated = Object.assign({}, win);
			delete repeated.id;
			const history = await accessRunHistory(repeated);
			assert(history.gameStats.won == 4 && repeated.id != win.id,
			       "de-duplication incorrectly discarded a new run");
		});
		await test("failed opening leaves legacy data for retry", async function() {
			storage.setItem("highScores", JSON.stringify([old]));
			storage.setItem("gameStats", "{\"won\":99,\"lost\":88}");
			const open = indexedDB.open;
			indexedDB.open = function() { throw new Error("storage unavailable"); };
			try {
				assert(await accessRunHistory() === null && values.has("highScores") &&
				       values.has("gameStats"), "failed opening removed legacy data");
			} finally {
				indexedDB.open = open;
			}
			assert((await accessRunHistory()).gameStats.won == 4 && !values.has("highScores"),
			       "retry failed or duplicated legacy scores");
		});
		await test("aborted import preserves legacy data", async function() {
			storage.setItem("highScores", JSON.stringify([{ date: 3000, seed: 999, elapsed: 800 }]));
			const add = IDBObjectStore.prototype.add;
			IDBObjectStore.prototype.add = function(value) {
				const request = add.call(this, value);
				request.addEventListener("success", () => this.transaction.abort());
				return request;
			};
			try {
				assert(await accessRunHistory() === null && values.has("highScores"),
				       "aborted import removed legacy data");
			} finally {
				IDBObjectStore.prototype.add = add;
			}
			assert((await accessRunHistory()).gameStats.won == 5 && !values.has("highScores"),
			       "retry after abort did not import exactly one score");
		});
		await test("Pantheon reads only the ten fastest wins", async function() {
			/* Include many faster losses and tied winning times. */
			for (let i = 1; i <= 25; i++) {
				await accessRunHistory({ outcome: "won", elapsed: i * 100, date: i, seed: i });
				await accessRunHistory({ outcome: "lost", elapsed: 0, date: i, seed: i });
			}
			const getAll = IDBObjectStore.prototype.getAll;
			const getAllKeys = IDBObjectStore.prototype.getAllKeys;
			const openCursor = IDBObjectStore.prototype.openCursor;
			const indexCursor = IDBIndex.prototype.openCursor;
			let visited = 0;
			IDBObjectStore.prototype.getAll = IDBObjectStore.prototype.getAllKeys =
				IDBObjectStore.prototype.openCursor = function() {
					throw new Error("unexpected full-store read");
				};
			IDBIndex.prototype.openCursor = function(range) {
				const request = indexCursor.call(this, range);
				request.addEventListener("success", () => {
					if (request.result)
						visited++;
				});
				return request;
			};
			try {
				const history = await accessRunHistory();
				assert(history && history.gameStats.won == 30 && history.gameStats.lost == 26 &&
				       history.highScores.length == 10 && visited == 10,
				       "indexed query read too many records or returned incorrect totals");
				assert(JSON.stringify(history.highScores.map(run => run.elapsed)) ==
				       JSON.stringify([100, 200, 300, 400, 500, 500, 500, 600, 700, 800]) &&
				       history.highScores.every(run => run.outcome == "won"),
				       "indexed query ranked losses or returned the wrong top ten");
				assert(history.highScores[4].id == win.id,
				       "ties did not retain primary-key order");
				visited = 0;
				const run = { outcome: "won", elapsed: 50, date: 4000, seed: 888 };
				const updated = await accessRunHistory(run);
				assert(updated && updated.gameStats.won == 31 && visited == 10 &&
				       updated.highScores[0].id == run.id,
				       "saving a result did not use the index or include the new run");
			} finally {
				IDBObjectStore.prototype.getAll = getAll;
				IDBObjectStore.prototype.getAllKeys = getAllKeys;
				IDBObjectStore.prototype.openCursor = openCursor;
				IDBIndex.prototype.openCursor = indexCursor;
			}
		});
		await test("difficulty rankings find ten matching wins and earlier unrated candidates", async function() {
			for (let i = 0; i < 12; i++) {
				await accessRunHistory({outcome: "won", elapsed: 10000+i, date: i, seed: i,
					difficulty: {score: 80, level: "hard"}});
				await accessRunHistory({outcome: "won", elapsed: 10+i, date: i, seed: i,
					difficulty: {score: 20, level: "easy"}});
			}
			await accessRunHistory({outcome: "lost", elapsed: 0, date: 1, seed: 1,
				difficulty: {score: 80, level: "hard"}});
			const candidate = {outcome: "won", elapsed: 1, date: 1, seed: 0xe2a689dd,
				rows: 6, columns: 6, generatorVersion: 1};
			await accessRunHistory(candidate);
			const history = await accessRunHistory(null, false, "hard");
			assert(history.highScores.length == 10 && history.highScores[0].elapsed == 10000 &&
			       history.highScores[9].elapsed == 10009 &&
			       history.highScores.every(run => run.outcome == "won" && run.difficulty.level == "hard"),
			       "difficulty ranking included losses, other levels, or the wrong times");
			assert(history.unratedRuns.some(run => run.id == candidate.id),
			       "an earlier unclassified win was not offered for backfill");
		});
		await test("a new database creates the index", async function() {
			await new Promise((resolve, reject) => {
				const request = factory.deleteDatabase(database);
				request.onsuccess = resolve;
				request.onerror = () => reject(request.error);
			});
			const history = await accessRunHistory();
			assert(history && !history.gameStats.won && !history.gameStats.lost &&
			       !history.highScores.length, "new database could not query its index");
		});
		output.textContent += "\n" + passed.length + " tests passed";
		return true;
	} catch (error) {
		output.textContent += "\nFAIL " + error.stack;
		return false;
	} finally {
		Object.defineProperty(window, "indexedDB", indexedDescriptor);
		Object.defineProperty(window, "localStorage", localDescriptor);
		factory.deleteDatabase(database);
	}
})();
