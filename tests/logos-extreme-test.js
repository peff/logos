import {
	Logos, FakeElement, assert, makePuzzle, exhaustPuzzleDeductions,
	withRunHistory, withRandom, puzzleSignature,
} from "./logos-test-helpers.js";

Deno.test("expanded extreme hints prove chalk lemmas and finish without changing the board", function() {
	localStorage.setItem("hintAcknowledged", "true");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0x0e2b42be, false, false, true);
	const before = JSON.stringify(puzzle.positionSnapshot());
	puzzle.explainLoss();
	const first = puzzle.hintRequest.step;
	assert(first, "expected an ordinary deduction before the stall");
	puzzle.explainLoss();
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.steps[0] === first);
	const last = puzzle.proof.steps.at(-1);
	assert(!last.stalled && last.conclusion &&
	       last.placements.every(bits => bits == 63));
	assert(puzzle.proof.steps.some(step => step.lemmaStage == "contradiction"));
	assert(!Logos.nextHintStep(puzzle, last.domains, last.placements));
	const lemmaStart = puzzle.proof.steps.findIndex(step => step.lemmaStage == "start");
	puzzle.moveProof(lemmaStart + 1 - puzzle.proof.position);
	const number = puzzle.proof.steps[lemmaStart].walkthroughNumber;
	assert(puzzle.proofControls.querySelector(".proof-position").textContent ==
	       "Step " + number + " — Lemma");
	puzzle.moveProof(1);
	assert(puzzle.proofControls.querySelector(".proof-position").textContent ==
	       "Step " + number + ".1");
	const assumption = puzzle.proof.steps[lemmaStart + 1];
	const assumedSlot = puzzle.rows[assumption.row].slots[assumption.column];
	assert(!assumedSlot.possibleElem.hidden && assumedSlot.singleElem.hidden,
	       "hypothetical placement was displayed as a real tile");
	assert(assumedSlot.possibilityElems[assumption.symbol].className.includes("pencil-selected") &&
	       assumedSlot.possibilityElems[assumption.symbol].className.includes("pencil-explicit"));
	const contradictionIndex = puzzle.proof.steps.findIndex(step => step.lemmaStage == "contradiction");
	puzzle.moveProof(contradictionIndex - puzzle.proof.position);
	assert(!puzzle.rows[0].elem.classList.contains("pencil-conflict"),
	       "amber conflict appeared before the contradiction was explained");
	puzzle.moveProof(contradictionIndex + 1 - puzzle.proof.position);
	const contradiction = puzzle.proof.steps[contradictionIndex];
	assert(contradiction.clue.display.classList.contains("proof-current"));
	puzzle.moveProof(1);
	assert(!puzzle.rows[0].elem.classList.contains("pencil-conflict"));
	assert(!assumedSlot.possibilityElems[assumption.symbol].className.includes("pencil-selected"),
	       "lemma conclusion retained hypothetical chalk");
	puzzle.moveProof(-1);
	assert(contradiction.clue.display.classList.contains("proof-current"));
	while (puzzle.proof.position < puzzle.proof.steps.length)
		puzzle.moveProof(1);
	const message = puzzle.proofControls.querySelector(".proof-deduction").textContent;
	assert(message.endsWith(" Q.E.D."));
	while (puzzle.proof.position)
		puzzle.moveProof(-1);
	puzzle.closeProof();
	assert(!puzzle.pendingProof && JSON.stringify(puzzle.positionSnapshot()) == before,
	       "partial walkthrough changed the live board");
	puzzle.stopTimer();
});

Deno.test("full solver distinguishes unique, ambiguous, impossible and unfinished searches", function() {
	const puzzle = Logos.puzzleFromSeed(0);
	assert(Logos.countSolutions(puzzle, puzzle.clues) === 1);
	assert(Logos.countSolutions(puzzle, []) === 2);
	assert(Logos.countSolutions(puzzle, puzzle.clues, 0) === null);
	assert(Logos.countSolutions(puzzle, [{ constrain(domains) {
		domains[0][0] = 0;
		return false;
	} }]) === 0);
});

Deno.test("extreme pruning preserves uniqueness but defeats deduction", function() {
	let found = 0;
	for (let seed = 0; seed < 30; seed++) {
		const puzzle = Logos.puzzleFromSeed(seed);
		assert(Logos.cluesSolve(puzzle, puzzle.clues));
		const indices = Logos.extremeClueIndices(puzzle);
		if (!indices)
			continue;
		found++;
		const clues = indices.map(index => puzzle.clues[index]);
		assert(Logos.countSolutions(puzzle, clues) === 1);
		assert(!Logos.cluesSolve(puzzle, clues));
	}
	assert(found > 0 && found < 30, "exercise both accepted and rejected candidates");
});

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

Deno.test("stalled extreme hints choose the narrower exploration, then explain the same trial", function() {
	let positionHints = 0, symbolHints = 0;
	for (const seed of [0, 1, 0x3, 0x12, 0x21, 0x3c5, 0x59]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.newGame(seed, false, false, true);
		puzzle.hintAcknowledged = true;
		exhaustPuzzleDeductions(puzzle);
		const before = JSON.stringify(puzzle.positionSnapshot());
		const count = puzzle.clues.length;
		puzzle.say = function() {};
		puzzle.explainLoss();
		const suggestion = puzzle.hintRequest.exploration;
		const lemma = puzzle.hintRequest.lemma;
		const explanation = puzzle.proofControls.querySelector(".proof-deduction");
		assert(!puzzle.proofControls.hidden && puzzle.proofControls.classList.contains("hint-explanation"));
		const { row, symbol, column } = suggestion;
		const domains = puzzle.hintRequest.base;
		const positions = Logos.countBits(domains[row][symbol]);
		const symbols = domains[row].filter(bits => bits & (1 << column)).length;
		if (symbols < positions) {
			positionHints++;
			const choices = domains[row].flatMap((bits, candidate) =>
				bits & (1 << column) ? [puzzle.rows[row].slots[0].symbols[candidate]] : []);
			const list = choices.slice(0, -1).join(", ") +
				(choices.length > 2 ? ", or " : " or ") + choices.at(-1);
			assert(explanation.textContent === "Explore the choice of " + list + ".");
			const tiles = explanation.children[0].children.filter(child =>
				child.className === "proof-tile " + puzzle.rows[row].familyClass);
			assert(tiles.length === choices.length);
			assert(puzzle.rows[row].slots[column].elem.classList.contains("hint-current"));
		} else {
			symbolHints++;
			for (const [c, slot] of puzzle.rows[row].slots.entries()) {
				assert(slot.possibilityElems[symbol].classList.contains("hint-current") ===
					!!(domains[row][symbol] & (1 << c)));
				assert(!slot.elem.classList.contains("hint-current"));
			}
			assert(explanation.textContent === "Explore the possible positions of " +
				puzzle.rows[row].slots[0].symbols[symbol] + " with chalk.");
			const tile = explanation.children[0].children[1];
			assert(tile.className === "proof-tile " + puzzle.rows[row].familyClass);
			assert(tile.textContent === puzzle.rows[row].slots[0].symbols[symbol]);
		}
		assert(puzzle.practiceMode && puzzle.timerTimeout === null);
		assert(puzzle.hintRequest.stalled && puzzle.clues.length === count);
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
		puzzle.explainLoss();
		assert(puzzle.hintRequest.stage === 2 && puzzle.clues.length === count);
		for (const [c, slot] of puzzle.rows[row].slots.entries()) {
			assert(!slot.elem.classList.contains("hint-current"));
			for (const [s, tile] of slot.possibilityElems.entries())
				assert(tile.classList.contains("hint-current") === (c === column && s === symbol));
		}
		assert(explanation.textContent === "Try placing " +
			puzzle.rows[suggestion.row].slots[0].symbols[suggestion.symbol] +
			" in column " + (suggestion.column + 1) + " with chalk.");
		assert(explanation.children[0].children[1].className === "proof-tile " + puzzle.rows[row].familyClass);
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
		puzzle.explainLoss();
		assert(puzzle.proof && puzzle.proof.steps[0].lemmaStage === "start");
		assert(!puzzle.rows[row].slots[column].elem.classList.contains("hint-current"));
		for (const slot of puzzle.rows[row].slots)
			assert(slot.possibilityElems.every(tile => !tile.classList.contains("hint-current")));
		assert(lemma.every((step, i) => puzzle.proof.steps[i] === step),
		       "walkthrough did not reuse the suggested lemma");
		const assumption = puzzle.proof.steps.find(step => step.lemmaStage === "assumption");
		assert(assumption.row === suggestion.row && assumption.symbol === suggestion.symbol &&
		       assumption.column === suggestion.column);
		assert(puzzle.proof.steps.at(-1).placements.every(bits => bits === 63));
		assert(!puzzle.hintRequest && puzzle.practiceMode && !puzzle.scoreEligible);
		assert(puzzle.clues.length === count && !puzzle.revealedClues.length);
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
		puzzle.closeProof();
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
		puzzle.stopTimer();
	}
	assert(positionHints > 0 && symbolHints > 0, "fixtures must cover both orientations");
});

Deno.test("stalled hints without a chalk suggestion show an incomplete walkthrough", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0, false, false, true);
	// No clues means neither ordinary deductions nor failed assumptions.
	puzzle.clues = [];
	for (const row of puzzle.rows) for (const slot of row.slots) {
		slot.single = false;
		slot.possible = Array(6).fill(true);
		slot.displayPossible();
	}
	puzzle.hintAcknowledged = true;
	const before = JSON.stringify(puzzle.positionSnapshot());
	puzzle.explainLoss();
	assert(puzzle.hintRequest.stalled && !puzzle.hintRequest.exploration);
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.steps.at(-1).stalled);
	assert(!puzzle.revealedClues.length);
	assert(JSON.stringify(puzzle.positionSnapshot()) === before);
	puzzle.closeProof();
	puzzle.stopTimer();
});

Deno.test("ordinary extreme deductions do not offer clue revelation", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0x3c5, false, false, true);
	puzzle.hintAcknowledged = true;
	const count = puzzle.clues.length;
	assert(count < puzzle.originalClues.length);
	puzzle.explainLoss();
	assert(puzzle.hintRequest.step && !puzzle.hintRequest.stalled);
	puzzle.explainLoss();
	assert(puzzle.hintRequest.stage === 2);
	assert(puzzle.proofControls.querySelector(".proof-reveal").hidden);
	puzzle.requestExtremeClue();
	assert(puzzle.clues.length === count && !puzzle.revealedClues.length);
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proofControls.querySelector(".proof-reveal").hidden);
	puzzle.closeProof();
	puzzle.stopTimer();
});

Deno.test("extreme hints offer clue revelation separately from the walkthrough", function() {
	for (const walkthrough of [false, true]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.newGame(0x3c5, false, false, true);
		puzzle.hintAcknowledged = true;
		exhaustPuzzleDeductions(puzzle);
		puzzle.explainLoss();
		const button = puzzle.proofControls.querySelector(".proof-reveal");
		assert(!button.hidden);
		if (walkthrough) {
			puzzle.explainLoss();
			puzzle.explainLoss();
			puzzle.moveProof(2);
			assert(puzzle.proof && button.hidden);
			puzzle.explainLoss();
			puzzle.explainLoss();
			assert(!puzzle.proof && !button.hidden);
		}
		const count = puzzle.clues.length;
		puzzle.requestExtremeClue();
		assert(puzzle.clues.length === count + 1 && puzzle.revealedClues.length === 1);
		assert(!puzzle.proof && !puzzle.hintRequest);
		puzzle.stopTimer();
	}
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	puzzle.updateRevealClueControl(true);
	assert(puzzle.proofControls.querySelector(".proof-reveal").hidden);
	puzzle.extreme = true;
	puzzle.hintRequest = { stalled: true };
	puzzle.originalClues = puzzle.clues.slice();
	puzzle.updateRevealClueControl(true);
	assert(puzzle.proofControls.querySelector(".proof-reveal").hidden);
	puzzle.stopTimer();
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

Deno.test("extreme skull ratings use weighted branch costs and leave incomplete searches unrated", function() {
	for (const [seed, count] of [[0xd40791eb, 1], [0xac185eca, 1], [0x39c, 1], [0x3c5, 2], [0x59, 6], [0xd505b84e, 12]]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
		const before = puzzleSignature(puzzle);
		const rating = Logos.measureExtremeDifficulty(puzzle);
		assert(rating.complete && rating.skulls === count);
		if (seed === 0x39c) {
			assert(Math.abs(rating.score - 1271.3197213409258) < 1e-8);
			assert(rating.bottlenecks === 5.4, "rating did not average all ten routes");
			assert(JSON.stringify(Logos.measureExtremeDifficulty(puzzle)) === JSON.stringify(rating));
		}
		assert(Logos.extremeSkulls(rating).includes(`aria-label="${count} skull${count === 1 ? "" : "s"}"`));
		assert(puzzleSignature(puzzle) === before, "rating mutated the puzzle");
		const incomplete = Logos.measureExtremeDifficulty(puzzle, 0);
		assert(!incomplete.complete && Logos.extremeSkulls(incomplete) === "(?)");
	}
	assert(Logos.extremeSkulls({ complete: true, skulls: 22 }).includes(" × 22"));
	assert(!Logos.measureExtremeDifficulty({ rows: [{ slots: [{}, {}] }], clues: [] }).complete);
});

Deno.test("extreme bottleneck costs measure branch work separately from its assumption", function() {
	const puzzle = Logos.puzzleFromSeed(0xac185eca);
	puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
	const before = puzzleSignature(puzzle);
	const rating = Logos.traceExtremeDifficulty(puzzle, 10000, { measureCost: true });
	assert(rating.complete && rating.bottlenecks === 4);
	assert(rating.costs.length === rating.bottlenecks);
	const candidates = domains => domains.flat().reduce((n, bits) =>
		n + Logos.countBits(bits), 0);
	const domains = puzzle.rows.map(() => Array(6).fill(63));
	assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
	for (const cost of rating.costs) {
		const assumed = domains.map(row => row.slice());
		assumed[cost.row][cost.symbol] = 1 << cost.column;
		const start = candidates(assumed), work = { passes: 0 };
		assert(!Logos.cluesAllow(puzzle, puzzle.clues, assumed, work));
		assert(cost.eliminations === start - candidates(assumed));
		assert(cost.passes === work.passes && cost.passes > 0);
		const remaining = candidates(domains);
		domains[cost.row][cost.symbol] &= ~(1 << cost.column);
		assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
		assert(cost.progress === remaining - candidates(domains));
	}
	assert(candidates(domains) === 36);
	const options = { measureCost: true, route: 3 };
	assert(JSON.stringify(Logos.traceExtremeDifficulty(puzzle, 10000, options)) ===
		JSON.stringify(Logos.traceExtremeDifficulty(puzzle, 10000, options)));
	const incomplete = Logos.traceExtremeDifficulty(puzzle, 0, options);
	assert(!incomplete.complete && incomplete.costs.length === 0);
	assert(puzzleSignature(puzzle) === before);
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

Deno.test("extremes that exhaust single-choice lemmas receive infinite skulls", function() {
	for (const seed of [0x4c3f2a56, 0x78c9d796]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
		const rating = Logos.measureExtremeDifficulty(puzzle);
		assert(!rating.complete && rating.stalled && rating.skulls === Infinity);
		const html = Logos.extremeSkulls(rating);
		assert(html.includes('aria-label="Infinite skulls"') && html.includes(' × ∞'));
		assert(html.includes('href="#extreme-skull-icon"'));
		const interrupted = Logos.measureExtremeDifficulty(puzzle, 0);
		assert(!interrupted.complete && !interrupted.stalled);
		assert(Logos.extremeSkulls(interrupted) === "(?)");
	}
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
