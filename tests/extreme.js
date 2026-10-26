import {
	Logos, assert, makePuzzle, puzzleSignature, withRunHistory,
} from "./helpers.js";

Deno.test("extreme games reconstruct their clues and record their own rating", async function() {
	const puzzle = makePuzzle(6);
	puzzle.newGame(0, false, false, true);
	const expected = Logos.extremeClueIndices(Logos.puzzleFromSeed(0));
	assert(JSON.stringify(expected) === JSON.stringify(Logos.extremeClueIndices(Logos.puzzleFromSeed(0))));
	const identity = puzzle.gameIdentity;
	assert(!puzzle.newGame(2, false, false, true));
	assert(puzzle.gameIdentity === identity && puzzle.extreme === true);
	assert(!Logos.cluesSolve(puzzle, puzzle.clues));
	assert(Logos.countSolutions(puzzle, puzzle.clues) === 1);
	assert(puzzle.scoreEligible && !puzzle.runRecord("won").difficulty);
	assert(puzzle.runRecord("won").extremeDifficulty.version === 1);
	puzzle.toggleOptions();
	assert(puzzle.options.querySelector("#game-seed").value === "00000000");
	assert(!puzzle.options.querySelector("#copy-seed-link").disabled);
	puzzle.saveDailyReturn();
	const saved = puzzle.dailyReturn;
	puzzle.newGame(1);
	puzzle.dailyReturn = saved;
	assert(puzzle.restoreDailyReturn());
	assert(!Logos.cluesSolve(puzzle, puzzle.clues));
	assert(Logos.countSolutions(puzzle, puzzle.clues) === 1);
	puzzle.newGame(0);
	assert(!puzzle.extreme && Logos.cluesSolve(puzzle, puzzle.clues));
	assert(puzzle.runRecord("won").difficulty);
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("Extreme mode generates random puzzles independently of ordinary difficulties", function() {
	const puzzle = makePuzzle(6);
	puzzle.newGame(1);
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	puzzle.setExtremeMode(true);
	puzzle.setRandomDifficulties([]);
	puzzle.options.querySelector("#game-seed").value = "";
	puzzle.playSeed();
	puzzle.setExtremeMode(false);
	puzzle.setRandomDifficulties(["easy", "medium", "hard"]);
	assert(puzzle.extreme && puzzle.options.hidden);
	assert(!Logos.cluesSolve(puzzle, puzzle.clues));
	assert(Logos.countSolutions(puzzle, puzzle.clues) === 1);
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("extreme links, restarts and position copies preserve the mode", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	const receiver = makePuzzle(6, false, Logos.defaultSymbols);
	const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	const oldWindow = globalThis.window;
	globalThis.window = { location: { href: "https://example.com/" } };
	let copied;
	Object.defineProperty(navigator, "clipboard", { configurable: true,
		value: { writeText: async text => { copied = text; } } });
	try {
		window.location.href = "https://example.com/#seed=123";
		puzzle.setExtremeMode(true);
		puzzle.newGame(0, false, false, true);
		puzzle.options.hidden = true;
		puzzle.toggleOptions();
		puzzle.setExtremeMode(false);
		await puzzle.copySeedLink();
		assert(copied === "https://example.com/#seed=00000000&extreme");
		assert(receiver.loadURLSeed(copied));
		assert(receiver.extreme && receiver.pendingSeed === 0);
		assert(puzzleSignature(receiver) === puzzleSignature(puzzle));
		puzzle.setExtremeMode(true);
		puzzle.playSeed();
		assert(puzzle.extreme && !Logos.cluesSolve(puzzle, puzzle.clues));
		const slot = puzzle.rows[0].slots.find(slot => !slot.single);
		slot.discard((slot.value + 1) % 6);
		puzzle.toggleOptions();
		assert(!puzzle.options.querySelector("#seed-difficulty").disabled);
		const before = JSON.stringify(puzzle.positionSnapshot());
		puzzle.analysisUnlocked = true;
		puzzle.openAnalysis();
		assert(!puzzle.analysis.hidden && puzzle.analysisSnapshot === before);
		assert(puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Extreme"));
		await puzzle.copyAnalysisPosition();
		assert(copied === before && JSON.parse(copied).extreme === true);
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
		assert(receiver.loadURLSeed("https://example.com/#seed=0"));
		assert(!receiver.extreme);
		receiver.setExtremeMode(true);
		await receiver.copySeedLink();
		assert(copied === "https://example.com/#seed=00000000");
		receiver.options.querySelector("#game-seed").value = "1";
		await receiver.copySeedLink();
		assert(copied === "https://example.com/#seed=00000001&extreme");
		receiver.setExtremeMode(false);
		await receiver.copySeedLink();
		assert(copied === "https://example.com/#seed=00000001");
	} finally {
		puzzle.setExtremeMode(false);
		globalThis.window = oldWindow;
		if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
		else delete navigator.clipboard;
		for (const game of [puzzle, receiver]) {
			game.stopTimer();
			game.say("");
		}
	}
});

Deno.test("restoring extreme clues fits the original layout and also restores culled givens", function() {
	let givens = 0;
	for (let seed = 0; seed < 5; seed++) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		if (!puzzle.newGame(seed, false, false, true)) continue;
		for (let i = 0; i < puzzle.originalClues.length; i++) {
			const clue = puzzle.originalClues[i];
			if (puzzle.clues.includes(clue)) continue;
			assert(puzzle.revealExtremeClue(i));
			assert(!puzzle.revealExtremeClue(i), "revealed a clue twice");
			if (clue.applyInitialState) {
				givens++;
				assert(clue.slot.single);
			} else {
				assert(clue.display && clue.active);
			}
		}
		assert(puzzle.clues.length === puzzle.originalClues.length);
		assert(puzzle.numHClues <= puzzle.hClueSlots.length && puzzle.numVClues <= puzzle.vClueSlots.length);
		puzzle.stopTimer();
		puzzle.say("");
	}
	assert(givens > 0, "fixture must exercise a removed starting tile");
});

Deno.test("extreme Options ratings stay tied to the original seed after clue assistance", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0xac185eca, false, false, true);
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	const display = puzzle.options.querySelector("#seed-difficulty");
	assert(display.innerHTML === "Extreme " + Logos.extremeSkulls({ complete: true, skulls: 1 }));
	assert(display.title === "" && !display.disabled);
	const rating = puzzle.extremeDifficulty();
	const missing = puzzle.originalClues.findIndex(clue => !puzzle.clues.includes(clue));
	puzzle.revealExtremeClue(missing, false);
	puzzle.updateSeedDifficulty();
	assert(puzzle.extremeDifficulty() === rating && display.innerHTML.includes('aria-label="1 skull"'));
	puzzle.analysisUnlocked = false;
	puzzle.openAnalysis();
	puzzle.openAnalysis();
	assert(puzzle.analysis.hidden && !puzzle.analysisUnlocked);
	puzzle.openAnalysis();
	assert(!puzzle.analysis.hidden && puzzle.analysisUnlocked);
	localStorage.removeItem("analysisUnlocked");
	assert(puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Mean bottlenecks: 4.0"));
	puzzle.newGame(0xd40791eb, false, false, true);
	assert(puzzle.extremeDifficulty().bottlenecks === 1);
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("Extreme history preserves timing and outcomes without entering the Pantheon", async function() {
	await withRunHistory(async runs => {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.newGame(0, false, false, true);
		puzzle.stopTimer();
		puzzle.scoreEligible = true;
		puzzle.timerElapsed = 123456;
		puzzle.scores.hidden = true;
		for (const outcome of ["won", "lost"])
			assert(await puzzle.recordOutcome(outcome));
		assert(runs.length === 2 && runs.every(run => run.extreme === true &&
		       run.elapsed === 123456 && run.seed === 0 && run.generatorVersion === 1 &&
		       run.rows === 6 && run.columns === 6 && !run.difficulty &&
		       run.extremeDifficulty.version === 1 && run.extremeDifficulty.complete));
		assert(!puzzle.highScores.length && puzzle.scores.hidden,
		       "Extreme result entered or opened the Pantheon");
		puzzle.prepareHint();
		assert(await puzzle.recordOutcome("won"));
		assert(runs[2].extreme && runs[2].elapsed === undefined,
		       "assisted Extreme did not follow the ordinary timing policy");
		puzzle.say("");
	});
});

Deno.test("Chronicle displays, filters, links, and refreshes Extreme ratings", async function() {
	const initial = [
		{ seed: 0x98079244, difficulty: { version: 1, level: "easy", score: 20 } },
		{ seed: 0, extreme: true, extremeDifficulty: { version: 1, complete: true, level: 6, score: 8000 } },
		{ seed: 0x4c3f2a56, extreme: true, extremeDifficulty: { version: 1, complete: false, stalled: true, level: null } },
		{ seed: 0, extreme: true, extremeDifficulty: { version: 0, complete: true, level: 999 } },
	].map((run, i) => ({ date: i, elapsed: 1000, outcome: "won", rows: 6,
		columns: 6, generatorVersion: 1, ...run }));
	await withRunHistory(async () => {
		const puzzle = makePuzzle(6);
		puzzle.scores.hidden = false;
		await puzzle.showRunHistory();
		const rows = puzzle.historyBody.children;
		assert(rows.length === 4);
		for (const row of Array.from(rows).slice(0, 3))
			assert(row.children[4].textContent === "Extreme");
		assert(rows[1].children[3].children[0].href === "#seed=4c3f2a56&extreme");
		await puzzle.historyDifficultyTask;
		assert(puzzle.runHistory[3].extremeDifficulty.version === 1 &&
		       puzzle.runHistory[3].extremeDifficulty.level !== 999 && !puzzle.runHistory[3].difficulty);
		for (const level of ["easy", "medium", "hard"])
			puzzle.scores.querySelector(".history-" + level).checked = false;
		puzzle.renderRunHistory();
		assert(puzzle.historyBody.children.length === 3);
		puzzle.scores.querySelector(".history-extreme").checked = false;
		puzzle.renderRunHistory();
		assert(!puzzle.historyBody.children.length);
		await puzzle.showRunHistory();
		assert(puzzle.scores.querySelector(".history-extreme").checked &&
		       puzzle.historyBody.children.length === 4);
		await puzzle.historyDifficultyTask;
	}, initial);
});

Deno.test("Extreme preference persists without changing invitations or the current board", function() {
	const puzzle = makePuzzle(6);
	try {
		puzzle.newGame(0);
		puzzle.stopTimer();
		const identity = puzzle.gameIdentity;
		puzzle.setRandomDifficulties(["medium"]);
		puzzle.setExtremeMode(true);
		assert(puzzle.gameIdentity === identity && !puzzle.extreme);
		assert(puzzle.options.querySelector("#start-game-button").value === "Start");
		for (const level of ["easy", "medium", "hard"])
			assert(puzzle.options.querySelector("#random-" + level).disabled);
		const restored = makePuzzle(6);
		assert(restored.extremeMode && restored.randomDifficulties.join() === "medium");
		restored.newGame();
		assert(restored.extreme);
		restored.stopTimer();
		restored.say("");
		assert(puzzle.loadURLSeed("https://example.com/#seed=0"));
		assert(!puzzle.extreme && puzzle.extremeMode);
		puzzle.setExtremeMode(false);
		assert(puzzle.randomDifficulties.join() === "medium" &&
		       !puzzle.options.querySelector("#random-medium").disabled);
	} finally {
		puzzle.setExtremeMode(false);
		puzzle.setRandomDifficulties(["easy", "medium", "hard"]);
		puzzle.stopTimer();
		puzzle.say("");
	}
});

Deno.test("seed starts use the selected mode and reject unavailable Extreme variants", function() {
	const puzzle = makePuzzle(6);
	try {
		puzzle.newGame(0);
		puzzle.options.hidden = false;
		puzzle.setExtremeMode(true);
		const identity = puzzle.gameIdentity;
		const input = puzzle.options.querySelector("#game-seed");
		input.value = "2";
		puzzle.playSeed();
		assert(puzzle.gameIdentity === identity && !puzzle.options.hidden);
		assert(puzzle.options.querySelector("#seed-difficulty").textContent ===
		       "No Extreme variant for this seed.");
		const display = puzzle.options.querySelector("#seed-difficulty");
		assert(display.disabled && display.title ===
		       "This seed can’t be made Extreme. Turn off Extreme to play it.");
		puzzle.setExtremeMode(false);
		assert(display.textContent === "" && display.title === "");
		puzzle.setExtremeMode(true);
		input.value = "0";
		puzzle.playSeed();
		assert(puzzle.extreme && puzzle.options.hidden && puzzle.seed === 0);
		assert(puzzle.options.querySelector("#start-game-button").value === "Restart");
		puzzle.setExtremeMode(false);
		puzzle.options.hidden = false;
		puzzle.playSeed();
		assert(!puzzle.extreme && puzzle.seed === 0);
	} finally {
		puzzle.setExtremeMode(false);
		puzzle.stopTimer();
		puzzle.say("");
	}
});
