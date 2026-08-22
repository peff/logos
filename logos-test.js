class FakeClassList {
	constructor() {
		this.classes = new Set();
	}

	add(...classes) {
		for (const name of classes)
			this.classes.add(name);
	}

	remove(...classes) {
		for (const name of classes)
			this.classes.delete(name);
	}

	contains(name) {
		return this.classes.has(name);
	}
}

class FakeElement {
	constructor() {
		this.classList = new FakeClassList();
		this.children = [];
		this.innerHTML = "";
		this.listeners = {};
		this.queries = {};
	}

	appendChild(child) {
		this.children.push(child);
	}
	replaceChildren() {
		this.children = [];
	}

	addEventListener(type, listener) {
		this.listeners[type] = listener;
	}
	focus() {
		this.focused = true;
	}
	setAttribute() {}
	querySelector(selector) {
		if (!this.queries[selector])
			this.queries[selector] = new FakeElement();
		return this.queries[selector];
	}

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
	querySelector(selector) { return this.body.querySelector(selector); },
	body: new FakeElement(),
};
globalThis.document.body.dataset = {};
globalThis.Audio = class {};
Object.defineProperty(globalThis, "localStorage", { value: {
	values: {},
	getItem(key) {
		return Object.hasOwn(this.values, key) ? this.values[key] : null;
	},
	setItem(key, value) {
		this.values[key] = String(value);
	},
	removeItem(key) {
		delete this.values[key];
	},
} });

const source = await Deno.readTextFile(
	new URL("./logos.js", import.meta.url));
const Logos = eval(source +
	"\n;({ Puzzle: Puzzle, ExactClue: ExactClue, " +
	"Adjacent2Clue: Adjacent2Clue, " +
	"ColumnClue: ColumnClue, " +
	"formatOlympiad: formatOlympiad, greekNumeralDay: greekNumeralDay });");
const Puzzle = Logos.Puzzle;
const ExactClue = Logos.ExactClue;
const Adjacent2Clue = Logos.Adjacent2Clue;
const ColumnClue = Logos.ColumnClue;
const symbols = ["0", "1", "2", "3", "4", "5"];

function assert(condition, message) {
	if (!condition)
		throw new Error(message || "assertion failed");
}

function makePuzzle(numRows, checkWin) {
	const elem = function() { return new FakeElement(); };
	const puzzle = new Puzzle(elem(), elem(), elem(), elem(), elem(),
		Array(numRows).fill(symbols), elem(), elem(), elem(), elem(),
		elem(), elem(), elem(), elem());
	const lose = puzzle.lose;
	puzzle.lose = function(msg, clues) {
		this.losses++;
		lose.call(this, msg, clues);
	};
	puzzle.playSound = function(sound) {
		this.sounds.push(sound);
	};
	if (!checkWin)
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

Deno.test("ctrl clicks toggle pencil marks without making moves", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const value = slot.value;
	const cell = slot.possibilityElems[value];

	cell.listeners.click({ ctrlKey: true });
	assert(puzzle.pencilMarks.length == 1,
	       "ctrl-click did not add a pencil selection");
	assert(!slot.single && puzzle.losses == 0,
	       "pencil selection made a committed move");
	cell.listeners.click({ ctrlKey: true });
	assert(puzzle.pencilMarks.length == 0,
	       "second ctrl-click did not remove the pencil selection");

	cell.listeners.contextmenu({
		ctrlKey: true,
		preventDefault() {},
	});
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "ctrl-right-click did not add a pencil elimination");
	assert(puzzle.losses == 0,
	       "pencil elimination checked the hidden solution");
});

Deno.test("coarse pointers use an expanded slot tray", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	puzzle.expandTileChoices = true;

	slot.possibilityElems[0].listeners.click({ ctrlKey: false });
	assert(!slot.single && puzzle.expandedSlot == slot,
	       "first tap made a move instead of expanding the slot");
	assert(!puzzle.slotTray.hidden &&
	       puzzle.slotTrayOptions.children.length == symbols.length,
	       "expanded tray did not show all possibilities");

	puzzle.tileAction = "remove";
	let tile = puzzle.slotTrayOptions.children[wrong];
	tile.listeners.click({});
	assert(!slot.possible[wrong], "tray removal did not commit");
	assert(puzzle.expandedSlot == slot &&
	       puzzle.slotTrayOptions.children[wrong].className.includes(
	       "eliminated"), "tray did not stay open and refresh");

	puzzle.tileAction = "pencil-select";
	tile = puzzle.slotTrayOptions.children[slot.value];
	tile.listeners.click({});
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.expandedSlot == slot,
	       "tray pencil action did not remain open");

	puzzle.tileAction = "place";
	tile = puzzle.slotTrayOptions.children[slot.value];
	tile.listeners.click({});
	assert(slot.single && puzzle.expandedSlot === null &&
	       puzzle.slotTray.hidden,
	       "tray placement did not resolve and close the slot");
});

Deno.test("touch options use independent defaults and saved settings",
		function() {
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("showActionSelector");
	localStorage.removeItem("selectionActionMenu");
	let mediaQuery;
	globalThis.matchMedia = function(query) {
		mediaQuery = query;
		return { matches: true };
	};
	globalThis.innerWidth = 800;
	globalThis.innerHeight = 400;
	let puzzle = makePuzzle(1);
	assert(mediaQuery == "(pointer: coarse)" &&
	       puzzle.expandTileChoices && puzzle.showActionSelector,
	       "touch options did not use coarse/small defaults");

	localStorage.setItem("expandTileChoices", "false");
	localStorage.setItem("showActionSelector", "false");
	puzzle = makePuzzle(1);
	assert(!puzzle.expandTileChoices && !puzzle.showActionSelector,
	       "saved touch preferences did not override defaults");
	delete globalThis.matchMedia;
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("showActionSelector");
	localStorage.removeItem("selectionActionMenu");
});

Deno.test("the persistent selector applies actions directly", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	puzzle.expandTileChoices = false;
	puzzle.showActionSelector = true;

	puzzle.tileAction = "pencil-select";
	slot.possibilityElems[slot.value].listeners.click({ ctrlKey: false });
	assert(puzzle.pencilMarks.length == 1 && !slot.single,
	       "direct pencil action committed a move");

	puzzle.tileAction = "remove";
	slot.possibilityElems[wrong].listeners.click({ ctrlKey: false });
	assert(!slot.possible[wrong] && puzzle.expandedSlot === null,
	       "direct removal opened the expanded tray");
});

Deno.test("the persistent selector replaces the logo only during play",
		function() {
	const puzzle = makePuzzle(1);
	puzzle.showActionSelector = true;
	puzzle.gameOver = true;
	puzzle.updateActionControls();
	assert(puzzle.boardActions.hidden && !puzzle.logoButton.hidden,
	       "selector replaced the logo outside an active game");

	puzzle.gameOver = false;
	puzzle.updateActionControls();
	assert(!puzzle.boardActions.hidden && puzzle.logoButton.hidden,
	       "selector did not replace the logo during play");
});

Deno.test("narrow portrait screens ask for landscape mode", function() {
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("showActionSelector");
	globalThis.innerWidth = 400;
	globalThis.innerHeight = 800;
	const puzzle = makePuzzle(1);
	assert(!puzzle.mobileOrientation.hidden,
	       "portrait prompt was not shown in a narrow viewport");

	globalThis.innerWidth = 800;
	globalThis.innerHeight = 1000;
	puzzle.updateMobileOrientation();
	assert(puzzle.mobileOrientation.hidden,
	       "portrait prompt was shown in a wide viewport");

	globalThis.innerWidth = 800;
	globalThis.innerHeight = 400;
	puzzle.updateMobileOrientation();
	assert(puzzle.mobileOrientation.hidden,
	       "portrait prompt remained visible in landscape");
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("showActionSelector");
});

Deno.test("pencil marks coexist and show row consequences", function() {
	const puzzle = makePuzzle(2);
	const selected = puzzle.rows[0].slots[0];
	const removed = puzzle.rows[1].slots[0];
	const selectedValue = selected.value;
	const removedValue = removed.value;

	selected.pencil(selectedValue, false);
	removed.pencil(removedValue, true);
	assert(puzzle.pencilMarks.length == 2,
	       "pencil mark in another row replaced the first mark");
	assert(selected.possibilityElems[selectedValue].className.includes(
	       "pencil-selected pencil-explicit"),
	       "explicit pencil selection was not rendered");
	assert(puzzle.rows[0].slots[1].possibilityElems[selectedValue]
	       .className.includes("pencil-removed pencil-derived"),
	       "pencil selection did not cascade across its row");
	assert(removed.possibilityElems[removedValue].className.includes(
	       "pencil-removed pencil-explicit"),
	       "explicit pencil elimination was not rendered");
});

Deno.test("clues do not propagate pencil marks", function() {
	const puzzle = makePuzzle(2);
	const top = puzzle.rows[0].slots[0];
	const bottom = puzzle.rows[1].slots[0];
	const clue = new ColumnClue(puzzle);
	clue.tRow = top.row;
	clue.bRow = bottom.row;
	clue.col = 0;
	puzzle.clues = [clue];

	top.pencil(top.value, false);
	assert(bottom.possibilityElems[bottom.value].className == "possibility",
	       "clue propagated a pencil selection to another row");
});

Deno.test("left clicks toggle clue dismissal", function() {
	const puzzle = makePuzzle(2);
	const clue = new ColumnClue(puzzle);
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	let prevented = false;

	clue.display.onclick({
		preventDefault() { prevented = true; },
	});
	assert(prevented && !clue.active &&
	       clue.display.classList.contains("clue-hidden"),
	       "left click did not dismiss the clue");
	clue.display.onclick({ preventDefault() {} });
	assert(clue.active &&
	       !clue.display.classList.contains("clue-hidden"),
	       "second left click did not restore the clue");
});

Deno.test("an opposite pencil mark replaces the mark on a tile", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];

	slot.pencil(slot.value, false);
	slot.pencil(slot.value, true);
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "pencil elimination did not replace pencil selection");
	assert(!slot.row.elem.classList.contains("pencil-conflict"),
	       "replacing a pencil mark created a conflict");
});

Deno.test("contradicting pencil marks show a conflict", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const other = (slot.value + 1) % symbols.length;

	slot.pencil(slot.value, false);
	slot.pencil(other, false);
	assert(puzzle.losses == 0, "contradicting pencil marks caused a loss");
	assert(slot.row.elem.classList.contains("pencil-conflict"),
	       "contradicting pencil marks did not mark their row");

	slot.pencil(other, false);
	assert(!slot.row.elem.classList.contains("pencil-conflict"),
	       "removing the contradiction did not clear its display");
});

Deno.test("committed moves remove only affected pencil marks", function() {
	const puzzle = makePuzzle(2);
	const committed = puzzle.rows[0].slots[0];
	const unrelated = puzzle.rows[1].slots[0];
	const wrong = (committed.value + 1) % symbols.length;

	committed.pencil(wrong, false);
	unrelated.pencil(unrelated.value, false);
	committed.choose(committed.value);
	assert(puzzle.pencilMarks.length == 1,
	       "committed move removed unrelated pencil marks");
	assert(puzzle.pencilMarks[0].slot == unrelated,
	       "committed move retained a conflicting pencil mark");
	assert(unrelated.possibilityElems[unrelated.value].className.includes(
	       "pencil-selected pencil-explicit"),
	       "remaining pencil state was not recomputed");
});

Deno.test("help pages switch between rules and clues", function() {
	const puzzle = makePuzzle(1);
	const rules = puzzle.help.querySelector(".help-page-rules");
	const clues = puzzle.help.querySelector(".help-page-clues");
	const previous = puzzle.help.querySelector(".help-page-previous");
	const next = puzzle.help.querySelector(".help-page-next");
	const number = puzzle.help.querySelector(".help-page-number");

	puzzle.showHelpPage(0);
	assert(!rules.hidden && clues.hidden,
	       "rules were not the only visible first page");
	assert(previous.hidden && !next.hidden,
	       "first-page navigation was incorrect");
	assert(number.textContent == "Leaf I of II",
	       "first-page folio was incorrect");

	puzzle.turnHelpPage(1);
	assert(rules.hidden && !clues.hidden,
	       "clues were not the only visible second page");
	assert(!previous.hidden && next.hidden,
	       "second-page navigation was incorrect");
	assert(number.textContent == "Leaf II of II",
	       "second-page folio was incorrect");
	assert(previous.focused, "page turn did not preserve keyboard focus");
});

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
	const fixRight = {
		constrain(domains) {
			const old = domains[1][right.value];
			domains[1][right.value] &= 1 << 1;
			return old != domains[1][right.value];
		},
	};
	puzzle.clues = [clue, fixRight];

	target.choose(left.value);
	assert(clue.display.classList.contains("contradiction"),
	       "contradicting clue was not highlighted");
	assert(puzzle.hClues.classList.contains("solution") &&
	       puzzle.vClues.classList.contains("solution"),
	       "clue displays were not marked as a solution");
});

Deno.test("all clues essential to a contradiction are highlighted", function() {
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
		assert(clue.display.classList.contains("contradiction"),
		       "essential clue was not highlighted");
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

Deno.test("slot views are reused when switching displays", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const single = slot.singleElem;
	const possible = slot.possibleElem;

	slot.displaySingle(slot.value);
	assert(slot.singleElem === single, "single tile was replaced");
	assert(slot.possibleElem === possible, "possibility table was replaced");
	assert(!single.hidden && possible.hidden,
	       "single tile was not the only visible view");

	slot.displayPossible();
	assert(slot.singleElem === single, "single tile was not reused");
	assert(slot.possibleElem === possible, "possibility table was not reused");
	assert(single.hidden && !possible.hidden,
	       "possibility table was not the only visible view");
});

Deno.test("revealing a slot preserves its deductions", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const discarded = (slot.value + 1) % symbols.length;

	slot.removePossible(discarded, true);
	slot.reveal();
	assert(slot.singleElem.hidden && !slot.possibleElem.hidden,
	       "reveal replaced the possibility table");
	assert(slot.possibleElem.className == "solution",
	       "possibility table was not marked as a solution");
	assert(slot.possibilityElems[slot.value].className ==
	       "possibility answer", "answer was not marked");
	assert(slot.possibilityElems[discarded].className ==
	       "possibility dead-possibility",
	       "reveal restored a discarded possibility");

	slot.displayPossible();
	assert(slot.possibleElem.className == "",
	       "solution styling survived a display reset");
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

Deno.test("high scores retain the ten fastest times", function() {
	localStorage.setItem("highScores", JSON.stringify([
		9000, 3000, 7000, 1000, 11000, 5000,
		4000, 8000, 2000, 10000, 6000,
	]));
	const puzzle = makePuzzle(1);

	const entry = puzzle.recordHighScore(500);
	assert(puzzle.highScores.length == 10,
	       "high-score list was not limited to ten entries");
	assert(entry == puzzle.highScores[0],
	       "qualifying high score was not returned");
	puzzle.highlightedScore = entry;
	puzzle.renderHighScores();
	assert(puzzle.scores.querySelector("ol").children[0].className ==
	       "score-new", "new high score was not highlighted");
	assert(puzzle.highScores[0].elapsed == 500,
	       "new fastest time was not ranked first");
	assert(puzzle.highScores[9].elapsed == 9000,
	       "slowest retained time was incorrect");
	assert(JSON.stringify(puzzle.highScores) ==
	       localStorage.getItem("highScores"),
	       "high scores were not persisted");
	assert(puzzle.recordHighScore(12000) === null,
	       "non-qualifying score was returned");
	localStorage.removeItem("highScores");
});

Deno.test("a winning high score opens the Pantheon", function() {
	localStorage.removeItem("gameStats");
	const puzzle = makePuzzle(1, true);
	for (const slot of puzzle.rows[0].slots)
		slot.displaySingle(slot.value);
	puzzle.toggleScores = function() {
		this.scoresShown = true;
	};
	puzzle.timerElapsed = 5000;

	puzzle.checkWin();
	assert(puzzle.scoresShown, "winning high score did not show the Pantheon");
	assert(puzzle.highlightedScore == puzzle.highScores[0],
	       "winning high score was not selected for highlighting");
	assert(JSON.stringify(puzzle.gameStats) ==
	       JSON.stringify({ won: 1, lost: 0 }),
	       "win was not counted");
	localStorage.removeItem("highScores");
	localStorage.removeItem("gameStats");
});

Deno.test("game outcomes are persisted and rendered", function() {
	localStorage.setItem("gameStats", JSON.stringify({ won: 3, lost: 2 }));
	const puzzle = makePuzzle(1);
	puzzle.lose("test loss");
	assert(localStorage.getItem("gameStats") ==
	       JSON.stringify({ won: 3, lost: 3 }),
	       "loss was not persisted");

	puzzle.renderHighScores();
	assert(puzzle.scores.querySelector(".games-sought").textContent == 6,
	       "total games were not rendered");
	assert(puzzle.scores.querySelector(".games-won").textContent == 3,
	       "wins were not rendered");
	assert(puzzle.scores.querySelector(".games-sought-unit").textContent ==
	       "times", "plural game count was not rendered");
	localStorage.removeItem("gameStats");
});

Deno.test("game statistics use singular wording", function() {
	localStorage.setItem("gameStats", JSON.stringify({ won: 1, lost: 0 }));
	const puzzle = makePuzzle(1);
	puzzle.renderHighScores();
	assert(puzzle.scores.querySelector(".games-sought-unit").textContent ==
	       "time", "singular game count was not rendered");
	localStorage.removeItem("gameStats");
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
