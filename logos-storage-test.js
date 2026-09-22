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
		await test("append and reopen existing run history", async function() {
			assert((await accessRunHistory(win)).length == 1, "win did not save");
			assert((await accessRunHistory(loss)).length == 2, "loss did not save");
			const runs = await accessRunHistory();
			assert(runs.length == 2 && runs[0].id == win.id &&
			       runs[1].id == loss.id && win.id != loss.id,
			       "run keys or saved records were lost on reopening");
		});
		await test("import legacy scores without duplicating recorded wins", async function() {
			storage.setItem("highScores", legacy);
			storage.setItem("gameStats", JSON.stringify({ won: 99, lost: 88 }));
			storage.setItem("soundEffects", "false");
			storage.setItem("multiplayerPlayerName", "test player");
			const runs = await accessRunHistory();
			assert(runs.length == 4 && runs.filter(run => run.outcome == "won").length == 3,
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
			assert((await accessRunHistory()).length == 4,
			       "repeating the migration duplicated scores");
		});
		await test("new runs are appended even when their score matches", async function() {
			const repeated = Object.assign({}, win);
			delete repeated.id;
			const runs = await accessRunHistory(repeated);
			assert(runs.length == 5 && repeated.id != win.id,
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
			assert((await accessRunHistory()).length == 5 && !values.has("highScores"),
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
			assert((await accessRunHistory()).length == 6 && !values.has("highScores"),
			       "retry after abort did not import exactly one score");
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
