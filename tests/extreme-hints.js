import {
	Logos, assert, makePuzzle, exhaustPuzzleDeductions,
} from "./helpers.js";

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

Deno.test("extreme mistakes use chalk lemmas to explain placements and eliminations", function() {
	for (const action of ["discard", "choose"]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.say = function() {};
		puzzle.setPracticeMode(true);
		puzzle.newGame("33ebf04c", false, false, true);
		const slot = puzzle.rows[3].slots[action == "discard" ? 5 : 3];
		assert(puzzle.rows[3].slots[5].value == 0);
		const before = JSON.stringify(puzzle.positionSnapshot());
		slot[action](0);
		assert(puzzle.pendingProof, "mistake did not offer an explanation");
		puzzle.explainLoss();
		assert(puzzle.proof, "extreme mistake did not open a proof");
		const steps = puzzle.proof.steps;
		assert(steps.some(step => step.lemmaStage == "contradiction"),
		       "explanation did not include a chalk lemma");
		const last = steps.at(-1);
		assert(last.conclusion && !last.stalled && !last.chalkBase &&
		       Logos.proofConclusionPresented(puzzle, last.domains,
			last.placements, slot, 0),
		       "explanation did not establish the mistake on the real board");
		assert(!steps.slice(0, -1).some(step => !step.chalkBase &&
		       Logos.proofConclusionPresented(puzzle, step.domains,
			step.placements, slot, 0)),
		       "explanation continued after proving the mistake");
		while (puzzle.proof.position < steps.length)
			puzzle.moveProof(1);
		puzzle.closeProof();
		assert(puzzle.pendingProof &&
		       JSON.stringify(puzzle.positionSnapshot()) == before,
		       "explanation changed the board or could not be reopened");
		puzzle.explainLoss();
		assert(puzzle.proof, "mistake explanation could not be reopened");
		puzzle.stopTimer();
		localStorage.removeItem("practiceMode");
	}
});

function ghostMistakeProof() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("33ebf04c", false, false, true);
	puzzle.stopTimer();
	const base = Logos.domainsFromSlots(puzzle);
	const placements = Logos.proofPlacementsFromSlots(puzzle);
	const target = puzzle.rows[3].slots[5];
	const full = Logos.buildHintSteps(puzzle, null, base, placements);
	const end = full.findIndex(step => !step.chalkBase &&
		Logos.proofConclusionPresented(puzzle, step.domains, step.placements, target, 0));
	assert(end >= 0);
	const original = full.slice(0, end + 1);
	const pruned = Logos.pruneLemmaProof(puzzle, base, placements, original, target, 0);
	return { puzzle, base, placements, target, original, pruned };
}

Deno.test("mistake pruning removes whole lemmas and preserves their hypothetical boundaries", function() {
	const { puzzle, base, placements, target, original, pruned } = ghostMistakeProof();
	assert(pruned.length < original.length, "lemma proof was not shortened");
	assert(pruned.filter(s => s.lemmaStage == "start").length <
	       original.filter(s => s.lemmaStage == "start").length,
	       "unused lemma was retained");
	let domains = structuredClone(base), placed = placements.slice();
	let assumption, lemmaBase, lemmaPlacements;
	let number = 0, substep = 0;
	function same(actual, expected) {
		assert(JSON.stringify(actual) == JSON.stringify(expected), "stale proof snapshot");
	}
	for (const step of pruned) {
		if (!step.lemmaStage || step.lemmaStage == "start") {
			number++;
			substep = 0;
			assert(step.walkthroughNumber == String(number));
		} else {
			assert(step.walkthroughNumber == number + "." + (++substep));
		}
		if (step.lemmaStage == "start") {
			assert(!assumption, "nested or unfinished lemma");
			lemmaBase = structuredClone(domains);
			lemmaPlacements = placed.slice();
		} else if (step.lemmaStage == "contradiction") {
			assert(assumption && (Logos.chalkContradiction(puzzle, domains) ||
			       Logos.chalkClueContradiction(puzzle, domains)),
			       "lemma did not reach a contradiction");
		} else if (step.lemmaStage == "end") {
			assert(step.row == assumption.row && step.symbol == assumption.symbol &&
			       step.removed == 1 << assumption.column);
			domains = lemmaBase;
			placed = lemmaPlacements;
			domains[step.row][step.symbol] &= ~step.removed;
			assumption = null;
		} else {
			if (step.lemmaStage == "assumption") {
				assumption = step;
			} else {
				assert(Logos.proofStepSupported(puzzle, step, domains, placed),
				       "deduction lost its prerequisites");
				if (step.clue) {
					const trial = structuredClone(domains);
					step.clue.constrain(trial, 63);
					assert(!(step.removed & trial[step.row][step.symbol]),
					       "clue does not justify displayed removals");
				}
			}
			domains[step.row][step.symbol] &= ~step.removed;
			if (step.placement) {
				placed[step.row] |= 1 << step.symbol;
				for (let symbol = 0; symbol < 6; symbol++)
					if (symbol != step.symbol)
						domains[step.row][symbol] &= ~domains[step.row][step.symbol];
			}
		}
		same(step.domains, domains);
		same(step.placements, placed);
		if (step.chalkBase) {
			same(step.chalkBase, lemmaBase);
			same(step.chalkBasePlacements, lemmaPlacements);
		}
	}
	assert(!assumption && pruned.at(-1).conclusion &&
	       Logos.proofConclusionPresented(puzzle, domains, placed, target, 0));
});

Deno.test("lemma replay can change contradictions but cannot assume missing prerequisites", function() {
	const { puzzle, base, placements, pruned } = ghostMistakeProof();
	const deductions = Logos.lemmaProofDeductions(puzzle, pruned);
	const lemmas = deductions.filter(step => step.rule == "lemma");
	const first = lemmas[0];
	const target = puzzle.rows[first.row].slots[first.column];
	const rebuilt = Logos.replayLemmaProof(puzzle, base, placements, [first], target, first.symbol);
	assert(rebuilt, "a different contradiction could not prove the same discard");
	assert(rebuilt.find(s => s.lemmaStage == "contradiction").message !=
	       pruned.find(s => s.lemmaStage == "contradiction").message,
	       "fixture no longer exercises a different contradiction");

	const dependent = lemmas.find(step => step.row == 5 && step.symbol == 5);
	assert(dependent);
	const dependentTarget = puzzle.rows[dependent.row].slots[dependent.column];
	assert(!Logos.replayLemmaProof(puzzle, base, placements, [dependent],
		dependentTarget, dependent.symbol), "unproved lemma discard was accepted");
	const assumption = pruned.find(s => s.lemmaStage == "assumption" &&
		s.row == dependent.row && s.symbol == dependent.symbol);
	assert(Logos.replayLemmaProof(puzzle, assumption.chalkBase,
		assumption.chalkBasePlacements, [dependent], dependentTarget, dependent.symbol),
		"lemma could not be rebuilt with its prerequisites");
});

Deno.test("lemma pruning counts expanded steps when considering a shorter outer proof", function() {
	const { puzzle, base, placements, target, pruned } = ghostMistakeProof();
	const deductions = Logos.lemmaProofDeductions(puzzle, pruned);
	const index = deductions.findIndex(step => step.rule == "clue" &&
		step.row == 5 && step.symbol == 3);
	assert(index >= 0);
	const trial = deductions.filter((step, i) => i != index);
	const longer = Logos.replayLemmaProof(puzzle, base, placements, trial, target, 0);
	assert(longer && longer.length > pruned.length,
	       "fixture no longer trades an outer deduction for a longer lemma");
	assert(!Logos.replayLemmaProof(puzzle, base, placements, trial,
		target, 0, pruned.length), "expanded proof length limit was ignored");
});
