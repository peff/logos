import {
	Logos, FakeElement, assert, makePuzzle, withRunHistory,
} from "./logos-test-helpers.js";

Deno.test("daily attempts remember the first result and share a fixed date", async function() {
	const oldWindow = globalThis.window;
	const oldValues = localStorage.values;
	const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	const copied = [];
	localStorage.values = {};
	globalThis.window = new FakeElement();
	window.location = { href: "https://example.com/#daily" };
	Object.defineProperty(navigator, "clipboard", { configurable: true,
		value: { async writeText(text) { copied.push(text); } } });
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.options.hidden = puzzle.scores.hidden = true;
	const modal = document.querySelector("#daily-menu");
	modal.hidden = true;
	try {
		await withRunHistory(async runs => {
			for (const date of ["20260229", "20261301", "20261000", "abcd1234"])
				assert(!await puzzle.openDaily(date), "invalid daily date accepted");
			assert(await puzzle.loadURLSeed("https://example.com/#daily=20261008"));
			assert(puzzle.seed === 0x20261008 && puzzle.pendingSeed === puzzle.seed);
			const identity = puzzle.gameIdentity;
			await puzzle.openDaily("20261008");
			assert(puzzle.gameIdentity === identity, "daily entry restarted the attempt");
			await puzzle.startGame();
			puzzle.stopTimer();
			puzzle.timerElapsed = 83000;
			puzzle.gameOver = true;
			await puzzle.finishRun("lost");
			assert(!modal.hidden && puzzle.scores.hidden, "daily result was not shown alone");
			assert((await puzzle.getDailyResult("20261008")).outcome === "lost");
			puzzle.scoreEligible = false;
			await puzzle.finishRun("won");
			assert((await puzzle.getDailyResult("20261008")).outcome === "lost", "continuation replaced result");
			assert(puzzle.displayedDailyResult.completionRunId === runs[1].id &&
			       !modal.querySelector(".daily-completion").hidden,
			       "daily result did not acknowledge the Zen completion");
			await puzzle.copyDailyResult();
			assert(copied[0] === "Logos daily · 2026-10-08\nLost · 1:23\nLater solved ∞\nhttps://example.com/#daily=20261008");
			const original = (await puzzle.getDailyResult("20261008")).runId;
			await puzzle.openDailyChronicle();
			assert(modal.hidden && puzzle.selectedRun === original &&
			       !puzzle.scores.querySelector(".history-view").hidden,
			       "daily Chronicle link did not select the original loss");
			await puzzle.toggleScores();
			assert(!modal.hidden, "Chronicle did not return to the daily result");
			puzzle.closeDailyResult();
			const restored = makePuzzle(6);
			restored.options.hidden = true;
			assert(await restored.openDaily("20261008") && restored.seed === 0x20261008 &&
			       restored.pendingSeed === restored.seed && restored.gameOver &&
			       restored.dailyResultOpen && restored.timerTimeout === null,
			       "completed daily did not show its preview and saved result after reload");
			puzzle.newGame("20261008", true);
			assert(!puzzle.daily && !puzzle.runRecord("won").daily, "regular replay retained daily identity");
			await puzzle.openDaily("20261009");
			puzzle.pendingSeed = undefined;
			puzzle.scoreEligible = false;
			puzzle.gameOver = true;
			await puzzle.finishRun("won");
			assert((await puzzle.getDailyResult("20261009")).assisted, "assisted completion was not remembered");
			await puzzle.openDailyChronicle();
			assert(puzzle.selectedRun === (await puzzle.getDailyResult("20261009")).runId,
			       "untimed result did not link to its Chronicle entry");
			await puzzle.toggleScores();
			puzzle.closeDailyResult();
			await puzzle.openDaily("20261010");
			runs.push({ id: 100, daily: "20261010", outcome: "won", elapsed: 1000 });
			assert(!await puzzle.startGame() && puzzle.gameOver && !modal.hidden,
			       "invitation allowed a date finished by another tab");
			puzzle.closeDailyResult();
			await puzzle.openDaily("20261011");
			puzzle.closeInvitation();
			assert(await puzzle.startGame() && puzzle.pendingSeed === undefined &&
			       puzzle.daily === "20261011", "Options could not start a declined daily");
			puzzle.stopTimer();
			const picker = puzzle.invitation.querySelector("#invitation-title").children.at(-1).children[2];
			picker.value = "2026-10-08";
			picker.validity = { valid: true };
			await picker.onchange();
			assert(!modal.hidden && !puzzle.invitation.hidden &&
			       puzzle.invitation.querySelector(".invitation-prompt").hidden &&
			       puzzle.displayedDailyResult.date === "20261008" &&
			       puzzle.seed === 0x20261008 && puzzle.pendingSeed === puzzle.seed,
			       "choosing a completed date did not swap the tablet interior");
			const resultPicker = puzzle.invitation.querySelector("#invitation-title").children.at(-1).children[2];
			resultPicker.value = "2026-10-07";
			resultPicker.validity = { valid: true };
			await resultPicker.onchange();
			assert(modal.hidden && !puzzle.invitation.hidden && puzzle.daily === "20261007" &&
			       puzzle.pendingSeed === 0x20261007,
			       "choosing an unplayed date did not show only its board invitation");
			await puzzle.invitation.querySelector("#invitation-title").children.at(-1).children[0].onclick();
			assert(puzzle.daily === "20261006", "previous-day arrow did not move back one day");
			await puzzle.invitation.querySelector("#invitation-title").children.at(-1).children[3].onclick();
			assert(puzzle.daily === "20261007", "next-day arrow did not move forward one day");
			assert(!Object.keys(localStorage.values).some(key => key.startsWith("daily-")),
			       "daily results still used separate localStorage records");
		});
	} finally {
		puzzle.stopTimer();
		modal.hidden = true;
		localStorage.values = oldValues;
		if (oldWindow === undefined) delete globalThis.window;
		else globalThis.window = oldWindow;
		if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
		else delete navigator.clipboard;
	}
});

Deno.test("daily results wait for history and report earned Pantheon places", async function() {
	const oldWindow = globalThis.window;
	const oldValues = localStorage.values;
	localStorage.values = {};
	globalThis.window = new FakeElement();
	window.location = { href: "https://example.com/#daily" };
	const modal = document.querySelector("#daily-menu");
	let release;
	try {
		for (const [index, scenario] of ["placed", "unranked", "failed", "new-game"].entries()) {
			const date = "202610" + (12 + index);
			const pending = new Promise(resolve => { release = resolve; });
			let recorded, writes = 0;
			Logos.setHistoryStorage(async run => {
				if (run) await pending;
				if (scenario == "failed" && run) return null;
				if (run) {
					run.id = 2;
					recorded = { ...run };
					writes++;
				}
				return {
					highScores: scenario == "unranked" ? [] :
						[{ id: 1, elapsed: 1 }, ...(recorded ? [recorded] : [])],
					gameStats: { won: 2, lost: 0 },
					runs: recorded ? [recorded] : [],
				};
			});
			const puzzle = makePuzzle(6);
			puzzle.say = function() {};
			puzzle.options.hidden = puzzle.scores.hidden = modal.hidden = true;
			await puzzle.openDaily(date);
			puzzle.gameOver = true;
			puzzle.timerElapsed = 123000;
			const saving = puzzle.finishRun("won");
			assert(modal.hidden, "daily result opened before saving");
			if (scenario == "new-game") puzzle.newGame("42", true);
			release();
			await saving;
			assert(puzzle.scores.hidden, "daily opened the Pantheon separately");
			if (scenario == "new-game") {
				assert(modal.hidden, "late daily save interrupted a new game");
				continue;
			}
			assert(!modal.hidden, "daily result did not open after saving");
			const result = puzzle.displayedDailyResult;
			if (scenario == "placed") {
				assert(result.pantheonPlace == 2 &&
				       result.pantheonLevel == puzzle.pantheonLevel &&
				       !modal.querySelector(".daily-pantheon-link").hidden &&
				       result.runId === 2,
				       "daily result omitted its earned place");
				puzzle.closeDailyResult();
				await puzzle.openDaily(date);
				assert(!modal.querySelector(".daily-pantheon-link").hidden,
				       "reopening the saved result lost its placement");
			} else {
				assert(modal.querySelector(".daily-pantheon-link").hidden,
				       "unranked result claimed a Pantheon place");
			}
			assert(modal.querySelector(".daily-history-error").hidden == (scenario != "failed"),
			       "history failure was not reflected in the daily result");
			assert(modal.querySelector(".daily-result-link").disabled === (scenario == "failed"),
			       "Chronicle link availability did not reflect the saved record");
			await puzzle.openDailyChronicle();
			if (scenario == "failed") {
				assert(!modal.hidden && puzzle.scores.hidden, "unsaved result opened the Chronicle");
			} else {
				assert(modal.hidden && puzzle.selectedRun === result.runId &&
				       puzzle.historyBody.children[0].className === "history-selected",
				       "Chronicle did not highlight the daily entry");
				await puzzle.toggleScores();
				assert(!modal.hidden, "Chronicle close did not restore daily result");
			}
			if (scenario == "placed") {
				/* The link should choose its own ranking, even after browsing another. */
				puzzle.pantheonLevel = "all";
				puzzle.pantheonMultiplayer = true;
				await puzzle.openDailyPantheon();
				assert(modal.hidden && !puzzle.scores.hidden &&
				       puzzle.pantheonLevel === result.pantheonLevel &&
				       !puzzle.pantheonMultiplayer &&
				       puzzle.highlightedScore === puzzle.highScores[1] && writes === 1,
				       "daily link did not open the right ranking with the saved score highlighted");
				assert(puzzle.pantheonTablets[result.pantheonLevel].querySelector("ol").children[1].className === "score-new",
				       "daily score did not receive the usual visual highlight");
				await puzzle.toggleScores();
				assert(!modal.hidden && puzzle.scores.hidden && puzzle.displayedDailyResult.date === date,
				       "closing the Pantheon did not return to the daily result");
				await puzzle.openDailyPantheon();
				await puzzle.showRunHistory(result.runId);
				assert(!puzzle.scores.querySelector(".history-view").hidden,
				       "daily Pantheon could not open the Chronicle");
				await puzzle.toggleScores();
				assert(!modal.hidden && puzzle.scores.hidden,
				       "closing the Chronicle did not return to the daily result");
				puzzle.closeDailyResult();
				await puzzle.toggleScores();
				await puzzle.toggleScores();
				assert(modal.hidden, "ordinary Pantheon visit reopened the daily result");
				puzzle.showDailyResult(result);
				await puzzle.openDailyPantheon();
				puzzle.newGame("42", true);
				await puzzle.toggleScores();
				assert(modal.hidden, "closing scores after a new game reopened a stale daily result");
			}
			puzzle.closeDailyResult();
		}
	} finally {
		release?.();
		Logos.setHistoryStorage(Logos.accessRunHistory);
		modal.hidden = true;
		localStorage.values = oldValues;
		if (oldWindow === undefined) delete globalThis.window;
		else globalThis.window = oldWindow;
	}
});

Deno.test("arrow keys navigate Chronicle leaves", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		document.modals = [puzzle.scores];
		let prevented = 0;
		const press = key => document.listeners.keydown({
			key, preventDefault() { prevented++; },
		});
		try {
			press("ArrowLeft");
			assert(puzzle.historyPage == 0, "escaped the first Chronicle leaf");
			press("ArrowRight");
			assert(puzzle.historyPage == 1 && puzzle.historyViewport.focused,
			       "did not advance the Chronicle with focus on its viewport");
			press("ArrowRight");
			assert(puzzle.historyPage == 1, "escaped the last Chronicle leaf");
			press("ArrowLeft");
			assert(puzzle.historyPage == 0 && prevented == 4,
			       "did not return to the first Chronicle leaf");
		} finally {
			document.modals = [];
		}
	}, Array.from({ length: 9 }, (_, i) => ({
		date: i, seed: i, elapsed: i, outcome: "won",
	})));
});

Deno.test("a winning score opens the Pantheon after saving", async function() {
	await withRunHistory(async function(runs) {
		const puzzle = makePuzzle(1, true);
		puzzle.seed = 0x1234abcd;
		puzzle.scores.hidden = true;
		puzzle.timerElapsed = 5000;
		for (const slot of puzzle.rows[0].slots)
			slot.displaySingle();
		const saved = puzzle.checkWin();
		assert(puzzle.gameOver, "winning waited for storage");
		await saved;
		puzzle.checkWin();
		assert(!puzzle.scores.hidden && runs.length == 1 &&
		       puzzle.highlightedScore === puzzle.highScores[0],
		       "win was duplicated or did not open the Pantheon");
		const item = puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector("ol").children[0];
		const button = item.children[0];
		assert(item.className == "score-new", "new score lacked its highlight");
		await button.listeners.click.call(button);
		const body = puzzle.historyBody;
		assert(!puzzle.scores.querySelector(".history-view").hidden &&
		       body.children[0].className == "history-selected" &&
		       body.children[0].children[3].textContent == "1234abcd",
		       "score did not open its history entry with its seed");
		const link = body.children[0].children[3].children[0];
		assert(link.href == "#seed=1234abcd" && typeof link.onclick == "function",
		       "Chronicle seed did not provide a URL and an in-page action");
	});
});

Deno.test("opening the Pantheon refreshes runs and retains highlights by key", async function() {
	await withRunHistory(async function(runs, reads) {
		const puzzle = makePuzzle(1);
		puzzle.gameOver = true;
		assert(reads() == 0, "initialization read history");
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		assert(puzzle.scores.querySelector(".games-sought-unit").textContent == "time",
		       "singular game count was not rendered");
		puzzle.highlightedScore = puzzle.highScores[0];
		/* Another tab records a faster win with the same seed. */
		runs.push({ id: 2, date: 2, seed: 123, elapsed: 500, outcome: "won" });
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		assert(puzzle.highScores[0].id == 2 &&
		       puzzle.highlightedScore === puzzle.highScores[1] &&
		       puzzle.scores.querySelector(".games-sought").textContent == 2,
		       "refresh lost the highlight or used stale totals");
		runs.splice(0, 1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		assert(!puzzle.highScores.includes(puzzle.highlightedScore),
		       "a removed score remained in the highlighted ranking");
	}, [{ date: 1, seed: 123, elapsed: 1000, outcome: "won" }]);
});

Deno.test("pending saves capture the finished game and do not interrupt a new one", async function() {
	let release;
	const gate = new Promise(resolve => { release = resolve; });
	let recorded;
	Logos.setHistoryStorage(async function(run) {
		await gate;
		recorded = structuredClone(run);
		run.id = 1;
		return { highScores: [Object.assign({}, run)], gameStats: { won: 1, lost: 0 } };
	});
	try {
		const puzzle = makePuzzle(6, true);
		puzzle.newGame(123);
		puzzle.stopTimer();
		puzzle.timerElapsed = 1500;
		puzzle.scores.hidden = true;
		for (const row of puzzle.rows)
			for (const slot of row.slots)
				slot.displaySingle();
		const before = Date.now();
		const saved = puzzle.checkWin();
		const after = Date.now();
		puzzle.say = function() {};
		puzzle.newGame(456);
		puzzle.stopTimer();
		release();
		await saved;
		assert(recorded.date >= before && recorded.date <= after &&
		       recorded.seed == 123 && recorded.elapsed == 1500 &&
		       recorded.rows == 6 && recorded.columns == 6 &&
		       recorded.generatorVersion == 1 && puzzle.scores.hidden,
		       "pending save used the new game or interrupted it");
	} finally {
		release();
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
});

Deno.test("continued losses record the first mistake and an untimed completion", async function() {
	await withRunHistory(async function(runs) {
		const puzzle = makePuzzle(1, true);
		puzzle.seed = 456;
		puzzle.timerElapsed = 700;
		puzzle.continueAfterLoss = true;
		puzzle.lose("first loss");
		await puzzle.toggleScores();
		puzzle.lose("practice mistake");
		for (const slot of puzzle.rows[0].slots)
			slot.displaySingle();
		await puzzle.checkWin();
		assert(runs.length == 2 && runs[0].outcome == "lost" &&
		       runs[0].elapsed == 700 && puzzle.gameStats.lost == 1 &&
		       runs[1].outcome == "won" && !("elapsed" in runs[1]),
		       "continued play did not preserve the loss and add an untimed completion");
		puzzle.renderHighScores();
		assert(puzzle.scores.querySelector(".games-won").textContent == 0,
		       "loss counted as a win");
	});
});

Deno.test("daily continuations share each outcome but defer the loss dialog", async function() {
	await withRunHistory(async function(runs) {
		const puzzle = makePuzzle(1, true);
		puzzle.seed = 0x20261010;
		puzzle.daily = "20261010";
		puzzle.timerElapsed = 700;
		puzzle.continueAfterLoss = true;
		let shared = 0, saving;
		const shown = [];
		puzzle.dailyScoreSaved = () => { shared++; };
		puzzle.showDailyResult = result => shown.push(result);
		puzzle.finishRun = outcome => saving = puzzle.recordOutcome(outcome);
		puzzle.lose("first loss");
		await saving;
		assert(runs.length === 1 && shared === 1 && !shown.length &&
		       !puzzle.gameOver && puzzle.practiceMode,
		       "continued daily loss was not shared silently");
		for (const slot of puzzle.rows[0].slots) slot.displaySingle();
		await puzzle.checkWin();
		assert(runs.length === 2 && shared === 2 && shown.length === 1 &&
		       shown[0].outcome === "lost" && shown[0].elapsed === 700 &&
		       shown[0].completionRunId === runs[1].id,
		       "daily completion was not shared and shown alongside the loss");
	});
});

Deno.test("Zen completions appear in the Chronicle without affecting rankings", async function() {
	await withRunHistory(async function(runs) {
		const puzzle = makePuzzle(6, true);
		puzzle.newGame(42, true);
		puzzle.setPracticeMode(true);
		puzzle.scores.hidden = true;
		for (const row of puzzle.rows)
			for (const slot of row.slots)
				slot.displaySingle();
		await puzzle.checkWin();
		assert(runs.length == 3 && runs[2].outcome == "won" && !("elapsed" in runs[2]),
		       "Zen completion did not produce an untimed Chronicle record");
		assert(puzzle.scores.hidden && puzzle.highScores.length == 1 &&
		       puzzle.gameStats.won == 1 && puzzle.gameStats.lost == 1,
		       "Zen completion affected the Pantheon or its statistics");
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory(runs[2].id);
		const body = puzzle.historyBody;
		assert(body.children[0].children[2].title === "Untimed completion",
		       "Chronicle did not display infinity for the untimed completion");
		for (const sort of ["fastest", "slowest"]) {
			puzzle.historySort = sort;
			puzzle.renderRunHistory();
			assert(body.children[2].children[2].title === "Untimed completion" &&
			       body.children[0].children[3].textContent === (sort == "fastest" ? "00000001" : "00000002"),
			       "time sorting did not put untimed completions after timed runs");
		}
		localStorage.removeItem("practiceMode");
	}, [
		{ date: 1, seed: 1, elapsed: 1000, outcome: "won" },
		{ date: 2, seed: 2, elapsed: 2000, outcome: "lost" },
	]);
});

Deno.test("daily lookup uses the first marked entry, not the seed or finish clock", async function() {
	await withRunHistory(async function(runs) {
		const puzzle = makePuzzle(6);
		const result = await puzzle.getDailyResult("20261008");
		assert(result.runId === runs[1].id && result.outcome === "lost" && result.elapsed === 2000,
		       "daily lookup chose an ordinary replay or a later untimed completion");
	}, [
		{ date: 1, seed: 0x20261008, elapsed: 1000, outcome: "won" },
		{ date: 100, seed: 0x20261008, daily: "20261008", elapsed: 2000, outcome: "lost" },
		{ date: 50, seed: 0x20261008, daily: "20261008", outcome: "won" },
	]);
});

Deno.test("failed daily reads do not offer a fresh attempt", async function() {
	Logos.setHistoryStorage(async () => null);
	try {
		const puzzle = makePuzzle(6);
		puzzle.options.hidden = true;
		let message;
		puzzle.say = text => { message = text; };
		assert(!await puzzle.openDaily("20261008") && puzzle.seed === undefined &&
		       message === "The Chronicle could not be loaded.",
		       "failed daily lookup was treated as an unplayed date");
	} finally {
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
});

Deno.test("a pending daily lookup cannot interrupt a new game", async function() {
	let release;
	Logos.setHistoryStorage(() => new Promise(resolve => { release = resolve; }));
	try {
		const puzzle = makePuzzle(6);
		puzzle.options.hidden = true;
		puzzle.say = function() {};
		const opening = puzzle.openDaily("20261008");
		puzzle.newGame(42, true);
		release({ runs: [], highScores: [] });
		assert(!await opening && puzzle.seed === 42 && !puzzle.daily,
		       "delayed daily lookup replaced the new puzzle");
	} finally {
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
});

Deno.test("run history sorts and filters without hiding unknown dates", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		puzzle.gameOver = true;
		await puzzle.showRunHistory();
		const body = puzzle.historyBody;
		const seeds = () => body.children.map(row => row.children[3].textContent).join(",");
		assert(seeds() == "00000002,00000001,—", "history was not newest first");
		for (const [column, direction, expected] of [
			["date", "ascending", "00000001,00000002,—"],
			["time", "ascending", "00000002,—,00000001"],
			["time", "descending", "00000001,—,00000002"],
		]) {
			puzzle.sortRunHistory(column);
			assert(seeds() == expected &&
			       puzzle.scores.querySelector(".history-" + column + "-sort").attributes["aria-sort"] == direction,
			       "wrong order or indicator for " + column + " " + direction);
		}
		const wins = puzzle.scores.querySelector(".history-wins");
		const losses = puzzle.scores.querySelector(".history-losses");
		wins.checked = false;
		puzzle.renderRunHistory();
		assert(seeds() == "00000002", "loss filter included wins");
		wins.checked = true;
		losses.checked = false;
		puzzle.renderRunHistory();
		assert(seeds() == "00000001,—", "win filter omitted legacy run");
		wins.checked = false;
		puzzle.renderRunHistory();
		assert(body.children.length == 0 &&
		       puzzle.scores.querySelector(".history-status").textContent == "No runs match this filter.",
		       "unchecking both results did not show an empty list");
		assert(puzzle.scores.querySelector(".modal-close").value == "Claude librum",
		       "history did not label its close button");
		await puzzle.toggleScores();
		assert(puzzle.scores.hidden, "closing the Chronicle did not dismiss the modal");
		await puzzle.toggleScores();
		assert(puzzle.scores.querySelector(".history-view").hidden &&
		       puzzle.scores.querySelector(".modal-close").value == "Rejoin the mortal realm",
		       "reopening did not return to the Pantheon");
		puzzle.resumeAfterModal = true;
		await puzzle.showRunHistory();
		assert(puzzle.scores.querySelector(".modal-close").value == "Claude librum",
		       "Chronicle did not retain its compact close label during play");
		puzzle.scores.listeners.cancel({ preventDefault() {} });
		assert(puzzle.scores.hidden, "cancellation did not dismiss the Chronicle");
	}, [
		{ date: 1, elapsed: 300, seed: 1, outcome: "won" },
		{ date: 2, elapsed: 100, seed: 2, outcome: "lost" },
		{ date: null, elapsed: 200, outcome: "won" },
	]);
});

Deno.test("Chronicle swipes recycle only neighboring leaves", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		const viewport = puzzle.historyViewport;
		viewport.clientWidth = 400;
		await puzzle.showRunHistory();
		assert(viewport.children.length == 2 && puzzle.historyPage == 0,
		       "first leaf did not have just one neighbor");
		const previous = puzzle.scores.querySelector(".history-folio .help-page-previous");
		const next = puzzle.scores.querySelector(".history-folio .help-page-next");
		const number = puzzle.scores.querySelector(".history-folio .help-page-number");
		viewport.scrollLeft = 250;
		viewport.listeners.scroll();
		assert(puzzle.historyPage == 1 && number.textContent == "Leaf II of V" &&
		       !previous.disabled && !next.disabled && puzzle.historyRenderedPage == 0 &&
		       viewport.children.length == 2 && viewport.scrollLeft == 250,
		       "scrolling did not update the footer without recycling leaves");
		viewport.scrollLeft = 100;
		viewport.listeners.scroll();
		assert(puzzle.historyPage == 0 && previous.disabled && number.textContent == "Leaf I of V",
		       "reversing a drag did not restore the footer");
		viewport.scrollLeft = 400;
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 1 && viewport.children.length == 3 &&
		       viewport.children[1] == puzzle.historyTable,
		       "first swipe did not expose both neighbors");
		viewport.scrollLeft = 800;
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 2 && puzzle.historyWindowStart == 1 &&
		       viewport.scrollLeft == 400 && viewport.children.length == 3,
		       "second swipe did not recenter the three-leaf window");
		assert(viewport.children[0].inert && viewport.children[2].inert,
		       "neighboring leaves remained interactive");
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 2, "recentering triggered an extra turn");
		viewport.scrollLeft = 0;
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 1 && viewport.scrollLeft == 400,
		       "reverse swipe lost its place");
		puzzle.renderRunHistory(99);
		assert(puzzle.historyPage == 4 && viewport.children.length == 2,
		       "last leaf had an extra neighbor");
		viewport.scrollLeft = 100;
		viewport.listeners.scroll();
		assert(puzzle.historyPage == 3 && !next.disabled,
		       "dragging away from the last leaf did not enable Next");
		viewport.scrollLeft = 300;
		viewport.listeners.scroll();
		assert(puzzle.historyPage == 4 && next.disabled && number.textContent == "Leaf V of V",
		       "dragging to the last leaf did not disable Next promptly");
		puzzle.renderRunHistory(puzzle.historyPage - 1);
		assert(puzzle.historyPage == 3,
		       "button navigation did not follow the leaf shown during scrolling");
		puzzle.sortRunHistory("time");
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 0 && viewport.scrollLeft == 0,
		       "sorting retained the old scroll position");
		puzzle.scores.hidden = true;
		viewport.scrollLeft = 400;
		viewport.listeners.scrollend();
		assert(puzzle.historyPage == 0, "a closed Chronicle handled a late scroll");
	}, Array.from({ length: 33 }, (_, i) => ({
		date: i, elapsed: i, outcome: "won",
		difficulty: { version: 1, level: "easy", score: 20 },
	})));
});

Deno.test("Pantheon swipes select levels without interrupting native scrolling", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		const viewport = puzzle.pantheonViewport;
		viewport.clientWidth = 400;
		viewport.scrollLeft = 790;
		await viewport.listeners.scroll();
		assert(puzzle.pantheonLevel == "medium" && viewport.scrollLeft == 790 &&
		       puzzle.highScores.length == 1,
		       "swipe did not select Medium without repositioning the viewport");
		assert(puzzle.pantheonTablets.all.inert && !puzzle.pantheonTablets.medium.inert,
		       "offscreen rankings remained interactive");
		await puzzle.selectPantheon("hard");
		assert(viewport.scrollLeft == 1200 && puzzle.highScores.length == 0,
		       "level button did not position the empty ranking");
		await puzzle.toggleScores();
		viewport.scrollLeft = 0;
		await viewport.listeners.scroll();
		assert(puzzle.pantheonLevel == "hard", "a closed Pantheon handled a late scroll");
	}, [{ date: 1, elapsed: 100, outcome: "won",
	      difficulty: { version: 1, level: "medium", score: 50 } }]);
});

Deno.test("Pantheon keys retarget smooth scrolling without selecting intermediate levels", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		const viewport = puzzle.pantheonViewport;
		viewport.clientWidth = 400;
		viewport.scrollLeft = 0;
		const scrolls = [];
		viewport.scrollTo = options => scrolls.push(options);
		globalThis.matchMedia = () => ({ matches: false });
		document.modals = [puzzle.scores];
		const select = puzzle.selectPantheon;
		let pending;
		puzzle.selectPantheon = function(...args) {
			return pending = select.apply(this, args);
		};
		let prevented = 0;
		const press = key => document.listeners.keydown({
			key, preventDefault() { prevented++; },
		});
		try {
			press("ArrowRight");
			press("ArrowRight");
			press("ArrowRight");
			await pending;
			assert(prevented == 3 && puzzle.pantheonViewport.focused &&
			       puzzle.pantheonLevel == "hard" &&
			       scrolls.map(s => s.left).join() == "400,800,1200" &&
			       scrolls.every(s => s.behavior == "smooth"),
			       "repeated keys did not retarget the pending scroll");
			viewport.scrollLeft = 400;
			await viewport.listeners.scroll();
			assert(puzzle.pantheonLevel == "hard", "intermediate tablet replaced the destination");
			press("ArrowLeft");
			await pending;
			assert(puzzle.pantheonLevel == "medium" && scrolls.at(-1).left == 800,
			       "reverse key did not use the selected destination");
			viewport.scrollLeft = 801.5;
			await viewport.listeners.scroll();
			assert(puzzle.pantheonScroll.target === null, "arrival retained the pending scroll");
			await puzzle.selectPantheon("all");
			viewport.listeners.wheel();
			viewport.scrollLeft = 400;
			await viewport.listeners.scroll();
			assert(puzzle.pantheonLevel == "easy", "direct scrolling did not take over");
			globalThis.matchMedia = () => ({ matches: true });
			const count = scrolls.length;
			await puzzle.selectPantheon("hard");
			assert(viewport.scrollLeft == 1200 && scrolls.length == count,
			       "reduced motion did not jump to the selected tablet");
		} finally {
			document.modals = [];
			delete globalThis.matchMedia;
		}
	}, []);
});

Deno.test("Chronicle turns extend the moving strip and trim it after settling", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		const viewport = puzzle.historyViewport;
		viewport.clientWidth = 400;
		viewport.onscrollend = null;
		const scrolls = [];
		viewport.scrollTo = options => scrolls.push(options);
		globalThis.matchMedia = () => ({ matches: false });
		try {
			await puzzle.showRunHistory();
			puzzle.turnHistoryPage(1);
			assert(puzzle.historyPage == 1 && puzzle.historyRenderedPage == 0 &&
			       scrolls[0].behavior == "smooth", "single Chronicle turn did not animate");
			viewport.scrollLeft = 100;
			viewport.listeners.scroll();
			assert(puzzle.historyPage == 1, "scrolling overwrote the intended leaf");
			puzzle.turnHistoryPage(1);
			puzzle.turnHistoryPage(1);
			assert(puzzle.historyPage == 3 && puzzle.historyRenderedPage == 0 &&
			       viewport.scrollLeft == 100 && viewport.children.length == 4 &&
			       scrolls.at(-1).left == 1200,
			       "rapid forward turns did not extend and retarget the moving strip");
			viewport.listeners.scrollend();
			assert(puzzle.historyRenderedPage == 0, "an interrupted scroll recycled too early");
			puzzle.turnHistoryPage(-1);
			viewport.scrollLeft = 800;
			viewport.listeners.scrollend();
			assert(puzzle.historyRenderedPage == 2 && viewport.children.length == 3 &&
			       puzzle.historyWindowStart == 1 && viewport.scrollLeft == 400,
			       "settling did not trim the extended strip");
			puzzle.turnHistoryPage(-1);
			viewport.scrollLeft = 250;
			puzzle.turnHistoryPage(-1);
			assert(puzzle.historyPage == 0 && puzzle.historyWindowStart == 0 &&
			       viewport.scrollLeft == 650 && scrolls.at(-1).left == 0 &&
			       viewport.children.length == 4,
			       "prepending a leaf did not preserve the visible position");
			viewport.scrollLeft = 0;
			viewport.listeners.scrollend();
			assert(puzzle.historyRenderedPage == 0 && viewport.children.length == 2,
			       "backward settling did not trim the strip");
			puzzle.turnHistoryPage(1);
			puzzle.turnHistoryPage(1);
			puzzle.turnHistoryPage(-1);
			puzzle.turnHistoryPage(-1);
			viewport.listeners.scrollend();
			assert(viewport.children.length == 2 && !puzzle.historyWindowExpanded,
			       "returning to the original leaf retained extra pages");
			const count = scrolls.length;
			globalThis.matchMedia = () => ({ matches: true });
			puzzle.turnHistoryPage(1);
			assert(puzzle.historyRenderedPage == 1 && scrolls.length == count,
			       "reduced motion animated a Chronicle turn");
		} finally {
			delete globalThis.matchMedia;
		}
	}, Array.from({ length: 40 }, (_, i) => ({
		date: i, elapsed: i, outcome: "won",
		difficulty: { version: 1, level: "easy", score: 20 },
	})));
});

Deno.test("Roman leaf numbers use subtractive notation", function() {
	for (const [number, expected] of [
		[1, "I"], [3, "III"], [4, "IV"], [9, "IX"], [14, "XIV"],
		[49, "XLIX"], [99, "XCIX"], [444, "CDXLIV"],
		[2026, "MMXXVI"], [3999, "MMMCMXCIX"], [4000, "MMMM"],
	])
		assert(Logos.romanNumeral(number) == expected, "wrong numeral for " + number);
});

Deno.test("Chronicle follows the highlighted run when sorting and filtering", async function() {
	await withRunHistory(async function() {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory(2);
		const body = puzzle.historyBody;
		const highlighted = () => body.children.some(row => row.className == "history-selected");
		assert(puzzle.historyPage == 2 && highlighted(),
		       "link did not open the selected run's leaf");
		puzzle.renderRunHistory(1);
		assert(body.children.length == 8 && puzzle.historyPage == 1 && !highlighted(),
		       "highlight prevented an explicit page turn");
		puzzle.sortRunHistory("time");
		assert(puzzle.historyPage == 0 && highlighted(),
		       "ascending sort lost the highlighted run");
		puzzle.sortRunHistory("time");
		assert(puzzle.historyPage == 2 && highlighted(),
		       "descending sort lost the highlighted run");
		const wins = puzzle.scores.querySelector(".history-wins");
		puzzle.scores.querySelector(".history-losses").checked = false;
		puzzle.renderRunHistory();
		assert(puzzle.historyPage == 1 && body.children.length == 1 && highlighted() &&
		       puzzle.scores.querySelector(".history-folio .help-page-next").disabled,
		       "filter did not follow the highlight to its new leaf");
		wins.checked = false;
		puzzle.renderRunHistory();
		assert(puzzle.historyPage == 0 && !highlighted(),
		       "excluding the highlighted run did not return to the first leaf");
		wins.checked = true;
		puzzle.renderRunHistory();
		assert(puzzle.historyPage == 1 && highlighted(),
		       "restoring the filter lost the highlighted run");
		await puzzle.showRunHistory();
		puzzle.renderRunHistory(2);
		puzzle.sortRunHistory("time");
		assert(puzzle.historyPage == 0, "unselected sorting did not return to the first leaf");
		puzzle.renderRunHistory(2);
		puzzle.scores.querySelector(".history-losses").checked = false;
		puzzle.renderRunHistory();
		assert(puzzle.historyPage == 0, "unselected filtering did not return to the first leaf");
	}, Array.from({ length: 19 }, (_, i) => ({
		date: i, seed: i, elapsed: i, outcome: i % 2 ? "won" : "lost",
	})));
});

Deno.test("history failures display errors instead of an empty Pantheon", async function() {
	Logos.setHistoryStorage(async function() { return null; });
	try {
		const puzzle = makePuzzle(1);
		await puzzle.recordOutcome("won");
		assert(puzzle.messages.innerHTML == "Your result could not be saved.",
		       "failed save did not report an error");
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		const status = puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector(".scores-status");
		assert(!puzzle.scores.hidden && !status.hidden &&
		       status.textContent == "The Chronicle could not be loaded." &&
		       puzzle.scores.querySelector(".game-stats").hidden &&
		       puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector(".scores-empty").hidden,
		       "failed read displayed an empty Pantheon instead of an error");
		await puzzle.showRunHistory();
		assert(puzzle.scores.querySelector(".history-status").textContent ==
		       "The Chronicle could not be loaded." &&
		       puzzle.historyTable.hidden,
		       "history browser concealed a storage failure");
	} finally {
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
});

Deno.test("Olympiad years begin in July", function() {
	assert(Logos.formatOlympiad(new Date(2025, 6, 1).getTime()) ==
	       "Olympiad 701.1", "701st Olympiad began in the wrong year");
	assert(Logos.formatOlympiad(new Date(2026, 5, 30).getTime()) ==
	       "Olympiad 701.1", "Olympiad year ended too early");
	assert(Logos.formatOlympiad(new Date(2026, 6, 1).getTime()) ==
	       "Olympiad 701.2", "Olympiad year did not advance in July");
});

Deno.test("score dates use Greek numerals for the day", function() {
	assert(Logos.greekNumeralDay(new Date(2026, 7, 6).getTime()) == "ϛʹ",
	       "sixth day did not use stigma");
	assert(Logos.greekNumeralDay(new Date(2026, 7, 12).getTime()) == "ιβʹ",
	       "twelfth day used the wrong Greek numeral");
	assert(Logos.greekNumeralDay(new Date(2026, 7, 31).getTime()) == "λαʹ",
	       "thirty-first day used the wrong Greek numeral");
});

Deno.test("Chronicle backfills only visible supported runs and reuses their ratings", async () => {
	const initial = Array.from({ length: 10 }, (_, i) => ({
		date: i, seed: 0x98079244, elapsed: i, outcome: "won",
		rows: 6, columns: 6, generatorVersion: 1,
	}));
	initial[9].difficulty = { version: 1, score: 75, level: "hard" };
	initial[8].generatorVersion = 99;
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const body = puzzle.historyBody;
		const text = i => body.children[i].children[4].textContent;
		assert(text(0) == "Hard" && text(1) == "—" && text(2) == "…");
		await puzzle.historyDifficultyTask;
		assert(text(2) == "Easy");
		assert(!puzzle.runHistory[0].difficulty && !puzzle.runHistory[1].difficulty,
		       "backfilled runs outside the visible page");
		const cached = puzzle.runHistory[7].difficulty;
		puzzle.renderRunHistory(0);
		await puzzle.historyDifficultyTask;
		assert(puzzle.runHistory[7].difficulty === cached, "recomputed cached difficulty");
		puzzle.renderRunHistory(1);
		puzzle.scores.hidden = true;
		await puzzle.historyDifficultyTask;
		assert(!puzzle.runHistory[0].difficulty, "continued rating after closing history");
	}, initial);
});

Deno.test("Chronicle refreshes stale difficulty versions but keeps current ratings", async () => {
	const initial = [undefined, 0, 2, 1, undefined].map((version, i) => ({
		date: i, seed: 0x98079244, elapsed: i, outcome: "won",
		rows: 6, columns: 6, generatorVersion: i === 4 ? 99 : 1,
		difficulty: {score: 100, level: "hard", ...(version === undefined ? {} : {version})},
	}));
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const body = puzzle.historyBody;
		assert(body.children[0].children[4].textContent === "—",
		       "unsupported generation displayed a stale rating");
		assert(body.children[1].children[4].textContent === "Hard");
		assert(body.children[2].children[4].textContent === "…");
		const current = puzzle.runHistory[3].difficulty;
		await puzzle.historyDifficultyTask;
		assert(puzzle.runHistory.slice(0, 3).every(run =>
		       run.difficulty.version === 1 && run.difficulty.level === "easy"),
		       "stale cached ratings were not replaced");
		assert(puzzle.runHistory[3].difficulty === current, "recomputed a current rating");
		assert(puzzle.runHistory[4].difficulty.version === undefined,
		       "tried to rate an unsupported generator");
	}, initial);
});

Deno.test("debug dates suppress solo, daily, and shared results without save errors", async () => {
	await withRunHistory(async runs => {
		const puzzle = makePuzzle(6);
		puzzle.newGame(0x98079244);
		puzzle.stopTimer();
		puzzle.say = () => { throw new Error("unexpected save error"); };
		puzzle.dailyScoreSaved = () => { throw new Error("unexpected daily sync"); };
		puzzle.showDailyResult = () => { throw new Error("unexpected daily result screen"); };
		Logos.setDebugDateActive(true);
		try {
			for (const outcome of ["won", "lost"]) {
				puzzle.daily = null;
				assert(await puzzle.recordOutcome(outcome) === false);
				puzzle.daily = "20261031";
				assert(await puzzle.recordOutcome(outcome) === false);
				assert(await puzzle.recordOutcome(outcome, {
					outcome, multiplayer: 1, multiplayerId: "debug-run",
				}) === false);
			}
			assert(runs.length === 0, "debug results reached history storage");
		} finally {
			Logos.setDebugDateActive(false);
		}
	});
});

Deno.test("new runs include difficulty in their saved record", async () => {
	await withRunHistory(async runs => {
		const puzzle = makePuzzle(6);
		puzzle.say = function() {};
		puzzle.newGame(0x98079244);
		puzzle.stopTimer();
		await puzzle.recordOutcome("lost");
		assert(runs.length == 1 && runs[0].difficulty.level == "easy" &&
		       runs[0].difficulty.version === 1);
		assert(JSON.stringify(runs[0].difficulty) == JSON.stringify(Logos.puzzleDifficulty(puzzle)));
	});
});

Deno.test("Chronicle difficulty filters combine with results and reset on reopening", async () => {
	const initial = [
		{ seed: 1, outcome: "won", difficulty: { version: 1, score: 20, level: "easy" } },
		{ seed: 2, outcome: "lost", difficulty: { version: 1, score: 55, level: "medium" } },
		{ seed: 3, outcome: "won", difficulty: { version: 1, score: 80, level: "hard" } },
		{ outcome: "won" },
	].map((run, i) => ({ date: i, elapsed: i, ...run }));
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const body = puzzle.historyBody;
		const checkbox = level => puzzle.scores.querySelector(".history-" + level);
		const seeds = () => body.children.map(row => row.children[3].textContent).join(",");
		assert(body.children.length == 4, "all levels hid an unknown difficulty");
		checkbox("easy").checked = false;
		puzzle.renderRunHistory();
		assert(seeds() == "00000003,00000002", "difficulty filter included unknown/easy runs");
		checkbox("losses").checked = false;
		puzzle.renderRunHistory();
		assert(seeds() == "00000003", "result and difficulty filters were not combined");
		checkbox("medium").checked = checkbox("hard").checked = false;
		puzzle.renderRunHistory();
		assert(!body.children.length &&
		       puzzle.scores.querySelector(".history-status").textContent == "No runs match this filter.");
		await puzzle.showRunHistory();
		assert(["easy", "medium", "hard"].every(level => checkbox(level).checked));
		assert(body.children.length == 4);
	}, initial);
});

Deno.test("difficulty filtering discovers uncached matches outside the current page", async () => {
	const initial = Array.from({ length: 10 }, (_, i) => ({
		date: i, seed: i == 0 ? 0xe2a689dd : 0x98079244,
		elapsed: i, outcome: "won", rows: 6, columns: 6, generatorVersion: 1,
		difficulty: {score: 1, level: "easy", version: 0},
	}));
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const firstTask = puzzle.historyDifficultyTask;
		puzzle.scores.querySelector(".history-easy").checked = false;
		puzzle.scores.querySelector(".history-medium").checked = false;
		puzzle.renderRunHistory();
		assert(puzzle.scores.querySelector(".history-status").textContent == "Checking difficulty…");
		await firstTask;
		await puzzle.historyDifficultyTask;
		const body = puzzle.historyBody;
		assert(body.children.length == 1 && body.children[0].children[3].textContent == "e2a689dd",
		       "filter missed an uncached run outside the original page");
		assert(body.children[0].children[4].textContent == "Hard");
		assert(puzzle.runHistory.every(run => run.difficulty.version === 1), "filter did not finish checking candidates");
		assert(puzzle.scores.querySelector(".history-status").hidden);
	}, initial);
});

Deno.test("changing difficulty filters cancels obsolete backfill", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const initialTask = puzzle.historyDifficultyTask;
		puzzle.scores.querySelector(".history-easy").checked = false;
		puzzle.renderRunHistory();
		const filterTask = puzzle.historyDifficultyTask;
		puzzle.scores.querySelector(".history-medium").checked = false;
		puzzle.scores.querySelector(".history-hard").checked = false;
		puzzle.renderRunHistory();
		await Promise.all([initialTask, filterTask, puzzle.historyDifficultyTask]);
		assert(!puzzle.runHistory[0].difficulty, "obsolete task rated a run");
		assert(!puzzle.historyBody.children.length);
	}, [{ date: 1, seed: 1, elapsed: 1, outcome: "won", rows: 6,
		columns: 6, generatorVersion: 1 }]);
});

Deno.test("Pantheon switches rankings without adding difficulty to entries", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		assert(puzzle.pantheonLevel == "all" && puzzle.highScores.length == 3);
		await puzzle.selectPantheon("hard");
		assert(puzzle.highScores.length == 1 && puzzle.highScores[0].seed == 3);
		assert(puzzle.scores.querySelector(".pantheon-hard").attributes["aria-pressed"] == "true");
		assert(puzzle.scores.querySelector(".games-won").textContent == 3,
		       "difficulty selection changed overall statistics");
		await puzzle.selectPantheon("medium");
		assert(puzzle.highScores.length == 0 && !puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector(".scores-empty").hidden);
		assert(puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector(".scores-empty").textContent.includes("medium"));
		await puzzle.toggleScores();
		await puzzle.toggleScores();
		assert(puzzle.pantheonLevel == "all" && puzzle.highScores.length == 3);
	}, [
		{ seed: 1, date: 1, elapsed: 100, outcome: "won", difficulty: { version: 1, score: 20, level: "easy"} },
		{ seed: 2, date: 2, elapsed: 200, outcome: "won", difficulty: { version: 1, score: 25, level: "easy"} },
		{ seed: 3, date: 3, elapsed: 300, outcome: "won", difficulty: { version: 1, score: 80, level: "hard"} },
		{ seed: 4, date: 4, elapsed: 1, outcome: "lost", difficulty: { version: 1, score: 90, level: "hard"} },
	]);
});

Deno.test("a win can qualify for its difficulty without qualifying for All", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.say = function() {};
		puzzle.newGame(0xe2a689dd);
		puzzle.stopTimer();
		puzzle.gameOver = true;
		puzzle.timerElapsed = 500000;
		puzzle.scores.hidden = true;
		/* Hidden dialogs have no measurable scrolling width in the browser. */
		Object.defineProperty(puzzle.pantheonViewport, "clientWidth", {
			get: () => puzzle.scores.hidden ? 0 : 400,
		});
		await puzzle.recordOutcome("won");
		assert(!puzzle.scores.hidden && puzzle.pantheonLevel == "hard");
		assert(puzzle.pantheonViewport.scrollLeft == 1200,
		       "auto-open did not position the winning difficulty after showing the dialog");
		assert(puzzle.highScores.length == 1 && puzzle.highlightedScore.seed == 0xe2a689dd);
		assert(puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector("ol").children.at(-1).className == "score-new");
		await puzzle.selectPantheon("all");
		assert(puzzle.highScores.length == 10 && !puzzle.highScores.some(run => run.seed == 0xe2a689dd));
		await puzzle.selectPantheon("easy");
		await puzzle.selectPantheon("hard");
		assert(puzzle.highlightedScore === puzzle.highScores[0],
		       "visiting rankings without the winning score lost its highlight");
		await puzzle.toggleScores();
		assert(puzzle.highlightedScore === null, "closing retained the session highlight");
	}, Array.from({length: 12}, (_,i) => ({date:i,seed:i,elapsed:i+1,outcome:"won",
		difficulty:{ version: 1, score:20,level:"easy"}})));
});

Deno.test("Pantheon only backfills legacy wins which can enter the selected top ten", async () => {
	const initial = Array.from({length:10},(_,i)=>({date:i,seed:i,elapsed:100+i,outcome:"won",
		difficulty:{ version: 1, score:80,level:"hard"}}));
	initial.push({date:11, seed:0xe2a689dd, elapsed:50, outcome:"won",rows:6,columns:6,generatorVersion:1});
	initial.push({date:12, seed:0x98079244, elapsed:200, outcome:"won",rows:6,columns:6,generatorVersion:1});
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		await puzzle.selectPantheon("hard");
		assert(puzzle.highScores.length == 10 && puzzle.highScores[0].seed == 0xe2a689dd);
		assert(puzzle.highScores.at(-1).elapsed == 108);
	}, initial);
});

Deno.test("Pantheon rerates stale labels before admitting or excluding wins", async () => {
	const initial = Array.from({length: 10}, (_, i) => ({
		date: i, seed: i, elapsed: 100 + i, outcome: "won",
		difficulty: {version: 1, score: 80, level: "hard"},
	}));
	initial.push({date: 20, seed: 0x98079244, elapsed: 10, outcome: "won",
		rows: 6, columns: 6, generatorVersion: 1, difficulty: {score: 90, level: "hard"}});
	initial.push({date: 21, seed: 0xe2a689dd, elapsed: 20, outcome: "won",
		rows: 6, columns: 6, generatorVersion: 1, difficulty: {version: 0, score: 20, level: "easy"}});
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		await puzzle.loadHistory(null, "hard");
		assert(puzzle.highScores.length === 10 && puzzle.highScores[0].seed === 0xe2a689dd,
		       "stale Easy label kept a Hard win out of the ranking");
		assert(puzzle.highScores.every(run => run.seed !== 0x98079244 && run.difficulty.version === 1),
		       "stale Hard label admitted an Easy win");
	}, initial);
});

Deno.test("a stale Pantheon lookup cannot replace a newer selection", async () => {
	let release;
	const gate = new Promise(resolve => { release = resolve; });
	Logos.setHistoryStorage(async (run, includeRuns, level) => {
		if (level == "easy") await gate;
		return { highScores: [{id:1, date:1, seed:1, elapsed:100,
			difficulty:{ version: 1, score:80,level}}], gameStats:{won:1,lost:0} };
	});
	try {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = false;
		puzzle.scores.querySelector(".pantheon-view").hidden = false;
		const first = puzzle.selectPantheon("easy");
		await puzzle.selectPantheon("hard");
		release(); await first;
		assert(puzzle.pantheonLevel == "hard" && puzzle.highScores[0].difficulty.level == "hard");
	} finally {
		release();
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
});

Deno.test("multiplayer Pantheon keeps difficulty filters and opens for a shared record", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		await puzzle.selectPantheon("hard");
		assert(puzzle.highScores.length === 1 && !puzzle.highScores[0].multiplayer);
		await puzzle.togglePantheonMode();
		assert(puzzle.pantheonMultiplayer && puzzle.pantheonLevel === "hard" &&
		       puzzle.highScores.length === 1 && puzzle.highScores[0].multiplayer);
		assert(puzzle.scores.querySelector("#scores-title").textContent === "The Circle of the Wise");
		assert(puzzle.scores.querySelector(".pantheon-friends").attributes["aria-pressed"] === "true");
		assert(puzzle.gameStats.won === 2 && puzzle.gameStats.lost === 1);
		await puzzle.selectPantheon("easy");
		assert(puzzle.highScores.length === 1 && puzzle.highScores[0].seed === 3);
		await puzzle.showRunHistory();
		assert(puzzle.scores.querySelector(".pantheon-friends").hidden);
		puzzle.showPantheon();
		assert(!puzzle.scores.querySelector(".pantheon-friends").hidden && puzzle.pantheonMultiplayer);
		await puzzle.togglePantheonMode();
		assert(!puzzle.pantheonMultiplayer && puzzle.pantheonLevel === "easy" && !puzzle.highScores.length);
		await puzzle.toggleScores();
		puzzle.gameOver = true;
		await puzzle.recordOutcome("won", { seed: 5, date: 5, elapsed: 50, outcome: "won",
			multiplayer: 1, multiplayerId: "new-record", players: ["Plato", "Socrates"],
			difficulty: { version: 1, score: 80, level: "hard" } });
		assert(!puzzle.scores.hidden && puzzle.pantheonMultiplayer && puzzle.pantheonLevel === "hard");
		assert(puzzle.highlightedScore.seed === 5 && puzzle.highScores[0].seed === 5);
	}, [
		{ seed: 1, date: 1, elapsed: 100, outcome: "won", difficulty: { version: 1, score: 80, level: "hard" } },
		{ seed: 2, date: 2, elapsed: 100, outcome: "won", multiplayer: 1, difficulty: { version: 1, score: 80, level: "hard" } },
		{ seed: 3, date: 3, elapsed: 100, outcome: "won", multiplayer: 1, difficulty: { version: 1, score: 20, level: "easy" } },
		{ seed: 4, date: 4, elapsed: 100, outcome: "lost", multiplayer: 1 },
	]);
});

Deno.test("empty multiplayer history hides the switch until a shared result arrives", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		const control = puzzle.scores.querySelector(".pantheon-mode");
		assert(control.hidden);
		await puzzle.togglePantheonMode();
		assert(!puzzle.pantheonMultiplayer);
		puzzle.gameOver = true;
		await puzzle.recordOutcome("won", {seed: 1, date: 1, elapsed: 100,
			outcome: "won", multiplayer: 1});
		assert(puzzle.pantheonMultiplayer && !control.hidden);
		await puzzle.togglePantheonMode();
		assert(!puzzle.pantheonMultiplayer && !control.hidden);
	});
});

Deno.test("switching ranking modes retains inactive pages for layout", async () => {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(1);
		puzzle.scores.hidden = true;
		await puzzle.toggleScores();
		const solo = puzzle.pantheonTablets;
		await puzzle.togglePantheonMode();
		assert(puzzle.pantheonTablets !== solo && solo.all.style.visibility === "hidden" &&
		       solo.all.inert && solo.all.attributes["aria-hidden"] === "true" &&
		       solo.all.querySelector("ol").children.length === 1,
		       "inactive rankings lost their content or remained accessible");
		await puzzle.togglePantheonMode();
		assert(puzzle.pantheonTablets === solo && !solo.all.style.visibility && !solo.all.inert);
	}, [
		{seed: 1, date: 1, elapsed: 100, outcome: "won"},
		{seed: 2, date: 2, elapsed: 100, outcome: "won", multiplayer: 1},
	]);
});

Deno.test("daily browsing restores the original solo position and clock", async function() {
	await withRunHistory(async runs => {
		const puzzle = makePuzzle(6);
		puzzle.options.hidden = puzzle.scores.hidden = true;
		try {
			for (const mode of ["timed", "paused", "zen", "continued"]) {
				puzzle.newGame(123);
				puzzle.stopTimer();
				puzzle.timerElapsed = 42000;
				puzzle.manualPaused = mode === "paused";
				puzzle.practiceMode = mode === "zen" || mode === "continued";
				puzzle.scoreEligible = !puzzle.practiceMode;
				puzzle.continuedFromLoss = mode === "continued";
				puzzle.daily = "20261001";
				puzzle.nextMilestone = 2;
				const slot = puzzle.rows[0].slots[0];
				slot.displaySingle();
				puzzle.rows[1].slots[0].possible[0] = false;
				puzzle.clues[0].active = false;
				puzzle.pencilMarks = [{ slot: puzzle.rows[2].slots[0], value: 1, discard: true }];
				const position = JSON.stringify(puzzle.positionSnapshot());
				const clues = puzzle.clues.map(clue => clue.active);
				const identity = puzzle.gameIdentity;
				await puzzle.openDaily("20261008");
				const saved = puzzle.dailyReturn;
				assert(saved && puzzle.timerTimeout === null);
				await puzzle.openDaily("20261009");
				assert(puzzle.dailyReturn === saved, "browsing replaced the original snapshot");
				puzzle.closeInvitation();
				assert(!puzzle.dailyReturn && puzzle.daily === "20261001" &&
				       puzzle.gameIdentity !== identity && puzzle.pendingSeed === undefined && !puzzle.gameOver);
				assert(JSON.stringify(puzzle.positionSnapshot()) === position, "position changed on return");
				assert(JSON.stringify(puzzle.clues.map(clue => clue.active)) === JSON.stringify(clues));
				assert(puzzle.timerElapsed === 42000 && puzzle.nextMilestone === 2);
				assert(puzzle.scoreEligible === !puzzle.practiceMode &&
				       puzzle.continuedFromLoss === (mode === "continued"));
				assert((puzzle.timerTimeout !== null) === (mode === "timed"), "wrong timer resume state");
				puzzle.stopTimer();
			}
			assert(runs.length === 0, "restoration recorded an outcome");
		} finally {
			puzzle.stopTimer();
		}
	});
});

Deno.test("daily result detours retain the suspended game until closing", async function() {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.options.hidden = puzzle.scores.hidden = true;
		try {
			puzzle.newGame(123);
			await puzzle.openDaily("20261008");
			const saved = puzzle.dailyReturn;
			await puzzle.openDailyChronicle();
			assert(puzzle.dailyReturn === saved && puzzle.seed === 0x20261008);
			await puzzle.toggleScores();
			assert(puzzle.dailyResultOpen && puzzle.dailyReturn === saved);
			await puzzle.openDailyPantheon();
			assert(puzzle.dailyReturn === saved && puzzle.seed === 0x20261008);
			await puzzle.toggleScores();
			puzzle.closeDailyResult();
			assert(puzzle.seed === 123 && !puzzle.dailyReturn && !puzzle.dailyResultOpen);
		} finally {
			puzzle.stopTimer();
		}
	}, [{ date: 1, seed: 0x20261008, daily: "20261008", elapsed: 1000, outcome: "won" }]);
});

Deno.test("accepting or replacing a daily preview releases the suspended game", async function() {
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.options.hidden = puzzle.scores.hidden = true;
		try {
			puzzle.newGame(123);
			await puzzle.openDaily("20261008");
			assert(puzzle.dailyReturn);
			await puzzle.startGame();
			assert(!puzzle.dailyReturn && puzzle.daily === "20261008");
			await puzzle.openDaily("20261009");
			assert(puzzle.dailyReturn);
			puzzle.newGame(456);
			assert(!puzzle.dailyReturn && !puzzle.restoreDailyReturn() && puzzle.seed === 456);
			puzzle.newGame(789, true);
			await puzzle.openDaily("20261010");
			assert(!puzzle.dailyReturn, "unstarted invitation was saved as an active game");
			puzzle.closeInvitation();
			assert(puzzle.seed === 0x20261010, "no-game decline lost the preview");
		} finally {
			puzzle.stopTimer();
		}
	});
});

Deno.test("failed and late daily lookups cannot replace a restored game", async function() {
	const puzzle = makePuzzle(6);
	puzzle.options.hidden = puzzle.scores.hidden = true;
	try {
		puzzle.newGame(123);
		puzzle.getDailyResult = async () => null;
		assert(!await puzzle.openDaily("20261008") && puzzle.seed === 123 && !puzzle.dailyReturn);
		puzzle.getDailyResult = async () => undefined;
		await puzzle.openDaily("20261008");
		let release;
		puzzle.getDailyResult = () => new Promise(resolve => { release = resolve; });
		const pending = puzzle.openDaily("20261009");
		puzzle.pageHidden = true;
		puzzle.closeInvitation();
		assert(puzzle.seed === 123 && puzzle.paused && puzzle.timerTimeout === null &&
		       puzzle.resumeAfterPageHidden, "background restoration resumed the timer");
		release(undefined);
		assert(!await pending && puzzle.seed === 123 && !puzzle.dailyReturn);
	} finally {
		puzzle.stopTimer();
	}
});
