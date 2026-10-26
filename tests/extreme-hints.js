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
