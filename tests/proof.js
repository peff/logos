import {
	Logos, FakeElement, ExactClue, Adjacent2Clue, ColumnClue, source,
	assert, makePuzzle,
} from "./helpers.js";

/* These presentation fixtures need a particular route's deductions even when
 * another route now produces a shorter explanation of the same failed move.
 */
function useOriginalProofRoute(puzzle) {
	const proof = puzzle.proof;
	proof.steps = Logos.buildProofRoute(puzzle, proof.base,
		proof.basePlacements, proof.failedSlot, proof.failedValue,
		puzzle.clues);
	proof.position = 1;
	puzzle.showProofPosition();
}

Deno.test("a directly contradicting clue is highlighted", function() {
	const puzzle = makePuzzle(2);
	const left = puzzle.rows[0].slots[0];
	const right = puzzle.rows[1].slots[1];
	const target = puzzle.rows[0].slots[5];
	const clue = new Adjacent2Clue(puzzle);
	clue.lRow = left.row;
	clue.lCol = 0;
	clue.rRow = right.row;
	clue.rCol = 1;
	clue.display = new FakeElement();
	clue.display.classList.add("clue");
	puzzle.clues = [clue];
	clue.active = false;
	clue.display.classList.add("clue-hidden");

	right.choose(right.value);
	target.choose(left.value);
	assert(clue.display.classList.contains("contradiction"),
	       "contradicting clue was not highlighted");
	assert(clue.active &&
	       !clue.display.classList.contains("clue-hidden"),
	       "contradicting clue remained dismissed");
	assert(puzzle.hClues.classList.contains("solution") &&
	       puzzle.vClues.classList.contains("solution"),
	       "clue displays were not marked as a solution");
	assert(!puzzle.explainButton.classList.contains("proof-available"),
	       "the Because button competed with a highlighted clue");
});

Deno.test("only one directly contradicting clue is highlighted", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("ae9a519e");
	const target = puzzle.rows[2].slots[5];
	assert(target.value != 5, "seed unexpectedly places VI in position six");
	target.choose(5);
	const highlighted = puzzle.clues.filter(clue => clue.display &&
		clue.display.classList.contains("contradiction"));
	assert(highlighted.length == 1,
	       "more than one direct contradiction was highlighted");
	puzzle.stopTimer();
});

Deno.test("multi-clue contradictions are not highlighted", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const correct = 1 << 0;
	const alternatives = [1 << 1, 1 << 2];
	const makeClue = function(alternative) {
		return {
			display: new FakeElement(),
			constrain(domains) {
				const old = domains[0][slot.value];
				domains[0][slot.value] &= correct | alternative;
				return old != domains[0][slot.value];
			},
		};
	};
	const clues = alternatives.map(makeClue);
	puzzle.clues = clues;

	slot.discard(slot.value);
	for (const clue of clues)
		assert(!clue.display.classList.contains("contradiction"),
		       "a multi-clue explanation was highlighted");
	assert(puzzle.pendingProof && !puzzle.explainButton.disabled,
	       "the detailed proof was not offered without highlighted clues");
	assert(puzzle.explainButton.classList.contains("proof-available"),
	       "the Because button was not highlighted without a direct clue");
});

Deno.test("every referenced proof deduction has a catalog entry", function() {
	const ids = new Set(Logos.proofDeductionCatalog.map(entry => entry.id));
	const families = new Set([...ids].map(id => id.split(".")[0]));
	const referenced = new Set();
	/* Direct calls also catch newly introduced families. Other literals
	 * include IDs selected dynamically for conclusions or used to combine
	 * related steps.
	 */
	for (const match of source.matchAll(/identifiedDeduction\(\s*step,\s*"([^"]+)"/g))
		referenced.add(match[1]);
	for (const match of source.matchAll(/"([a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+)"/g))
		if (families.has(match[1].split(".")[0]))
			referenced.add(match[1]);
	for (const id of referenced)
		assert(ids.has(id), "missing proof deduction: " + id);
});

Deno.test("proof traces prune deductions unrelated to the mistake", function() {
	const puzzle = makePuzzle(2);
	const failed = puzzle.rows[1].slots[0];
	const noise = new ExactClue(puzzle);
	noise.row = puzzle.rows[0];
	noise.slot = noise.row.slots[0];
	noise.display = new FakeElement();
	const relevant = new ExactClue(puzzle);
	relevant.row = failed.row;
	relevant.slot = failed;
	relevant.display = new FakeElement();
	puzzle.clues = [noise, relevant];
	puzzle.startProof(failed, failed.value);

	assert(puzzle.proof.steps.every(step =>
	       !step.clues.length || step.clues[0] == relevant),
	       "the proof retained an unrelated clue deduction");
	const deducedTile = failed.row.slots[1].possibilityElems[failed.value];
	assert(deducedTile.className.includes("proof-impossible"),
	       "the first proof deduction was not displayed");
	assert(failed.singleElem.classList.contains("proof-change"),
	       "the current proof placement was not highlighted");
	puzzle.moveProof(-1);
	assert(!deducedTile.className.includes("proof-impossible"),
	       "moving backward did not restore the board");
	assert(!failed.singleElem.classList.contains("proof-change"),
	       "moving backward did not clear the change highlight");
	puzzle.moveProof(1);
	assert(deducedTile.className.includes("proof-impossible"),
	       "moving forward did not restore the deduction");
	assert(failed.singleElem.classList.contains("proof-change"),
	       "moving forward did not restore the change highlight");
	assert(!failed.single,
	       "a proof deduction was promoted to a placed tile");
});

Deno.test("ordering deductions name the obstructing tile", function() {
	const puzzle = makePuzzle(2);
	const clue = {
		lRow: puzzle.rows[0],
		lCol: 0,
		rRow: puzzle.rows[1],
		rCol: 0,
	};
	clue.lRow.slots[0].value = 0;
	clue.rRow.slots[0].value = 1;
	const step = { clue, row: 1, symbol: 1 };
	const full = (1 << 6) - 1;
	assert(Logos.proofMessageText(puzzle,
	       Logos.orderDeductionMessage(puzzle, step, full,
	       full & ~(1 << 3))) ==
	       "1 cannot be in the fourth column because 0 must be to its left.",
	       "an inner ordering deduction did not name the other tile");
	assert(Logos.proofMessageText(puzzle,
	       Logos.orderDeductionMessage(puzzle, step, full,
	       full & ~1)) ==
	       "1 cannot be in the first column because 0 must be to its left.",
	       "an edge ordering deduction did not name the other tile");
});

Deno.test("ordering placements explain both directions", function() {
	const puzzle = makePuzzle(2);
	const clue = new Logos.OrderClue(puzzle);
	clue.lRow = puzzle.rows[0];
	clue.lCol = 0;
	clue.rRow = puzzle.rows[1];
	clue.rCol = 0;
	clue.lRow.slots[0].value = 0;
	clue.rRow.slots[0].value = 1;
	for (const [row, symbol, otherCol, col, direction] of [
		[1, 1, 4, 5, "right"],
		[0, 0, 1, 0, "left"],
	]) {
		const domains = Array.from({ length: 2 }, () => Array(6).fill(63));
		domains[1 - row][1 - symbol] = 1 << otherCol;
		const step = Logos.clueProofStep(puzzle, clue, domains);
		assert(step.placement && step.row == row && step.symbol == symbol,
		       "the ordering clue did not directly place the target");
		const message = Logos.proofDeductionMessage(puzzle, step, 63,
			63 & ~step.removed, domains);
		assert(step.deduction == "order.placement" &&
		       Logos.proofMessageText(puzzle, message) ==
		       symbol + " must be in the " + (col == 0 ? "first" : "sixth") +
		       " column because it must be to the " + direction + " of " +
		       (1 - symbol) + ".",
		       "the placement did not explain the ordering relation");
	}
});

Deno.test("three-adjacent middle deductions remove edges first", function() {
	const puzzle = makePuzzle(3);
	const middle = puzzle.rows[0];
	const left = puzzle.rows[1];
	const right = puzzle.rows[2];
	middle.slots[0].value = 0;
	left.slots[0].value = 1;
	right.slots[0].value = 2;
	const clue = new Logos.Adjacent3Clue(puzzle);
	clue.mRow = middle;
	clue.mCol = 0;
	clue.lRow = left;
	clue.lCol = 0;
	clue.rRow = right;
	clue.rCol = 0;
	const full = (1 << 6) - 1;
	const domains = Array.from({ length: 3 }, () => Array(6).fill(full));
	domains[1][1] &= ~1;
	domains[2][2] &= ~1;

	const edgeStep = Logos.clueProofStep(puzzle, clue, domains);
	assert(edgeStep.row == 0 && edgeStep.symbol == 0 &&
	       edgeStep.removed == 33,
	       "edge and domain-dependent removals were grouped together");
	domains[0][0] &= ~edgeStep.removed;
	const innerStep = Logos.clueProofStep(puzzle, clue, domains);
	assert(innerStep.row == 0 && innerStep.symbol == 0 &&
	       innerStep.removed == 2,
	       "the adjacent inner position did not follow the edge deduction");
	const edgeMessage = Logos.adjacent3DeductionMessage(puzzle, edgeStep,
		full, domains[0][0], domains);
	assert(Logos.proofMessageText(puzzle, edgeMessage) ==
	       "0 cannot be on either edge because it is between two symbols.",
	       "the edge deduction was not explained independently");
	const innerMessage = Logos.adjacent3DeductionMessage(puzzle, innerStep,
		domains[0][0], domains[0][0] & ~innerStep.removed, domains);
	assert(Logos.proofMessageText(puzzle, innerMessage) ==
	       "0 cannot be in the second column because neither 1 nor 2 can " +
	       "be in the first column.",
	       "the adjacent inner deduction was not explained independently");
});

for (const test of [
	{ name: "refresh keeps an elimination when placement needs a middle deduction",
	  middle: 20, placement: false, removed: 16,
	  expectedPlacement: false, expectedRemoved: 16, supported: true },
	{ name: "refresh can promote an elimination to a supported placement",
	  middle: 4, placement: false, removed: 16,
	  expectedPlacement: true, expectedRemoved: 51, supported: true },
	{ name: "refresh preserves the prerequisites of an existing placement",
	  middle: 20, placement: true, removed: 51,
	  expectedPlacement: true, expectedRemoved: 51, supported: false },
]) {
	Deno.test(test.name, function() {
		const puzzle = makePuzzle(3);
		const clue = new Logos.Adjacent3Clue(puzzle);
		clue.lRow = puzzle.rows[0];
		clue.mRow = puzzle.rows[1];
		clue.rRow = puzzle.rows[2];
		clue.lCol = clue.mCol = clue.rCol = 0;
		puzzle.rows.forEach((row, index) => { row.slots[0].value = index; });
		const domains = Array.from({ length: 3 }, () => Array(6).fill(63));
		/* The only sequence is left=2, middle=3, right=4. A middle
		 * candidate in column 5 must be explained before placing right,
		 * but does not prevent eliminating right from column 5.
		 */
		domains[0][0] = 6;
		domains[1][1] = test.middle;
		domains[2][2] = 59;
		const step = { clue, rule: "clue", row: 2, symbol: 2,
			placement: test.placement, removed: test.removed };
		const refreshed = Logos.refreshProofStep(puzzle, step, domains);
		assert(refreshed && refreshed.placement === test.expectedPlacement &&
		       refreshed.removed === test.expectedRemoved,
		       "refresh changed the deduction's intended strength");
		assert(Logos.proofStepSupported(puzzle, refreshed, domains, [0, 0, 0]) ===
		       test.supported, "refresh changed the placement prerequisites");
	});
}

Deno.test("a three-adjacent middle placement fills fixed outer symbols",
function() {
	const puzzle = makePuzzle(3);
	const clue = new Logos.Adjacent3Clue(puzzle);
	clue.mRow = puzzle.rows[0];
	clue.lRow = puzzle.rows[1];
	clue.rRow = puzzle.rows[2];
	clue.mCol = clue.lCol = clue.rCol = 0;
	clue.mRow.slots[0].value = 0;
	clue.lRow.slots[0].value = 1;
	clue.rRow.slots[0].value = 2;
	const full = (1 << 6) - 1;
	const domains = Array.from({ length: 3 }, () => Array(6).fill(full));
	domains[0][0] = 1 << 2;
	domains[1][1] = 1 << 1;
	domains[2][2] = 1 << 3;
	const step = { clue, placement: true, row: 0, symbol: 0 };
	const message = Logos.adjacent3DeductionMessage(puzzle, step, full,
		domains[0][0], domains);
	assert(step.deduction == "adjacent3.middle.placement-between" &&
	       Logos.proofMessageText(puzzle, message) ==
	       "0 must be in the third column because it must be between 1 " +
	       "and 2.",
	       "the middle symbol was not explained as filling a fixed gap");
});

Deno.test("outer edge removals need a shared cause to stay grouped", function() {
	const puzzle = makePuzzle(3);
	const clue = new Logos.Adjacent3Clue(puzzle);
	clue.lRow = puzzle.rows[0];
	clue.mRow = puzzle.rows[1];
	clue.rRow = puzzle.rows[2];
	clue.lCol = clue.mCol = clue.rCol = 0;
	puzzle.rows.forEach((row, index) => { row.slots[0].value = index; });
	const step = { clue, rule: "clue", row: 0, symbol: 0,
		placement: false, removed: 33 };
	const domains = Array.from({ length: 3 }, () => Array(6).fill(63));
	/* At the first edge the middle cannot fit; at the sixth edge the
	 * other outer symbol cannot fit. These need separate explanations.
	 */
	domains[1][1] = 56;
	domains[2][2] = 20;
	for (const [removed, reason] of [
		[1, "adjacent3.outer.middle-not-adjacent"],
		[32, "adjacent3.outer.other-not-two-away"],
	]) {
		const refreshed = Logos.refreshProofStep(puzzle, step, domains);
		assert(refreshed && refreshed.removed == removed,
		       "outer edge removals with different causes stayed grouped");
		const before = domains[0][0];
		domains[0][0] &= ~refreshed.removed;
		Logos.proofDeductionMessage(puzzle, refreshed, before,
			domains[0][0], domains);
		assert(refreshed.deduction == reason,
		       "the edge removal did not explain its own cause");
	}
	/* Neither edge is adjacent to a middle in column 3 or 4. */
	domains[0][0] = domains[2][2] = 63;
	domains[1][1] = 12;
	const grouped = Logos.refreshProofStep(puzzle, step, domains);
	assert(grouped && grouped.removed == 33,
	       "outer edge removals with a shared cause were split");
});

Deno.test("related middle adjacency removals share one proof step", function() {
	const puzzle = makePuzzle(3);
	puzzle.rows[0].slots[0].value = 0;
	puzzle.rows[1].slots[1].value = 1;
	puzzle.rows[2].slots[2].value = 2;
	const clue = new Logos.Adjacent3Clue(puzzle);
	clue.mRow = puzzle.rows[0];
	clue.mCol = 0;
	clue.lRow = puzzle.rows[1];
	clue.lCol = 1;
	clue.rRow = puzzle.rows[2];
	clue.rCol = 2;
	const full = (1 << 6) - 1;
	const before = full & ~33;
	const snapshots = Array.from({ length: 2 }, () =>
		Array.from({ length: 3 }, () => Array(6).fill(full)));
	snapshots[0][1][1] = 1 | 4 | 16;
	snapshots[1][1][1] = 1 | 4 | 16;
	snapshots[0][0][0] = before & ~4;
	snapshots[1][0][0] = before & ~4 & ~16;
	const common = {
		clue: clue,
		clues: [],
		deduction: "adjacent3.middle.outer-not-adjacent",
		deductionValues: { outer: "1" },
		placement: false,
		placements: [0, 0, 0],
		row: 0,
		symbol: 0,
	};
	const steps = Logos.combineRelatedProofSteps(puzzle, [
		Object.assign({}, common, {
			removed: 4,
			domain: before & ~4,
			domains: snapshots[0],
		}),
		Object.assign({}, common, {
			removed: 16,
			domain: before & ~4 & ~16,
			domains: snapshots[1],
		}),
	]);
	assert(steps.length == 1 && steps[0].removed == (4 | 16),
	       "matching adjacency removals were not combined");
	assert(Logos.proofMessageText(puzzle, steps[0].message) ==
	       "0 cannot be in the third and fifth columns because 1 must be adjacent.",
	       "the combined removal did not list both positions");
});

Deno.test("a direct clue is preferred to global clue blame", function() {
	const puzzle = makePuzzle(2);
	const top = puzzle.rows[0].slots[0];
	const bottom = puzzle.rows[1].slots[0];
	const clue = new ColumnClue(puzzle);
	clue.tRow = top.row;
	clue.bRow = bottom.row;
	clue.col = 0;
	clue.display = new FakeElement();
	const forceBottom = {
		constrain(domains) {
			const old = domains[1][bottom.value];
			domains[1][bottom.value] &= 1 << 0;
			return old != domains[1][bottom.value];
		},
	};
	puzzle.clues = [clue, forceBottom];
	top.choose(top.value);

	bottom.discard(bottom.value);
	assert(clue.display.classList.contains("contradiction"),
	       "direct column clue was not highlighted");
});

Deno.test("proof displays highlight current removals", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[1];
	const full = (1 << 6) - 1;
	const domains = Array(6).fill(full);
	domains[2] &= ~(1 << 1);
	slot.displayProof(domains, 1, 0, {
		row: 0,
		symbol: 2,
		removed: 1 << 1,
		placement: false,
	});
	assert(slot.possibilityElems[2].className.includes("proof-impossible") &&
	       slot.possibilityElems[2].className.includes("proof-change"),
	       "a removed possibility did not retain a highlighted spot");
	slot.displayProof(domains, 1, 0, null);
	assert(!slot.possibilityElems[2].className.includes("proof-change"),
	       "an old removal remained highlighted");
});

Deno.test("forced steps stop after presenting a failed removal", function() {
	const puzzle = makePuzzle(1);
	const failed = puzzle.rows[0].slots[4];
	failed.value = 0;
	const domains = [[
		1 << 4,
		1 << 5,
		1 | 2,
		1 | 4,
		2 | 4,
		2 | 8,
	]];
	const placements = [0];
	const steps = [];
	Logos.drainForcedProofSteps(domains, placements, step =>
		steps.push(step), () => Logos.proofConclusionPresented(
			puzzle, domains, placements, failed, 0));
	assert(steps.length == 1 && steps[0].symbol == 0 &&
	       placements[0] == 1 && domains[0][1] == 1 << 5,
	       "forced replay continued after placing the removed symbol");
});

Deno.test("arrow keys navigate proof steps", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("7998093c");
	puzzle.rows[2].slots[5].discard(2);
	puzzle.explainLoss();
	let prevented = 0;
	const keydown = document.listeners.keydown;
	keydown({
		key: "ArrowRight",
		target: { tagName: "INPUT", type: "button" },
		preventDefault() { prevented++; },
	});
	assert(puzzle.proof.position == 2 && prevented == 1,
	       "right arrow did not advance the proof");
	keydown({
		key: "ArrowLeft",
		preventDefault() { prevented++; },
	});
	assert(puzzle.proof.position == 1 && prevented == 2,
	       "left arrow did not rewind the proof");
	keydown({
		key: "ArrowRight",
		shiftKey: true,
		preventDefault() { prevented++; },
	});
	assert(puzzle.proof.position == 1 && prevented == 2,
	       "a modified arrow key moved the proof");
	puzzle.explainLoss();
	puzzle.stopTimer();
});

Deno.test("7998093c gives a coherent clue set for discarding III", function() {
	const puzzle = makePuzzle(6);
	puzzle.continueAfterLoss = false;
	puzzle.say = function() {};
	puzzle.newGame("7998093c");
	for (const row of puzzle.rows)
		for (const slot of row.slots)
			assert(!slot.single, "seed unexpectedly began with a found tile");
	const target = puzzle.rows[2].slots[5];
	target.discard(2);
	assert(!puzzle.proof && puzzle.pendingProof &&
	       !puzzle.explainButton.disabled && !puzzle.scoresButton.hidden &&
	       target.possibleElem.className == "solution",
	       "the proof opened before it was requested");
	puzzle.explainLoss();
	assert(puzzle.explainButton.classList.contains("active"),
	       "opening the proof did not press the Why control");
	assert(puzzle.proof, "the proof did not open");
	const firstClues = puzzle.proof.steps[0].clues;
	const highlighted = puzzle.clues.filter(clue => clue.display &&
		clue.display.classList.contains("proof-current"));
	assert(highlighted.length == firstClues.length &&
	       highlighted.every(clue => firstClues.includes(clue)),
	       "proof mode highlighted clues from other steps");
	assert(puzzle.proof.steps.some(step => step.clues.some(clue =>
	       !clue.display.classList.contains("contradiction"))),
	       "the proof did not introduce its own supporting clues");
	assert(puzzle.proof.steps.length >= 10,
	       "the proof skipped over its causal deductions");
	const triangleFifth = puzzle.proof.steps.find(step =>
		step.row == 4 && step.symbol == 0 && step.removed & (1 << 4));
	assert(triangleFifth && triangleFifth.message.includes("either orientation"),
	       "the proof did not explain its three-tile deduction");
	const romanTwoSixth = puzzle.proof.steps.find(step =>
		step.row == 2 && step.symbol == 1 && step.removed & (1 << 5));
	assert(romanTwoSixth && romanTwoSixth.message.includes("not adjacent"),
	       "the proof did not explain its strict-adjacency deduction");
	const romanFiveSixth = puzzle.proof.steps.find(step =>
		step.row == 2 && step.symbol == 4 && step.removed & (1 << 5));
	assert(romanFiveSixth &&
	       romanFiveSixth.message.includes("must be to its right"),
	       "the proof did not explain its ordering deduction");
	assert(!puzzle.proof.steps.some(step =>
	       !step.conclusion && step.row == 2 && step.symbol == 2),
	       "the proof continued after III was the only sixth-position tile");
	assert(Logos.proofMessageText(puzzle,
	       puzzle.proof.steps[puzzle.proof.steps.length - 1].message) ==
	       "2 must be in the sixth column because it is the only " +
	       "remaining option.",
	       "the proof did not state its conclusion");
	let previous = puzzle.proof.base;
	for (const step of puzzle.proof.steps) {
		const changed = [];
		for (let row = 0; row < step.domains.length; row++)
			for (let symbol = 0; symbol < step.domains[row].length;
			     symbol++)
				if (step.domains[row][symbol] != previous[row][symbol])
					changed.push([row, symbol]);
		if (step.conclusion) {
			assert(changed.length == 0 ||
			       changed.length == 1 && changed[0][0] == step.row &&
			       changed[0][1] == step.symbol,
			       "the conclusion silently changed another tile");
			previous = step.domains;
			continue;
		}
		assert(changed.length == 1 &&
		       changed[0][0] == step.row && changed[0][1] == step.symbol,
		       "a proof step silently changed another tile");
		const removed = previous[step.row][step.symbol] & ~step.domain;
		const edges = 1 | (1 << (step.domains[step.row].length - 1));
		assert(removed == edges || (removed & (removed - 1)) == 0 ||
		       step.domain && !(step.domain & (step.domain - 1)),
		       "a proof step skipped over individual eliminations");
		previous = step.domains;
	}
	while (puzzle.proof.position < puzzle.proof.steps.length - 1)
		puzzle.moveProof(1);
	const lettersBefore = puzzle.rows[1].slots.map(slot =>
		slot.possibilityElems.map(elem => elem.className));
	puzzle.moveProof(1);
	const lettersAfter = puzzle.rows[1].slots.map(slot =>
		slot.possibilityElems.map(elem => elem.className));
	assert(puzzle.proofControls.querySelector(".proof-position").textContent ==
	       "Conclusion" &&
	       puzzle.proofControls.querySelector(".proof-deduction").textContent
	       .endsWith(" Q.E.D."),
	       "the final proof step was not presented as a conclusion");
	assert(JSON.stringify(lettersBefore) == JSON.stringify(lettersAfter),
	       "the concluding deduction unexpectedly changed the letter row");
	assert(!target.single && !target.singleElem.hidden &&
	       target.possibleElem.hidden,
	       "the proof did not place its forced conclusion");
	assert(target.singleElem.classList.contains("failed-action"),
	       "the proof lost track of the failed action");
	puzzle.explainLoss();
	assert(!puzzle.proof && puzzle.pendingProof &&
	       !puzzle.explainButton.classList.contains("active") &&
	       target.possibleElem.className == "solution" &&
	       target.possibilityElems[2].classList.contains("failed-action"),
	       "closing the proof did not restore the revealed solution");
	puzzle.stopTimer();
});

Deno.test("860f9efd gives a direct proof against placing die one", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("860f9efd");
	const target = puzzle.rows[3].slots[2];
	target.choose(0);
	assert(!puzzle.proof && puzzle.pendingProof,
	       "the direct proof opened before it was requested");
	puzzle.explainLoss();
	assert(puzzle.proof.steps.length == 1,
	       "the direct contradiction retained unrelated deductions");
	assert(puzzle.proof.steps[0].conclusion &&
	       puzzle.proof.steps[0].message.includes("neither"),
	       "the direct contradiction was restated instead of explained");
	puzzle.stopTimer();
});

Deno.test("a directly contradicting clue becomes a one-step proof", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("ee806e0a");
	puzzle.rows[4].slots[5].choose(4);
	puzzle.explainLoss();
	assert(puzzle.proof.steps.length == 1,
	       "the direct column contradiction retained an indirect proof");
	const step = puzzle.proof.steps[0];
	assert(step.conclusion && step.deduction ==
		       "column.other-not-position" &&
	       Logos.proofMessageText(puzzle, step.message) ==
		       "⬠ cannot be in the sixth column because A is not.",
	       "the direct column clue did not explain the failed placement");
	puzzle.stopTimer();
});

Deno.test("proof reconstruction reaches a wrong placement", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("ae9a519e");
	puzzle.rows[5].slots[2].choose(4);
	puzzle.explainLoss();
	const last = puzzle.proof.steps[puzzle.proof.steps.length - 1];
	assert(last.conclusion && last.row == 5 && last.symbol == 4 &&
	       last.removed == 1 << 2,
	       "the proof ended before removing the failed placement");
	assert(Logos.proofMessageText(puzzle, last.message) ==
	       "4 cannot be in the third column because 0 must be adjacent.",
	       "the final adjacency deduction was left implicit");
	puzzle.stopTimer();
});

Deno.test("a column clue presents a forced placement as one proof step", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("8f5e3c76");
	const xSlot = puzzle.rows[5].slots[5];
	xSlot.choose(3);
	const target = puzzle.rows[5].slots[4];
	target.discard(0);
	puzzle.explainLoss();
	useOriginalProofRoute(puzzle);
	const diamondSteps = puzzle.proof.steps.filter(step =>
		step.row == 4 && step.symbol == 3);
	assert(diamondSteps.length == 1 && diamondSteps[0].domain == 1 << 5 &&
	       /^3 must be in the sixth column with .+\.$/.test(
		       Logos.proofMessageText(puzzle, diamondSteps[0].message)),
	       "the column clue split a forced placement into eliminations");
	for (let symbol = 0; symbol < 6; symbol++)
		assert(symbol == 3 || !(diamondSteps[0].domains[4][symbol] & 1 << 5),
		       "the proof placement left another tile in its column");
	const diamondIndex = puzzle.proof.steps.indexOf(diamondSteps[0]);
	const diamondSlot = puzzle.rows[4].slots[5];
	puzzle.proof.position = diamondIndex + 1;
	puzzle.showProofPosition();
	assert(!diamondSlot.singleElem.hidden && diamondSlot.possibleElem.hidden,
	       "the proof rendered a forced placement as a small tile");
	assert(diamondSlot.singleElem.classList.contains("proof-change"),
	       "the current proof placement was not highlighted");
	puzzle.proof.position = diamondIndex;
	puzzle.showProofPosition();
	assert(diamondSlot.singleElem.hidden && !diamondSlot.possibleElem.hidden,
	       "moving backward did not undo the proof placement");
	assert(!diamondSlot.singleElem.classList.contains("proof-change"),
	       "moving backward did not clear the placement highlight");
	const minusFourth = puzzle.proof.steps.find(step =>
		step.row == 5 && step.symbol == 1 && step.removed & 1 << 3);
	assert(minusFourth && Logos.proofMessageText(puzzle,
	       minusFourth.message).includes("2 must be adjacent"),
	       "the proof blamed both sides when Roman III alone could not fit");
	const columnDiscard = puzzle.proof.steps.find(step =>
		step.clue && step.clue.constructor == ColumnClue &&
		step.removed && !(step.removed & (step.removed - 1)) &&
		step.domain & (step.domain - 1));
	assert(columnDiscard && / because .+ is not\.$/.test(
	       Logos.proofMessageText(puzzle, columnDiscard.message)),
	       "a vertical-clue elimination did not name the other tile");
	puzzle.stopTimer();
});

Deno.test("a row's only candidate is one proof placement", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("b7a26fba");
	const target = puzzle.rows[4].slots[2];
	target.choose(3);
	puzzle.explainLoss();
	const placement = puzzle.proof.steps.find(step =>
		step.rule == "only-candidate" && step.row == 2 && step.symbol == 4);
	assert(placement && placement.domain == 1 &&
	       placement.removed & (placement.removed - 1) &&
	       Logos.proofMessageText(puzzle, placement.message) ==
	       "4 must be in the first column because it is the only " +
	       "remaining option.",
	       "the only-candidate rule split a placement into eliminations");
	const placementIndex = puzzle.proof.steps.indexOf(placement);
	const romanTwo = puzzle.proof.steps.find(step =>
		step.rule == "only-candidate" && step.row == 2 && step.symbol == 1 &&
		step.domain == 1 << 5);
	assert(romanTwo && puzzle.proof.steps.indexOf(romanTwo) == placementIndex + 1,
	       "a placement newly forced by another placement was separated from it");
	for (let i = 0; i < puzzle.proof.steps.length; i++) {
		const step = puzzle.proof.steps[i];
		const forced = Logos.nextForcedProofStep(
			step.domains, step.placements);
		if (!forced)
			continue;
		const next = puzzle.proof.steps[i + 1];
		assert(next && next.rule == forced.rule &&
		       next.row == forced.row && next.symbol == forced.symbol,
		       "the replay postponed an available forced placement");
	}
	const dieThree = puzzle.proof.steps.find(step =>
		step.clue && step.clue.constructor == ColumnClue &&
		step.row == 3 && step.symbol == 2);
	assert(dieThree && dieThree.placement && dieThree.domain == 1 << 3 &&
	       /^2 must be in the fourth column with .+\.$/.test(
		       Logos.proofMessageText(puzzle, dieThree.message)),
	       "a reordered vertical clue replayed its stale partial deduction");
	puzzle.proof.position = placementIndex + 1;
	puzzle.showProofPosition();
	const romanFiveSlot = puzzle.rows[2].slots[0];
	assert(!romanFiveSlot.singleElem.hidden && romanFiveSlot.possibleElem.hidden,
	       "the only-candidate rule did not render a large tile");
	puzzle.stopTimer();
});

Deno.test("a multi-position clue deduction explains its common cause", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("c0f65304");
	puzzle.rows[4].slots[1].choose(5);
	puzzle.explainLoss();
	const romanOne = puzzle.proof.steps.find(step =>
		step.row == 2 && step.symbol == 0 && step.removed == 17);
	assert(romanOne && Logos.proofMessageText(puzzle, romanOne.message) ==
	       "0 cannot be in the first and fifth columns because 3 must be " +
	       "two positions away.",
	       "a shared reason for multiple eliminations was not explained");
	puzzle.stopTimer();
});

Deno.test("a three-adjacent middle placement explains both outer symbols", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("2030c01c");
	puzzle.startProof(puzzle.rows[5].slots[3], 1);
	useOriginalProofRoute(puzzle);
	const triangle = puzzle.proof.steps.find(step =>
		step.row == 4 && step.symbol == 0 && step.domain == 1 << 4);
	assert(triangle && triangle.deduction == "adjacent3.middle.placement" &&
	       Logos.proofMessageText(puzzle, triangle.message) ==
	       "△ must be in the fifth column because that is the only place " +
	       "where E and √ can fit on opposite sides of it.",
	       "the middle placement did not explain why only one orientation fits");
	assert(!puzzle.proof.steps.some(step =>
	       step.row == 3 && step.symbol == 2 ||
	       step.row == 2 && step.symbol == 2),
	       "the proof retained unused die-3 or III deduction branches");
	puzzle.stopTimer();
});

Deno.test("proofs use a direct conclusion exposed by an earlier deduction", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("bf84914b");
	try {
		puzzle.rows[5].slots[5].choose(5);
		puzzle.explainLoss();
		const steps = puzzle.proof.steps;
		assert(steps.length == 2,
		       "the proof retained a branch after die-4 ruled out square root");
		assert(steps[0].row == 3 && steps[0].symbol == 3 &&
		       steps[0].removed == 1 << 4,
		       "the proof did not first rule out die-4 in column five");
		assert(steps[1].row == 5 && steps[1].symbol == 5 &&
		       steps[1].removed == 1 << 5 && steps[1].conclusion &&
		       Logos.proofMessageText(puzzle, steps[1].message) ==
		       "√ cannot be in the sixth column because ⚃ must be adjacent.",
		       "the proof did not conclude directly from the adjacent-three clue");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("a concluding removal stays replayable while its middle is unresolved", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("65eccfc1");
	try {
		puzzle.startProof(puzzle.rows[4].slots[4], 3);
		useOriginalProofRoute(puzzle);
		const proof = puzzle.proof;
		assert(proof.steps.length <= 23 && proof.steps.at(-1).conclusion,
		       "the concluding removal prevented pruning the long route");
		let domains = proof.base, placements = proof.basePlacements;
		for (const step of proof.steps) {
			const refreshed = Logos.refreshProofStep(puzzle, step, domains);
			assert(refreshed && Logos.proofStepSupported(puzzle,
			       refreshed, domains, placements),
			       "refreshing the proof introduced an unsupported placement");
			domains = step.domains;
			placements = step.placements;
		}
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("alternate proof routes recover a shorter explanation deterministically", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("65eccfc1");
	const clues = puzzle.clues.slice();
	try {
		const target = puzzle.rows[4].slots[4];
		puzzle.startProof(target, 3);
		const proof = puzzle.proof;
		const base = JSON.stringify([proof.base, proof.basePlacements]);
		const original = Logos.buildProofRoute(puzzle, proof.base,
			proof.basePlacements, target, 3, clues);
		assert(original.length == 23 && proof.steps.length == 8 &&
		       proof.steps.at(-1).conclusion,
		       "alternate routes did not recover the short proof");
		const repeated = Logos.buildProofSteps(puzzle, proof.base,
			proof.basePlacements, target, 3);
		assert(JSON.stringify(repeated.map(step => step.message)) ==
		       JSON.stringify(proof.steps.map(step => step.message)),
		       "repeating the proof changed its explanation");
		assert(puzzle.clues.every((clue, i) => clue === clues[i]) &&
		       JSON.stringify([proof.base, proof.basePlacements]) == base,
		       "trying alternate routes changed the clue order or starting board");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("outer edge proofs keep specific explanations", function() {
	for (const [seed, row, col, symbol] of [
		["13566515", 0, 5, 1],
		["91c86c3e", 3, 0, 1],
	]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.say = function() {};
		puzzle.newGame(seed);
		try {
			puzzle.startProof(puzzle.rows[row].slots[col], symbol);
			assert(puzzle.proof && puzzle.proof.steps.at(-1).conclusion,
			       "the edge removals prevented completing the proof");
			assert(puzzle.proof.steps.every(step =>
			       step.deduction != "clue.remove-position"),
			       "edge removals lost their separate explanations");
		} finally {
			puzzle.stopTimer();
		}
	}
});

Deno.test("a near-edge outer symbol orients a three-adjacent sequence", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("1af9b122");
	puzzle.rows[5].slots[5].choose(5);
	puzzle.explainLoss();
	const step = puzzle.proof.steps[puzzle.proof.steps.length - 1];
	assert(step.deduction == "adjacent3.placement.inward-from-edge" &&
	       Logos.proofMessageText(puzzle, step.message) ==
	       "√ must be in the fourth column because the sequence containing " +
	       "3 can only extend toward the center." && step.conclusion,
	       "the inward sequence was not explained as a placement");
	puzzle.stopTimer();
});

Deno.test("a near-edge sequence explains either remaining placement", function() {
	for (const [row, symbol, col, message] of [
		[5, 2, 4, "÷ must be in the fifth column because the sequence " +
			"containing A can only extend toward the center."],
		[4, 5, 3, "○ must be in the fourth column because the sequence " +
			"containing A can only extend toward the center."],
	]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.say = function() {};
		puzzle.newGame("fd628e5e");
		puzzle.rows[1].slots[5].choose(0);
		puzzle.rows[row].slots[col].discard(symbol);
		puzzle.explainLoss();
		const step = puzzle.proof.steps[0];
		assert(puzzle.proof.steps.length == 1 && step.deduction ==
		       "adjacent3.placement.inward-from-edge" &&
		       Logos.proofMessageText(puzzle, step.message) == message,
		       "the near-edge sequence placement was not explained");
		puzzle.stopTimer();
	}
});

Deno.test("a three-adjacent outer placement explains shared orientations", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("fd628e5e");
	puzzle.rows[2].slots[1].choose(0);
	puzzle.explainLoss();
	const step = puzzle.proof.steps.find(step =>
		step.deduction == "adjacent3.outer.only-position" &&
		step.row == 0 && step.symbol == 4);
	assert(step && step.deduction == "adjacent3.outer.only-position" &&
	       Logos.proofMessageText(puzzle, step.message) ==
	       "5 must be in the third column because that is the only " +
	       "place where F can be between it and V.",
	       "the shared outer position did not explain both orientations");
	puzzle.stopTimer();
});

Deno.test("a final clue elimination remains separate from its placement", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("fd628e5e");
	puzzle.rows[5].slots[1].choose(4);
	puzzle.explainLoss();
	useOriginalProofRoute(puzzle);
	const removal = puzzle.proof.steps.findIndex(step =>
		step.deduction == "order.other-not-beyond" &&
		step.row == 0 && step.symbol == 2 && step.removed == 1);
	const placement = puzzle.proof.steps[removal + 1];
	assert(removal >= 0 && placement.deduction == "row.only-position" &&
	       Logos.proofMessageText(puzzle,
		puzzle.proof.steps[removal].message) ==
	       "3 cannot be in the first column because ⬠ must be to its left." &&
	       Logos.proofMessageText(puzzle, placement.message) ==
	       "3 must be in the fifth column because it has been eliminated " +
	       "everywhere else.",
	       "the final clue elimination was folded into a placement");
	puzzle.stopTimer();
});

Deno.test("a three-adjacent placement preserves distinct elimination reasons", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("e2b29313");
	puzzle.rows[3].slots[4].choose(3);
	puzzle.explainLoss();
	const plusSteps = puzzle.proof.steps.filter(step =>
		step.row == 5 && step.symbol == 0);
	const finalSteps = plusSteps.slice(-3);
	assert(finalSteps.length == 3 &&
	       finalSteps[0].deduction ==
		       "adjacent3.outer.other-not-two-away" &&
	       finalSteps[0].removed == 17 &&
	       Logos.proofMessageText(puzzle, finalSteps[0].message) ==
		       "+ cannot be in the first and fifth columns because C " +
		       "must be two positions away." &&
	       finalSteps[1].deduction ==
		       "adjacent3.outer.middle-not-adjacent" &&
	       finalSteps[1].removed == 32 &&
	       Logos.proofMessageText(puzzle, finalSteps[1].message) ==
		       "+ cannot be in the sixth column because ‒ must be " +
		       "adjacent." &&
	       finalSteps[2].deduction == "row.only-position" &&
	       Logos.proofMessageText(puzzle, finalSteps[2].message) ==
		       "+ must be in the third column because it has been " +
		       "eliminated everywhere else.",
	       "distinct reasons were folded into an adjacent-three placement");
	puzzle.stopTimer();
});

Deno.test("a concluding placement elsewhere needs no contradiction suffix",
function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("5c481f0d");
	puzzle.rows[2].slots[2].choose(3);
	puzzle.rows[2].slots[3].choose(0);
	puzzle.rows[2].slots[4].choose(2);
	puzzle.explainLoss();
	const step = puzzle.proof.steps[puzzle.proof.steps.length - 1];
	assert(step.conclusion && step.deduction ==
		       "adjacent3.middle.placement" &&
	       step.row == 2 && step.symbol == 2 && step.domain == 1 << 1 &&
	       Logos.proofMessageText(puzzle, step.message) ==
		       "III must be in the second column because that is the only " +
		       "place where ○ and 3 can fit on opposite sides of it." &&
	       !step.contradicts,
	       "the final placement recorded a redundant contradiction");
	puzzle.proof.position = puzzle.proof.steps.length;
	puzzle.showProofPosition();
	assert(puzzle.proofControls.querySelector(".proof-deduction").textContent ==
	       "III must be in the second column because that is the only place " +
	       "where ○ and 3 can fit on opposite sides of it. Q.E.D.",
	       "the rendered conclusion retained a redundant suffix");
	puzzle.stopTimer();
});

Deno.test("a conflicting placement contrasts the attempted tile", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(0);
	puzzle.rows[0].slots[1].choose(1);
	puzzle.explainLoss();
	useOriginalProofRoute(puzzle);
	const step = puzzle.proof.steps[puzzle.proof.steps.length - 1];
	assert(step.conclusion && step.deduction == "adjacent2.placement" &&
	       step.row == 0 && step.symbol == 0 && step.domain == 1 << 1 &&
	       Logos.proofMessageText(puzzle, step.contradicts) == "2",
	       "the final placement did not record the attempted tile");
	puzzle.proof.position = puzzle.proof.steps.length;
	puzzle.showProofPosition();
	assert(puzzle.proofControls.querySelector(".proof-deduction").textContent ==
	       "1, not 2, must be in the second column because that is the only remaining position adjacent to " +
	       Logos.proofMessageText(puzzle, step.deductionValues.other) + ". Q.E.D.",
	       "the rendered placement did not contrast the attempted tile");
	puzzle.stopTimer();
});

Deno.test("proof ordering preserves the failed conclusion", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("1e3c73cd");
	puzzle.rows[5].slots[3].choose(1);
	assert(puzzle.explainButton.classList.contains("proof-available"),
	       "an indirect loss did not highlight the Because button");
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.steps.length &&
	       puzzle.proof.steps[puzzle.proof.steps.length - 1].conclusion,
	       "reordering supported steps discarded the proof conclusion");
	assert(!puzzle.explainButton.classList.contains("proof-available"),
	       "the open proof retained the available-proof highlight");
	puzzle.explainLoss();
	assert(!puzzle.explainButton.classList.contains("proof-available") &&
	       !puzzle.explainButton.disabled && puzzle.pendingProof,
	       "closing the proof retained its notification highlight");
	puzzle.stopTimer();
});

Deno.test("proof replay skips deductions superseded by forced steps", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("a0ab30a7");
	puzzle.rows[4].slots[5].choose(2);
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.steps.length &&
	       puzzle.proof.steps[puzzle.proof.steps.length - 1].conclusion,
	       "a superseded clue deduction prevented the proof from opening");
	puzzle.stopTimer();
});

Deno.test("restarting a proof clears its tile highlight", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("9ed0fb2b");
	const slot = puzzle.rows[1].slots[4];
	slot.discard(4);
	puzzle.explainLoss();
	assert(slot.singleElem.classList.contains("proof-change"),
	       "the proof placement was not highlighted");

	puzzle.newGame("9ed0fb2b");
	assert(!slot.singleElem.classList.contains("proof-change"),
	       "restarting the game retained a proof highlight");
	slot.choose(4);
	assert(!slot.singleElem.classList.contains("proof-change"),
	       "the stale proof highlight returned on placement");
	puzzle.stopTimer();
});

Deno.test("practice mistakes can be explained and play can continue", function() {
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.setPracticeMode(true);
	puzzle.newGame("9ed0fb2b");
	const slot = puzzle.rows[1].slots[4];
	slot.discard(4);
	assert(!puzzle.gameOver && puzzle.pendingProof &&
	       !puzzle.pendingProof.failedSlot.single &&
	       slot.possibilityElems[4].classList.contains("failed-action") &&
	       JSON.stringify(puzzle.gameStats) ==
	       JSON.stringify({ won: 0, lost: 0 }),
	       "a practice mistake ended or recorded the game");
	assert(puzzle.sounds.length == 1 &&
	       puzzle.sounds[0] == "practice-mistake",
	       "a practice mistake used the normal loss sound");

	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.continueGame,
	       "the practice mistake did not open a continuable proof");
	const possible = slot.possible.slice();
	puzzle.explainLoss();
	assert(!puzzle.proof && !puzzle.gameOver && !slot.single &&
	       JSON.stringify(slot.possible) == JSON.stringify(possible) &&
	       slot.possibilityElems[4].classList.contains("failed-action"),
	       "closing the proof did not restore the live board");

	slot.discard(0);
	assert(!puzzle.pendingProof && !puzzle.practiceMistake &&
	       !slot.possibilityElems[4].classList.contains("failed-action") &&
	       !puzzle.gameOver,
	       "the player could not continue after a practice proof");
	puzzle.stopTimer();
	localStorage.removeItem("practiceMode");
});
