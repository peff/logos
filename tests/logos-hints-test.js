import {
	Logos, Adjacent2Clue, ColumnClue, assert, makePuzzle,
	exhaustPuzzleDeductions,
} from "./logos-test-helpers.js";

Deno.test("hints find a placement beyond a clue's first target", () => {
	const puzzle = makePuzzle(2);
	const clue = new Adjacent2Clue(puzzle);
	clue.lRow = puzzle.rows[0];
	clue.rRow = puzzle.rows[1];
	clue.lCol = 0;
	clue.rCol = 1;
	puzzle.clues = [clue];
	const domains = puzzle.rows.map(row => row.slots.map(() => 63));
	const left = clue.lRow.slots[0].value;
	const right = clue.rRow.slots[1].value;
	domains[0][left] = 37; // columns 1, 3, 6
	domains[1][right] = 34; // columns 2, 6
	const placements = [0, 0];
	const before = JSON.stringify({domains, placements});
	const first = Logos.clueProofStep(puzzle, clue, domains);
	assert(first.row === 0 && !first.placement,
	       "fixture must offer an earlier discard in the same clue");
	const step = Logos.nextHintStep(puzzle, domains, placements);
	assert(step.row === 1 && step.symbol === right && step.placement && step.domain === 2,
	       "hint overlooked the second target's candidate-based placement");
	assert(step.deduction === "adjacent2.placement", "placement lost its explanation");
	assert(step.domains[0][left] === 37, "hint silently applied another deduction");
	const again = Logos.nextHintStep(puzzle, domains, placements);
	assert(again.row === step.row && again.symbol === step.symbol && again.domain === step.domain,
	       "hint selection is not repeatable");
	assert(JSON.stringify({domains, placements}) === before, "lookahead mutated its input");
});

Deno.test("hints place a three-adjacent middle before discarding its edges", () => {
	const puzzle = Logos.puzzleFromSeed(0xd57ecd6c);
	for (let row = 0; row < 6; row++)
		puzzle.rows[row].slots[0].symbols = Logos.defaultSymbols[row];
	let domains = puzzle.rows.map(row => row.slots.map(() => 63));
	let placements = Array(6).fill(0);
	for (const clue of puzzle.clues)
		if (clue.applyInitialState) clue.constrain(domains, 63);
	Logos.drainForcedProofSteps(domains, placements);
	// Place D and ◇. The latter forces ‒ inward from column five.
	for (let i = 0; i < 2; i++) {
		const step = Logos.nextHintStep(puzzle, domains, placements);
		assert(step && step.placement, "expected an opening placement");
		domains = step.domains;
		placements = step.placements;
	}
	const before = JSON.stringify({ domains, placements });
	const step = Logos.nextHintStep(puzzle, domains, placements);
	assert(step.placement && step.domain == 8 &&
	       step.deduction == "adjacent3.placement.inward-from-edge",
	       "hint discarded candidates despite an available middle placement");
	assert(Logos.proofMessageText(puzzle, step.message) ==
	       "‒ must be in the fourth column because the sequence containing ◇ can only extend toward the center.");
	assert(JSON.stringify({ domains, placements }) == before,
	       "hint mutated the input position");
});

Deno.test("hints favor a discard cascade over a single direct placement", () => {
	const puzzle = makePuzzle(4);
	const direct = new Adjacent2Clue(puzzle);
	direct.lRow = puzzle.rows[2];
	direct.rRow = puzzle.rows[3];
	direct.lCol = 0;
	direct.rCol = 1;
	const cascade = new ColumnClue(puzzle);
	cascade.tRow = puzzle.rows[0];
	cascade.bRow = puzzle.rows[1];
	cascade.col = 0;
	puzzle.clues = [direct, cascade];
	const domains = puzzle.rows.map(row => row.slots.map(() => 63));
	[13, 3, 6, 24, 48, 48].forEach((bits, col) => {
		domains[0][puzzle.rows[0].slots[col].value] = bits;
	});
	domains[1][puzzle.rows[1].slots[0].value] = 12;
	domains[2][puzzle.rows[2].slots[0].value] = 37;
	domains[3][puzzle.rows[3].slots[1].value] = 34;
	const placements = [0, 0, 0, 0];
	const before = JSON.stringify({domains, placements});
	const step = Logos.nextHintStep(puzzle, domains, placements);
	assert(step.clue === cascade && step.row === 0 && !step.placement && step.removed === 1,
	       "hint chose one placement instead of the larger row cascade");
	assert(step.placements.every(bits => bits === 0), "lookahead silently placed tiles");
	const forced = Logos.nextHintStep(puzzle, step.domains, step.placements);
	assert(forced.rule === "only-candidate" && forced.row === 0 && forced.column === 0,
	       "the cascade's first placement was not explained separately");
	assert(JSON.stringify({domains, placements}) === before, "lookahead mutated its input");
});

Deno.test("hint cascade ties retain anchored deduction priority", () => {
	const puzzle = makePuzzle(2);
	const candidate = new Logos.OrderClue(puzzle);
	candidate.lRow = puzzle.rows[0];
	candidate.rRow = puzzle.rows[1];
	candidate.lCol = 0;
	candidate.rCol = 4;
	const anchored = new Logos.OrderClue(puzzle);
	anchored.lRow = puzzle.rows[0];
	anchored.rRow = puzzle.rows[1];
	anchored.lCol = 1;
	anchored.rCol = 3;
	const domains = puzzle.rows.map(row => row.slots.map(() => 63));
	domains[0][candidate.lRow.slots[0].value] = 31;
	domains[1][candidate.rRow.slots[4].value] = 24;
	const placements = [0, 0];
	puzzle.clues = [candidate];
	const first = Logos.nextHintStep(puzzle, domains, placements);
	assert(first.clue === candidate && first.removed === 16 && !first.placement);
	puzzle.clues = [candidate, anchored];
	const step = Logos.nextHintStep(puzzle, domains, placements);
	assert(step.clue === anchored && step.row === 0 && step.removed === 32,
	       "equally productive candidate deduction displaced an anchored one");
	assert(!Logos.nextForcedProofStep(first.domains, first.placements) &&
	       !Logos.nextForcedProofStep(step.domains, step.placements),
	       "fixture deductions must tie without producing placements");
});

Deno.test("hints explain valid progress without changing their input", function() {
	for (const seed of ["98079244", "5be42607", "be0e8074", "7f50dd46"]) {
		const puzzle = Logos.puzzleFromSeed(parseInt(seed, 16));
		let domains = puzzle.rows.map(row => row.slots.map(() => 63));
		let placements = puzzle.rows.map(() => 0);
		for (const clue of puzzle.clues)
			if (clue.applyInitialState)
				clue.constrain(domains, 63);
		let count = 0;
		while (true) {
			const before = JSON.stringify({ domains, placements });
			const step = Logos.nextHintStep(puzzle, domains, placements);
			assert(JSON.stringify({ domains, placements }) == before,
			       "hint mutated the input position");
			if (!step)
				break;
			assert(step.message && ++count < 500, "hint did not make progress");
			domains = step.domains;
			placements = step.placements;
			for (const [row, data] of puzzle.rows.entries())
				for (const [col, slot] of data.slots.entries())
					assert(domains[row][slot.value] & (1 << col),
					       "hint excluded the solution");
		}
		assert(placements.every(bits => bits == 63), "hints stalled");
	}
});

Deno.test("hints preserve the live board and continue in Zen", function() {
	localStorage.setItem("hintAcknowledged", "true");
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame("5be42607");
	const before = puzzle.rows.map(row => row.slots.map(slot =>
		({ single: slot.single, possible: slot.possible.slice() })));
	const log = console.log;
	const messages = [];
	console.log = message => messages.push(message);
	try {
		puzzle.hint();
	} finally {
		console.log = log;
	}
	const snapshot = puzzle.positionSnapshot();
	assert(messages.length == 0, "hint still logged its position");
	assert(snapshot.seed == "5be42607" && snapshot.generatorVersion == 1 &&
	       snapshot.domains.length == 6 && snapshot.placements.length == 6,
	       "position snapshot is incomplete");
	assert(puzzle.practiceMode && !puzzle.scoreEligible &&
	       !puzzle.practiceModePreference && puzzle.timerTimeout === null &&
	       !puzzle.timer.hidden && puzzle.timer.classList.contains("zen") &&
	       localStorage.getItem("practiceMode") === null,
	       "hint did not enter Zen for this game only");
	assert(puzzle.proof.hint && !puzzle.proofControls.hidden,
	       "hint did not open its explanation");
	assert(JSON.stringify(snapshot.domains) == JSON.stringify(puzzle.proof.base),
	       "snapshot was not the pre-hint position");
	puzzle.moveProof(-1);
	assert(puzzle.proofControls.querySelector(".proof-position").textContent ==
	       "Before the proof", "walkthrough did not use proof wording");
	puzzle.moveProof(1);
	puzzle.closeProof();
	assert(!puzzle.proof && !puzzle.pendingProof && !puzzle.gameOver &&
	       !puzzle.explainButton.disabled, "closing hint did not restore play");
	const after = puzzle.rows.map(row => row.slots.map(slot =>
		({ single: slot.single, possible: slot.possible.slice() })));
	assert(JSON.stringify(before) == JSON.stringify(after),
	       "hint applied the deduction to the live board");
	puzzle.say("");
});

Deno.test("a partial contradiction discard is not described as a clue placement", function() {
	const puzzle = makePuzzle(6);
	const clue = new Adjacent2Clue(puzzle);
	clue.lRow = puzzle.rows[0];
	clue.rRow = puzzle.rows[1];
	clue.lCol = 0;
	clue.rCol = 1;
	const symbol = clue.lRow.slots[0].value;
	const domains = Array.from({ length: 6 }, () => Array(6).fill(63));
	domains[0][symbol] = 3;
	domains[1][clue.rRow.slots[1].value] = 32;
	const step = Logos.clueProofStep(puzzle, clue, domains);
	const after = domains[0][symbol] & ~step.removed;
	assert(step.row == 0 && step.symbol == symbol && after == 2);
	assert(!step.placement, "a clue with no supported positions claimed a placement");
	const message = Logos.proofMessageText(puzzle,
		Logos.proofDeductionMessage(puzzle, step, 3, after, domains));
	assert(message.includes("cannot be") && !message.includes("must be in"));
});

Deno.test("lemma selection balances propagated progress against explanatory length", function() {
	// Recreate the old hint route that produced a 41-substep lemma.
	function oldChalkSuggestion(domains) {
		let best;
		for (const trial of Logos.extremeExplorationTrials(puzzle, domains))
			if (!best || trial.gain > best.gain ||
			    trial.gain === best.gain && trial.passes < best.passes)
				best = trial;
		return best;
	}
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0, false, false, true);
	try {
		exhaustPuzzleDeductions(puzzle);
		let { domains, placements } = puzzle.positionSnapshot();
		for (let i = 0; i < 2; i++) {
			const trial = oldChalkSuggestion(domains);
			const lemma = Logos.buildChalkLemma(puzzle, domains, placements, trial);
			({ domains, placements } = lemma.at(-1));
			let step;
			while ((step = Logos.nextHintStep(puzzle, domains, placements)))
				({ domains, placements } = step);
		}
		const before = JSON.stringify([domains, placements]);
		const clues = puzzle.clues.slice();
		const oldTrial = oldChalkSuggestion(domains);
		assert(Logos.buildChalkLemma(puzzle, domains, placements, oldTrial).length == 42);
		const best = Logos.bestChalkLemma(puzzle, domains, placements);
		const trials = Array.from(Logos.extremeExplorationTrials(puzzle, domains));
		const selected = trials.find(trial => trial.row == best[1].row &&
			trial.symbol == best[1].symbol && trial.column == best[1].column);
		const scores = trials.map(trial => {
			const proof = Logos.buildChalkLemma(puzzle, domains, placements, trial);
			return proof.length ? trial.reduction / (proof.length - 1) : 0;
		});
		const selectedProof = Logos.buildChalkLemma(puzzle, domains, placements, selected);
		assert(selected.reduction / (selectedProof.length - 1) == Math.max(...scores),
		       "bounded search skipped a better progress-per-step score");
		assert(best.length < Logos.buildChalkLemma(puzzle, domains, placements, best[1]).length,
		       "simplification did not shorten the selected proof");
		assert(JSON.stringify([domains, placements]) == before);
		assert(puzzle.clues.every((clue, i) => clue === clues[i]));
		assert(best.at(-2).lemmaStage == "contradiction");
		assert(!Logos.buildChalkLemma(puzzle, domains, placements, best[1], clues, 3).length,
		       "length bound returned an incomplete proof");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("chalk row conflicts remain hidden until their contradiction step", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0x0e2b42be, false, false, true);
	try {
		exhaustPuzzleDeductions(puzzle);
		const { domains, placements } = puzzle.positionSnapshot();
		const steps = Logos.buildChalkLemma(puzzle, domains, placements,
			{ row: 0, symbol: 0, column: 2 });
		puzzle.proof = { hint: true, continueGame: true, steps,
			base: domains, basePlacements: placements, position: 3 };
		puzzle.openProofDisplay();
		assert(!puzzle.rows[0].elem.classList.contains("pencil-conflict"));
		assert(puzzle.rows[0].slots[4].possibilityElems[3].className.includes("pencil-selected"));
		puzzle.moveProof(1);
		assert(puzzle.rows[0].elem.classList.contains("pencil-conflict"));
		puzzle.moveProof(1);
		assert(!puzzle.rows[0].elem.classList.contains("pencil-conflict"));
		puzzle.moveProof(-1);
		assert(puzzle.rows[0].elem.classList.contains("pencil-conflict"));
		puzzle.closeProof();
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("chalk lemmas prove contradictions and retain only their final discard", function() {
	for (const seed of [0x0e2b42be, 0xac185eca, 0xd40791eb]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.say = function() {};
		puzzle.newGame(seed, false, false, true);
		try {
			const snapshot = puzzle.positionSnapshot();
			const before = JSON.stringify(snapshot);
			const first = Logos.nextHintStep(puzzle, snapshot.domains, snapshot.placements);
			const steps = Logos.buildHintSteps(puzzle, first);
			assert(steps.at(-1).placements.every(bits => bits == 63));
			let base, assumption, contradiction, count = 0;
			for (const step of steps) {
				if (step.lemmaStage == "start") {
					base = step;
					contradiction = false;
					count++;
				} else if (step.lemmaStage == "assumption") {
					assumption = step;
					assert(!Logos.cluesAllow(puzzle, puzzle.clues,
					       step.domains.map(row => row.slice())));
				} else if (step.lemmaStage == "contradiction") {
					assert(Logos.chalkContradiction(puzzle, step.domains) ||
					       Logos.chalkClueContradiction(puzzle, step.domains));
					contradiction = true;
				} else if (step.lemmaStage == "end") {
					assert(contradiction, "lemma ended without a contradiction");
					const expected = base.domains.map(row => row.slice());
					expected[assumption.row][assumption.symbol] &= ~(1 << assumption.column);
					assert(JSON.stringify(step.domains) == JSON.stringify(expected),
					       "hypothetical deductions leaked into the main proof");
					assert(JSON.stringify(step.placements) == JSON.stringify(base.placements));
					base = null;
				}
			}
			assert(count > 0 && !base);
			assert(JSON.stringify(puzzle.positionSnapshot()) == before);
		} finally {
			puzzle.stopTimer();
		}
	}
});

Deno.test("chalk lemmas highlight an impossible clue before exhausting a domain", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0, false, false, true);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.hint(3);
		const steps = puzzle.proof.steps;
		const index = steps.findIndex(step => step.lemmaStage == "contradiction");
		const step = steps[index];
		assert(step.clue && step.clues[0] === step.clue);
		assert(!Logos.chalkContradiction(puzzle, step.domains),
		       "expected a clue contradiction before any row contradiction");
		const constrained = step.domains.map(row => row.slice());
		step.clue.constrain(constrained, 63);
		assert(constrained.some(row => row.some(bits => bits === 0)));
		assert(JSON.stringify(step.domains) === JSON.stringify(steps[index - 1].domains),
		       "checking the clue applied hypothetical eliminations");
		puzzle.moveProof(index + 1 - puzzle.proof.position);
		assert(step.clue.display.classList.contains("proof-current"));
		assert(puzzle.proofControls.querySelector(".proof-deduction").textContent ===
		       Logos.proofMessageText(puzzle, step.message));
		puzzle.moveProof(1);
		assert(!step.clue.display.classList.contains("proof-current"));
		assert(steps.at(-1).placements.every(bits => bits === 63));
		puzzle.closeProof();
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("walkthroughs still stop when no single-assumption lemma is available", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.clues = [];
	const domains = Array.from({ length: 6 }, () => Array(6).fill(63));
	domains[0][0] = 1;
	const first = Logos.nextHintStep(puzzle, domains, Array(6).fill(0));
	const steps = Logos.buildHintSteps(puzzle, first);
	assert(steps.at(-1).stalled && steps.at(-1).message.includes("chalk"));
	assert(!steps.some(step => step.lemmaStage));
	assert(!Logos.buildChalkLemma(puzzle, first.domains, first.placements,
	       { row: 1, symbol: 0, column: 0 }).length,
	       "a consistent assumption produced a lemma");
});

Deno.test("walkthroughs can start at a stall or an already solved position", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0x0e2b42be, false, false, true);
	try {
		exhaustPuzzleDeductions(puzzle);
		const { domains, placements } = puzzle.positionSnapshot();
		const steps = Logos.buildHintSteps(puzzle, null, domains, placements);
		assert(steps[0].lemmaStage == "start" && steps[0].walkthroughNumber == "1");
		const last = steps.at(-1);
		assert(last.placements.every(bits => bits == 63));
		assert(Logos.buildHintSteps(puzzle, null, last.domains, last.placements).length == 0);
		puzzle.clues = [];
		const stalled = Logos.buildHintSteps(puzzle, null,
			Array.from({ length: 6 }, () => Array(6).fill(63)), Array(6).fill(0));
		assert(stalled.length == 1 && stalled[0].stalled);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("expanded hints keep the first step while choosing a shorter continuation", function() {
	localStorage.setItem("hintAcknowledged", "true");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("25324d52");
	const clues = puzzle.clues.slice();
	try {
		puzzle.hint(2);
		const first = puzzle.hintRequest.step;
		const firstState = JSON.stringify([first.domains, first.placements]);
		const original = [first];
		let next = first;
		while ((next = Logos.nextHintStep(puzzle, next.domains, next.placements)))
			original.push(next);
		puzzle.showHint(3);
		const steps = puzzle.proof.steps;
		assert(original.length == 94 && steps.length == 80,
		       "expanded hint did not find the shorter continuation");
		assert(steps[0] === first &&
		       JSON.stringify([first.domains, first.placements]) == firstState,
		       "expanding the hint changed its first deduction");
		assert(steps.at(-1).placements.every(bits => bits == 63) &&
		       steps.at(-1).conclusion,
		       "expanded hint did not finish the puzzle");
		const repeated = Logos.buildHintSteps(puzzle, first);
		assert(JSON.stringify(repeated.map(step => step.message)) ==
		       JSON.stringify(steps.map(step => step.message)) &&
		       puzzle.clues.every((clue, i) => clue === clues[i]),
		       "expanding again changed the route or displayed clue order");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("because reveals a hint progressively and resets after a move", function() {
	localStorage.setItem("hintAcknowledged", "true");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame("f2551f26");
	const log = console.log;
	const messages = [];
	console.log = message => messages.push(message);
	try {
		assert(!puzzle.explainButton.disabled, "live hints are disabled");
		puzzle.explainLoss();
		const request = puzzle.hintRequest;
		const announcement = puzzle.messages.innerHTML;
		assert(request.stage == 1 && !puzzle.proof && puzzle.practiceMode,
		       "first press did not enter Zen with a clue hint");
		assert(request.step.clues.some(clue =>
		       clue.display.classList.contains("hint-current")),
		       "first press did not highlight the clue");
		puzzle.explainLoss();
		assert(request.stage == 2 && !puzzle.proof &&
		       !puzzle.proofControls.hidden &&
		       puzzle.proofControls.classList.contains("hint-explanation") &&
		       puzzle.proofControls.querySelector(".proof-deduction").textContent ==
		       Logos.proofMessageText(puzzle, request.step.message),
		       "second press did not explain the same step");
		assert(puzzle.proofControls.querySelector(".proof-previous").disabled &&
		       puzzle.proofControls.querySelector(".proof-next").disabled,
		       "text hint left navigation enabled");
		assert(puzzle.messages.innerHTML == announcement &&
		       puzzle.rows.every(row => row.slots.every(slot =>
			       slot.possibleElem.className != "proof")),
		       "text hint changed the status message or board display");
		puzzle.explainLoss();
		assert(puzzle.proof.hint && puzzle.proof.steps[0] === request.step &&
		       puzzle.proof.steps.length > 1 && messages.length == 0,
		       "third press did not expand the same hint without console output");
		const final = puzzle.proof.steps.at(-1);
		assert(final.placements.every(bits => bits == 63),
		       "walkthrough does not reach the solution");
		puzzle.moveProof(puzzle.proof.steps.length - 1);
		assert(puzzle.proofControls.querySelector(".proof-deduction").textContent.endsWith(
		       " Q.E.D."), "completed walkthrough did not say Q.E.D.");
		puzzle.moveProof(1 - puzzle.proof.position);
		puzzle.moveProof(1);
		assert(puzzle.proof.position == 2, "cannot advance through hints");
		puzzle.explainLoss();
		assert(!puzzle.proof && !puzzle.hintRequest && !puzzle.pendingProof,
		       "closing walkthrough left stale hint state");
		puzzle.explainLoss();
		const slot = puzzle.rows[0].slots.find(slot => !slot.single);
		slot.discard((slot.value + 1) % 6);
		assert(!puzzle.hintRequest && puzzle.clues.every(clue =>
		       !clue.display || !clue.display.classList.contains("hint-current")),
		       "a move did not clear the hint");
		assert(puzzle.proofControls.hidden && puzzle.messages.classList.contains("fading"),
		       "move did not hide the hint panel and fade the status message");
		puzzle.explainLoss();
		puzzle.newGame("98079244");
		assert(!puzzle.hintRequest && !puzzle.proof,
		       "new game retained the hint");
		puzzle.stopTimer();
		puzzle.say("");
	} finally {
		console.log = log;
	}
});

Deno.test("first hint notice is remembered only after acceptance", function() {
	localStorage.removeItem("hintAcknowledged");
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame("f2551f26");
	puzzle.explainLoss();
	assert(!puzzle.hintNotice.hidden && puzzle.paused && !puzzle.practiceMode &&
	       puzzle.scoreEligible && !puzzle.hintRequest, "notice revealed assistance");
	puzzle.finishHintNotice(false);
	assert(puzzle.hintNotice.hidden && !puzzle.paused && puzzle.scoreEligible &&
	       !puzzle.hintAcknowledged && !localStorage.getItem("hintAcknowledged"),
	       "cancelling acknowledged the notice or changed the game");
	puzzle.explainLoss();
	const log = console.log;
	console.log = () => {};
	try {
		puzzle.finishHintNotice(true);
		assert(puzzle.practiceMode && puzzle.hintRequest.stage == 1 &&
		       !puzzle.scoreEligible && localStorage.getItem("hintAcknowledged") == "true",
		       "acceptance did not remember the notice and show the hint");
		const next = makePuzzle(6, false, Logos.defaultSymbols);
		assert(next.hintAcknowledged, "acknowledgement was not loaded");
		puzzle.newGame("98079244");
		puzzle.explainLoss();
		assert(puzzle.hintNotice.hidden && puzzle.hintRequest,
		       "acknowledged notice appeared again");
		puzzle.clearHint();
		puzzle.say("");
		localStorage.removeItem("hintAcknowledged");
		const zen = makePuzzle(6, false, Logos.defaultSymbols);
		zen.setPracticeMode(true);
		zen.newGame("98079244");
		zen.explainLoss();
		assert(zen.hintNotice.hidden && zen.hintRequest && !zen.hintAcknowledged &&
		       !localStorage.getItem("hintAcknowledged"),
		       "Zen hint showed or acknowledged the warning");
		zen.clearHint();
		zen.say("");
	} finally {
		console.log = log;
		localStorage.removeItem("hintAcknowledged");
		localStorage.removeItem("practiceMode");
	}
});

Deno.test("analysis unlocks within one Options visit and refreshes the current position", function() {
	localStorage.removeItem("analysisUnlocked");
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("1566fa35");
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	puzzle.openAnalysis();
	puzzle.openAnalysis();
	assert(puzzle.analysis.hidden && !puzzle.analysisUnlocked, "analysis unlocked too early");
	puzzle.toggleOptions();
	puzzle.toggleOptions();
	puzzle.openAnalysis();
	assert(puzzle.analysis.hidden && puzzle.analysisClicks == 1,
	       "partial unlock survived closing Options");
	const input = puzzle.options.querySelector("#game-seed");
	input.value = "bad seed";
	puzzle.openAnalysis();
	assert(puzzle.analysisClicks == 1, "invalid seed counted toward unlock");
	input.value = "98079244";
	puzzle.openAnalysis();
	assert(puzzle.analysisClicks == 1, "different seed counted toward unlock");
	input.value = "1566fa35";
	const before = JSON.stringify(puzzle.positionSnapshot());
	puzzle.openAnalysis();
	puzzle.openAnalysis();
	assert(!puzzle.analysis.hidden && puzzle.options.hidden && puzzle.paused &&
	       puzzle.analysisUnlocked && localStorage.getItem("analysisUnlocked") == "true",
	       "third click did not open and remember analysis");
	assert(!puzzle.practiceMode && puzzle.scoreEligible &&
	       puzzle.analysisSnapshot == before && JSON.stringify(puzzle.positionSnapshot()) == before,
	       "analysis changed the board or scoring eligibility");
	assert(puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Difficulty: easy") &&
	       puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Cutoffs: Easy < 47; Medium < 70;"),
	       "analysis is missing its rating");
	puzzle.closeAnalysis();
	assert(puzzle.analysis.hidden && puzzle.options.hidden && !puzzle.paused &&
	       puzzle.timerTimeout !== null, "closing analysis did not return to the running game");
	const slot = puzzle.rows[0].slots.find(slot => !slot.single);
	slot.discard((slot.value + 1) % 6);
	puzzle.toggleOptions();
	puzzle.openAnalysis();
	assert(!puzzle.analysis.hidden && puzzle.analysisSnapshot != before &&
	       puzzle.analysisSnapshot == JSON.stringify(puzzle.positionSnapshot()),
	       "unlocked analysis did not open immediately with fresh state");
	puzzle.closeAnalysis();
	const next = makePuzzle(6);
	assert(next.analysisUnlocked, "analysis unlock was not restored");
	puzzle.newGame("1566fa35", true);
	puzzle.openAnalysis();
	assert(puzzle.analysis.hidden, "analysis opened before Start Game");
	localStorage.removeItem("analysisUnlocked");
});

Deno.test("analysis copies the displayed snapshot", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("1566fa35");
	puzzle.stopTimer();
	puzzle.options.hidden = false;
	puzzle.analysisUnlocked = true;
	puzzle.openAnalysis();
	const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	let copied;
	Object.defineProperty(navigator, "clipboard", {configurable:true,
		value:{writeText: async text => { copied = text; }}});
	try {
		await puzzle.copyAnalysisPosition();
		assert(copied == puzzle.analysisSnapshot && JSON.parse(copied).seed == "1566fa35" &&
		       puzzle.analysis.querySelector(".analysis-copy").textContent == "Copied",
		       "copy did not preserve the displayed snapshot");
	} finally {
		if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
		else delete navigator.clipboard;
	}
});

Deno.test("adjacency hints place a target whose other neighbor was eliminated", () => {
	const puzzle = Logos.puzzleFromSeed(0xe36efbeb);
	for (let row = 0; row < 6; row++)
		puzzle.rows[row].slots[0].symbols = Logos.defaultSymbols[row];
	let domains = puzzle.rows.map(row => row.slots.map(() => 63));
	let placements = Array(6).fill(0);
	for (const clue of puzzle.clues)
		if (clue.applyInitialState) clue.constrain(domains, 63);
	for (let i = 0; i < 100; i++) {
		const step = Logos.nextHintStep(puzzle, domains, placements);
		assert(step, "hint trace ended before the dice placement");
		if (step.row == 3 && step.symbol == 2) {
			assert(step.placement && step.domain == 2 &&
			       step.deduction == "adjacent2.placement",
			       "adjacency was presented as discards followed by row elimination");
			assert(Logos.proofMessageText(puzzle, step.message) ==
			       "⚂ must be in the second column because that is the only remaining position adjacent to 5.");
			assert(step.placements[3] & 4, "hint did not apply the placement");
			return;
		}
		domains = step.domains;
		placements = step.placements;
	}
	throw new Error("dice placement not reached");
});
