class FakeClassList {
	add() {}
	remove() {}
	contains() { return false; }
}

class FakeElement {
	constructor() {
		this.classList = new FakeClassList();
		this.children = [];
		this.innerHTML = "";
	}

	appendChild(child) {
		this.children.push(child);
	}

	addEventListener() {}
	querySelector() { return new FakeElement(); }

	insertRow() {
		return new FakeElement();
	}

	insertCell() {
		return new FakeElement();
	}
}

globalThis.document = {
	addEventListener() {},
	createElement() { return new FakeElement(); },
	body: new FakeElement(),
};
globalThis.document.body.dataset = {};
globalThis.Audio = class {};

const source = await Deno.readTextFile(
	new URL("./logos.js", import.meta.url));
const Logos = eval(source +
	"\n;({ Puzzle: Puzzle, ExactClue: ExactClue });");
const Puzzle = Logos.Puzzle;
const ExactClue = Logos.ExactClue;
const symbols = ["0", "1", "2", "3", "4", "5"];

function assert(condition, message) {
	if (!condition)
		throw new Error(message || "assertion failed");
}

function makePuzzle(numRows) {
	const elem = function() { return new FakeElement(); };
	const puzzle = new Puzzle(elem(), elem(), elem(), elem(), elem(),
		Array(numRows).fill(symbols), elem(), elem(), elem(), elem());
	const lose = puzzle.lose;
	puzzle.lose = function(msg) {
		this.losses++;
		lose.call(this, msg);
	};
	puzzle.playSound = function(sound) {
		this.sounds.push(sound);
	};
	puzzle.checkWin = function() {};
	resetPuzzle(puzzle);
	return puzzle;
}

function resetPuzzle(puzzle) {
	puzzle.losses = 0;
	puzzle.sounds = [];
	puzzle.gameOver = false;
	for (const row of puzzle.rows)
		row.newGame();
}

function withRandom(seed, callback) {
	const oldRandom = Math.random;
	let state = seed >>> 0;
	Math.random = function() {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0x100000000;
	};
	try {
		callback();
	} finally {
		Math.random = oldRandom;
	}
}

Deno.test("a false placement loses the game", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;

	slot.choose(wrong);
	assert(puzzle.losses == 1, "false placement did not cause a loss");
});

Deno.test("a false elimination loses the game", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];

	slot.discard(slot.value);
	assert(puzzle.losses == 1, "false elimination did not cause a loss");
});

Deno.test("a slot with one candidate is resolved", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];

	for (let value = 0; value < symbols.length; value++)
		if (value != slot.value)
			slot.discard(value);
	assert(slot.single, "slot singleton was not resolved");
	assert(puzzle.losses == 0, "correct eliminations caused a loss");
});

Deno.test("a symbol with one possible slot is resolved", function() {
	const puzzle = makePuzzle(1);
	const row = puzzle.rows[0];
	const value = 0;
	const actual = row.slots.find(function(slot) {
		return slot.value == value;
	});

	for (const slot of row.slots)
		if (slot != actual)
			slot.discard(value);
	assert(actual.single, "row singleton was not resolved");
	assert(puzzle.losses == 0, "correct eliminations caused a loss");
});

Deno.test("applying an exact clue fixes its tile", function() {
	const puzzle = makePuzzle(1);
	const clue = new ExactClue(puzzle);

	clue.applyInitialState();
	assert(clue.slot.single, "exact clue did not fix its tile");
});

Deno.test("a player placement makes one sound", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];

	slot.choose(slot.value, true);
	assert(puzzle.sounds.length == 1,
	       "automatic deductions made extra sounds");
	assert(puzzle.sounds[0] == "place", "placement made the wrong sound");
});

Deno.test("a player elimination makes one sound", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;

	slot.discard(wrong, true);
	assert(puzzle.sounds.length == 1,
	       "automatic deductions made extra sounds");
	assert(puzzle.sounds[0] == "discard",
	       "elimination made the wrong sound");
});

Deno.test("forced placements make one place sound per action", function() {
	const puzzle = makePuzzle(1);
	const row = puzzle.rows[0];

	/*
	 * Leave each slot with its value and the next slot's value. Removing
	 * that alternative from the first slot will resolve the whole row.
	 */
	for (let i = 0; i < row.slots.length; i++) {
		const slot = row.slots[i];
		const alternative = row.slots[(i + 1) % row.slots.length].value;
		for (let value = 0; value < symbols.length; value++)
			if (value != slot.value && value != alternative)
				slot.removePossible(value, true);
	}

	const first = row.slots[0];
	const alternative = row.slots[1].value;
	first.discard(alternative, true);

	assert(row.isComplete(), "elimination did not trigger placement chain");
	assert(puzzle.sounds.filter(function(sound) {
		return sound == "place";
	}).length == 1, "placement chain made multiple place sounds");
});

Deno.test("row singleton placement makes a place sound", function() {
	const puzzle = makePuzzle(1);
	const row = puzzle.rows[0];
	const value = 0;
	const actual = row.slots.find(function(slot) {
		return slot.value == value;
	});
	const candidates = row.slots.filter(function(slot) {
		return slot != actual;
	});

	for (let i = 0; i < candidates.length - 1; i++)
		candidates[i].removePossible(value, true);
	candidates[candidates.length - 1].discard(value, true);

	assert(actual.single, "row singleton was not placed");
	assert(puzzle.sounds.filter(function(sound) {
		return sound == "place";
	}).length == 1, "row singleton did not make one place sound");
});

Deno.test("losing player actions make a mistake sound", function() {
	for (const action of ["choose", "discard"]) {
		const puzzle = makePuzzle(1);
		const slot = puzzle.rows[0].slots[0];
		const value = action == "choose" ?
			(slot.value + 1) % symbols.length : slot.value;

		slot[action](value, true);
		assert(puzzle.sounds.length == 1,
		       "losing " + action + " made extra sounds");
		assert(puzzle.sounds[0] == "mistake",
		       "losing " + action + " made the wrong sound");
	}
});

Deno.test("row propagation updates every slot before deducing", function() {
	const puzzle = makePuzzle(1);
	const row = puzzle.rows[0];
	let removed = 0;

	for (const slot of row.slots) {
		const removePossible = slot.removePossible;
		slot.removePossible = function(value, deferCheck) {
			assert(deferCheck, "row removal allowed an immediate deduction");
			removed++;
			removePossible.call(this, value, deferCheck);
		};
		const checkSingleton = slot.checkSingleton;
		slot.checkSingleton = function() {
			assert(removed == row.slots.length,
			       "deduction ran against a partially updated row");
			checkSingleton.call(this);
		};
	}

	row.removePossible(0);
	assert(removed == row.slots.length, "not every slot was updated");
});

Deno.test("correct mixed play never causes an automatic loss", function() {
	const puzzle = makePuzzle(6);
	for (let seed = 1; seed <= 1000; seed++) {
		withRandom(seed, function() {
			resetPuzzle(puzzle);
			while (!puzzle.gameOver) {
				const open = [];
				for (const row of puzzle.rows)
					for (const slot of row.slots)
						if (!slot.single)
							open.push(slot);
				if (!open.length)
					break;

				const slot = open[Math.floor(Math.random() * open.length)];
				const falseValues = [];
				for (let value = 0; value < slot.possible.length; value++)
					if (value != slot.value && slot.possible[value])
						falseValues.push(value);

				if (!falseValues.length || Math.random() < 0.2) {
					slot.choose(slot.value);
				} else {
					const value = falseValues[
						Math.floor(Math.random() * falseValues.length)];
					slot.discard(value);
				}
			}
			assert(puzzle.losses == 0,
			       "correct play caused a loss with seed " + seed);
		});
	}
});
