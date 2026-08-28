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
		this.style = {
			setProperty(name, value) { this[name] = String(value); },
		};
	}

	appendChild(child) {
		this.children.push(child);
	}
	replaceChildren(...children) {
		this.children = children;
	}

	addEventListener(type, listener) {
		this.listeners[type] = listener;
	}
	focus() {
		this.focused = true;
	}
	setAttribute() {}
	setCustomValidity(message) {
		this.validationMessage = message;
	}
	reportValidity() {}
	querySelector(selector) {
		const match = selector.match(/^input\[name=([^\]]+)\]:checked$/);
		if (match)
			return this.children.find(child =>
				child.name == match[1] && child.checked);
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
	listeners: {},
	addEventListener(type, listener) { this.listeners[type] = listener; },
	createElement() { return new FakeElement(); },
	createTextNode(text) { return { textContent: text }; },
	querySelector(selector) { return this.body.querySelector(selector); },
	body: new FakeElement(),
};
globalThis.document.body.dataset = {};
const boardActions = globalThis.document.querySelector("#board-actions");
for (const action of ["place", "remove"]) {
	const input = new FakeElement();
	input.name = "tile-operation";
	input.value = action;
	boardActions.appendChild(input);
}
boardActions.children[0].checked = true;
for (const mark of ["inscribe", "sketch"]) {
	const input = new FakeElement();
	input.name = "tile-mark";
	input.value = mark;
	boardActions.appendChild(input);
}
boardActions.children[2].checked = true;
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
	"Adjacent3Clue: Adjacent3Clue, " +
	"ColumnClue: ColumnClue, " +
	"OrderClue: OrderClue, " +
	"defaultSymbols: defaultSymbols, " +
	"adjacent3DeductionMessage: adjacent3DeductionMessage, " +
	"clueProofStep: clueProofStep, " +
	"orderDeductionMessage: orderDeductionMessage, " +
	"proofMessageText: proofMessageText, " +
	"practiceMistakeMessage: practiceMistakeMessage, " +
	"proofDeductionMessage: proofDeductionMessage, " +
	"combineRelatedProofSteps: combineRelatedProofSteps, " +
	"nextForcedProofStep: nextForcedProofStep, " +
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

function selectTileAction(puzzle, action) {
	var operation = action == "remove" || action == "pencil-remove" ?
		"remove" : "place";
	var mark = action == "place" || action == "remove" ?
		"inscribe" : "sketch";
	for (const input of puzzle.boardActions.children) {
		if (input.name == "tile-operation")
			input.checked = input.value == operation;
		else if (input.name == "tile-mark")
			input.checked = input.value == mark;
	}
}

function makePuzzle(numRows, checkWin, puzzleSymbols) {
	const elem = function() { return new FakeElement(); };
	const puzzle = new Puzzle(elem(), elem(), elem(), elem(), elem(),
		puzzleSymbols || Array(numRows).fill(symbols),
		elem(), elem(), elem(), elem(),
		elem(), elem(), elem(), elem());
	const lose = puzzle.lose;
	puzzle.lose = function() {
		this.losses++;
		lose.apply(this, arguments);
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

function puzzleSignature(puzzle) {
	function locate(object) {
		for (let row = 0; row < puzzle.rows.length; row++) {
			if (object == puzzle.rows[row])
				return "row:" + row;
			const slot = puzzle.rows[row].slots.indexOf(object);
			if (slot >= 0)
				return "slot:" + row + ":" + slot;
		}
		return null;
	}
	return JSON.stringify({
		rows: puzzle.rows.map(row => row.slots.map(slot => slot.value)),
		clues: puzzle.clues.map(clue => {
			const result = { type: clue.constructor.name };
			for (const key of Object.keys(clue).sort()) {
				const value = clue[key];
				const location = locate(value);
				if (location !== null)
					result[key] = location;
				else if (["boolean", "number", "string"].includes(typeof value))
					result[key] = value;
			}
			return result;
		}),
	});
}

Deno.test("a puzzle seed reproduces the board and clues", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.paused = true;
	puzzle.resumeAfterModal = true;
	puzzle.newGame(305419896);
	const first = puzzleSignature(puzzle);
	const exact = puzzle.clues.filter(clue => clue.applyInitialState);
	assert(exact.length && exact.every(clue => clue.slot.single),
	       "exact clues were not applied when starting a paused game");
	assert(!puzzle.paused && !puzzle.resumeAfterModal,
	       "the seeded game retained the modal's paused state");
	puzzle.stopTimer();
	puzzle.newGame(7);
	const other = puzzleSignature(puzzle);
	puzzle.stopTimer();
	puzzle.newGame(305419896);
	const repeated = puzzleSignature(puzzle);
	puzzle.stopTimer();

	assert(first == repeated, "the same seed made a different puzzle");
	assert(first != other, "different seeds made the same puzzle");
	assert(puzzle.seed == 305419896 &&
	       puzzle.options.querySelector("#game-seed").value == "12345678",
	       "the current seed was not exposed in the options");
});

Deno.test("invalid puzzle seeds do not replace the current game", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame(42);
	const before = puzzleSignature(puzzle);
	assert(!puzzle.newGame(""), "an empty seed was accepted");
	assert(!puzzle.newGame("12.5"), "a fractional seed was accepted");
	assert(!puzzle.newGame("4294967296"), "an oversized seed was accepted");
	assert(puzzle.seed == 42 && puzzleSignature(puzzle) == before,
	       "an invalid seed changed the puzzle");
	puzzle.stopTimer();
});

Deno.test("hexadecimal puzzle seeds are accepted and normalized", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	assert(puzzle.newGame("DeAdBeEf"), "a hexadecimal seed was rejected");
	assert(puzzle.seed == 0xdeadbeef &&
	       puzzle.options.querySelector("#game-seed").value == "deadbeef",
	       "the hexadecimal seed was not normalized");
	puzzle.stopTimer();
});

Deno.test("opening options preserves the new-game button label", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("12345678");
	const start = puzzle.options.querySelector("#start-game-button");
	start.value = "Start New Game";
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	assert(start.value == "Start New Game" &&
	       puzzle.options.querySelector(".modal-close").value == "Resume game",
	       "opening options rewrote the wrong footer button");
	puzzle.toggleOptions();
	puzzle.stopTimer();
});

Deno.test("a false placement loses the game", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;

	slot.choose(wrong);
	assert(puzzle.losses == 1, "false placement did not cause a loss");
	assert(slot.possibleElem.className == "solution" && !puzzle.proof,
	       "a loss did not reveal the solution before opening a proof");
	assert(slot.possibilityElems[wrong].classList.contains("failed-action"),
	       "false placement did not mark the chosen tile");
});

Deno.test("a false elimination loses the game", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];

	slot.discard(slot.value);
	assert(puzzle.losses == 1, "false elimination did not cause a loss");
	assert(slot.possibilityElems[slot.value].classList.contains("failed-action"),
	       "false elimination did not mark the discarded answer");
});

Deno.test("modifier clicks toggle pencil marks", function() {
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

	cell.listeners.click({ altKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       !puzzle.pencilMarks[0].discard,
	       "option-click did not replace the pencil elimination");
	cell.listeners.contextmenu({
		altKey: true,
		preventDefault() {},
	});
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "option-right-click did not pencil-discard");

	cell.listeners.click({ shiftKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       !puzzle.pencilMarks[0].discard,
	       "shift-click did not replace the pencil elimination");
	cell.listeners.contextmenu({
		shiftKey: true,
		preventDefault() {},
	});
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "shift-right-click did not pencil-discard");

	puzzle.macOS = true;
	const wrong = (value + 1) % symbols.length;
	slot.possibilityElems[wrong].listeners.contextmenu({
		ctrlKey: true,
		preventDefault() {},
	});
	assert(!slot.possible[wrong],
	       "macOS secondary click was mistaken for a pencil discard");
});

Deno.test("coarse pointers use an expanded slot tray", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	puzzle.expandTileChoices = true;
	const panel = puzzle.slotTray.querySelector(".slot-tray-panel");
	slot.elem.getBoundingClientRect = function() {
		return { left: 100, top: 100, width: 30, height: 30 };
	};
	panel.getBoundingClientRect = function() {
		return { width: 260, height: 200 };
	};
	globalThis.innerWidth = 800;
	globalThis.innerHeight = 400;

	slot.possibilityElems[0].listeners.click({ ctrlKey: false });
	assert(!slot.single && puzzle.expandedSlot == slot,
	       "first tap made a move instead of expanding the slot");
	assert(!puzzle.slotTray.hidden &&
	       puzzle.slotTrayOptions.children.length == symbols.length,
	       "expanded tray did not show all possibilities");
	assert(panel.style.left == "8px" && panel.style.top == "15px",
	       "expanded tray was not anchored and clamped to its slot");
	assert(panel.classList.contains("opening") &&
	       panel.style["--tray-start-x"] == "92px" &&
	       panel.style["--tray-start-scale-x"] == String(30 / 260),
	       "expanded tray did not animate from its source slot");
	const trayTiles = puzzle.slotTrayOptions.children.slice();

	selectTileAction(puzzle, "remove");
	let tile = puzzle.slotTrayOptions.children[wrong];
	tile.listeners.click({});
	assert(!slot.possible[wrong], "tray removal did not commit");
	assert(puzzle.expandedSlot === null && puzzle.slotTray.hidden,
	       "tray removal did not close the slot");

	puzzle.openSlotTray(slot);
	assert(puzzle.slotTrayOptions.children.every(function(tile, i) {
		return tile === trayTiles[i];
	}), "expanded tray did not reuse its tiles");
	selectTileAction(puzzle, "pencil-select");
	tile = puzzle.slotTrayOptions.children[slot.value];
	let rerendered = false;
	const renderSlotTray = puzzle.renderSlotTray;
	puzzle.renderSlotTray = function() {
		rerendered = true;
		renderSlotTray.call(this);
	};
	tile.listeners.click({});
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.expandedSlot === null && puzzle.slotTray.hidden,
	       "tray pencil action did not close the slot");
	assert(!rerendered, "tray pencil action rerendered before closing");
	puzzle.renderSlotTray = renderSlotTray;

	puzzle.openSlotTray(slot);
	selectTileAction(puzzle, "place");
	tile = puzzle.slotTrayOptions.children[slot.value];
	tile.listeners.click({});
	assert(slot.single && puzzle.expandedSlot === null &&
	       puzzle.slotTray.hidden,
	       "tray placement did not resolve and close the slot");
	assert(!panel.classList.contains("opening"),
	       "closing the tray retained its opening animation");
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
});

Deno.test("touch options use independent defaults and saved settings",
		function() {
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("dragTileChoices");
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
	let dragOption = puzzle.options.querySelector("#drag-tile-choices");
	assert(mediaQuery == "(pointer: coarse)" &&
	       puzzle.expandTileChoices && !puzzle.dragTileChoices &&
	       puzzle.showActionSelector && !dragOption.disabled,
	       "touch options did not use coarse/small defaults");

	localStorage.setItem("expandTileChoices", "false");
	localStorage.setItem("dragTileChoices", "true");
	localStorage.setItem("showActionSelector", "false");
	puzzle = makePuzzle(1);
	dragOption = puzzle.options.querySelector("#drag-tile-choices");
	assert(!puzzle.expandTileChoices && puzzle.dragTileChoices &&
	       !puzzle.showActionSelector && dragOption.disabled &&
	       dragOption.checked,
	       "saved touch preferences did not override defaults");
	delete globalThis.matchMedia;
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("dragTileChoices");
	localStorage.removeItem("showActionSelector");
	localStorage.removeItem("selectionActionMenu");
});

Deno.test("expanded tiles support press-drag-release actions", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	const cell = slot.possibilityElems[0];
	puzzle.expandTileChoices = true;
	puzzle.dragTileChoices = true;
	selectTileAction(puzzle, "remove");
	cell.getBoundingClientRect = function() {
		return { left: 100, top: 100, width: 30, height: 30 };
	};
	puzzle.slotTray.querySelector(".slot-tray-panel").getBoundingClientRect =
		function() { return { width: 260, height: 200 }; };
	globalThis.innerWidth = 800;
	globalThis.innerHeight = 400;

	let prevented = false;
	cell.listeners.pointerdown({
		button: 0,
		pointerId: 1,
		clientX: 100,
		clientY: 100,
		currentTarget: cell,
		preventDefault() { prevented = true; },
	});
	const target = puzzle.slotTrayOptions.children[wrong];
	globalThis.document.elementFromPoint = function() { return target; };
	cell.listeners.pointermove({
		pointerId: 1,
		clientX: 120,
		clientY: 120,
		preventDefault() {},
	});
	assert(prevented && target.classList.contains("drag-target"),
	       "drag did not open the tray and highlight its target");
	cell.listeners.pointerup({
		pointerId: 1,
		clientX: 120,
		clientY: 120,
		preventDefault() {},
	});
	assert(!slot.possible[wrong] && puzzle.slotTray.hidden,
	       "releasing over a tile did not apply and close");

	delete globalThis.document.elementFromPoint;
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
});

Deno.test("the persistent selector applies actions directly", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	puzzle.expandTileChoices = false;
	puzzle.showActionSelector = true;

	selectTileAction(puzzle, "pencil-select");
	assert(puzzle.getTileAction() == "pencil-select",
	       "persistent selector did not show its selected action");
	slot.possibilityElems[slot.value].listeners.click({ ctrlKey: false });
	assert(puzzle.pencilMarks.length == 1 && !slot.single,
	       "direct pencil action committed a move");

	selectTileAction(puzzle, "remove");
	slot.possibilityElems[wrong].listeners.click({ ctrlKey: false });
	assert(!slot.possible[wrong] && puzzle.expandedSlot === null,
	       "direct removal opened the expanded tray");
});

Deno.test("tile action groups toggle when clicked anywhere", function() {
	const puzzle = makePuzzle(1);
	const operation = new FakeElement();
	const place = new FakeElement();
	const remove = new FakeElement();
	place.type = remove.type = "radio";
	place.checked = true;
	remove.checked = false;
	operation.appendChild(place);
	operation.appendChild(new FakeElement());
	operation.appendChild(remove);
	operation.appendChild(new FakeElement());
	let prevented = false;

	puzzle.toggleTileAction({
		currentTarget: operation,
		preventDefault() { prevented = true; },
	});
	assert(prevented, "group click retained the label's default action");
	assert(!place.checked && remove.checked,
	       "group click did not toggle the selected action");
	puzzle.toggleTileAction({
		currentTarget: operation,
		preventDefault() {},
	});
	assert(place.checked && !remove.checked,
	       "second group click did not toggle the action back");
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

Deno.test("pencil marks render only their changed row", function() {
	const puzzle = makePuzzle(2);
	const renders = [0, 0];
	for (let i = 0; i < puzzle.rows.length; i++) {
		const displayPencil = puzzle.rows[i].displayPencil;
		puzzle.rows[i].displayPencil = function(...args) {
			renders[i]++;
			displayPencil.apply(this, args);
		};
	}

	const first = puzzle.rows[0].slots[0];
	first.pencil(first.value, false);
	assert(renders[0] == 1 && renders[1] == 0,
	       "pencil mark rendered an unchanged row");

	const second = puzzle.rows[1].slots[0];
	second.pencil(second.value, false);
	assert(renders[0] == 1 && renders[1] == 1,
	       "second pencil mark rerendered the first row");

	first.choose(first.value);
	assert(renders[0] == 2 && renders[1] == 1,
	       "committed move rendered an unchanged row");
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

Deno.test("placing every symbol in a clue dismisses it", function() {
	const puzzle = makePuzzle(2);
	const top = puzzle.rows[0].slots[0];
	const bottom = puzzle.rows[1].slots[0];
	const clue = new ColumnClue(puzzle);
	clue.tRow = top.row;
	clue.bRow = bottom.row;
	clue.col = 0;
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	clue.rendered = true;
	puzzle.clues = [clue];

	top.choose(top.value, true);
	assert(clue.active, "partially exhausted clue was dismissed");
	bottom.choose(bottom.value, true);
	assert(!clue.active && clue.display.classList.contains("clue-hidden"),
	       "exhausted clue was not dismissed");
});

Deno.test("automatic clue dismissal can be disabled and saved", function() {
	localStorage.removeItem("autoDismissClues");
	let puzzle = makePuzzle(2);
	let option = puzzle.options.querySelector("#auto-dismiss-clues");
	assert(puzzle.autoDismissClues && option.checked,
	       "automatic clue dismissal did not default to enabled");
	puzzle.setAutoDismissClues(false);
	assert(!puzzle.autoDismissClues && !option.checked &&
	       localStorage.getItem("autoDismissClues") == "false",
	       "disabling automatic clue dismissal was not saved");

	puzzle = makePuzzle(2);
	option = puzzle.options.querySelector("#auto-dismiss-clues");
	assert(!puzzle.autoDismissClues && !option.checked,
	       "saved automatic clue dismissal setting was not restored");
	const top = puzzle.rows[0].slots[0];
	const bottom = puzzle.rows[1].slots[0];
	const clue = new ColumnClue(puzzle);
	clue.tRow = top.row;
	clue.bRow = bottom.row;
	clue.col = 0;
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	clue.rendered = true;
	puzzle.clues = [clue];
	top.choose(top.value, true);
	bottom.choose(bottom.value, true);
	assert(clue.active, "disabled automatic dismissal still hid a clue");

	puzzle.setAutoDismissClues(true);
	assert(!clue.active && clue.display.classList.contains("clue-hidden"),
	       "enabling automatic dismissal did not hide an exhausted clue");
	localStorage.removeItem("autoDismissClues");
});

Deno.test("practice mode is saved and suppresses timing and scores", function() {
	localStorage.removeItem("practiceMode");
	localStorage.removeItem("gameStats");
	localStorage.removeItem("highScores");
	let puzzle = makePuzzle(6, true);
	puzzle.setPracticeMode(true);
	puzzle.newGame(1);
	assert(puzzle.practiceMode && !puzzle.scoreEligible &&
	       puzzle.timer.hidden && puzzle.timerTimeout === null &&
	       localStorage.getItem("practiceMode") == "true",
	       "practice mode did not suppress and save the timer");
	for (const row of puzzle.rows)
		for (const slot of row.slots)
			slot.displaySingle();
	puzzle.checkWin();
	assert(puzzle.highScores.length == 0 &&
	       JSON.stringify(puzzle.gameStats) ==
	       JSON.stringify({ won: 0, lost: 0 }),
	       "a practice win was recorded in the Pantheon");

	puzzle = makePuzzle(6);
	assert(puzzle.practiceMode &&
	       puzzle.options.querySelector("#practice-mode").checked,
	       "the saved practice preference was not restored");
	puzzle.newGame(2);
	puzzle.setPracticeMode(false);
	puzzle.lose("test loss");
	assert(JSON.stringify(puzzle.gameStats) ==
	       JSON.stringify({ won: 0, lost: 0 }),
	       "a partly untimed game was recorded after leaving practice mode");
	localStorage.removeItem("practiceMode");
	localStorage.removeItem("gameStats");
	localStorage.removeItem("highScores");
});

Deno.test("practice messages distinguish direct explanations", function() {
	assert(Logos.practiceMistakeMessage(false, [{}]) ==
	       "That placement contradicts a clue.",
	       "a direct placement contradiction did not mention its clue");
	assert(Logos.practiceMistakeMessage(true, [{}]) ==
	       "Removing that possibility contradicts a clue.",
	       "a direct removal contradiction did not mention its clue");
	const placement = Logos.practiceMistakeMessage(false, []);
	const removal = Logos.practiceMistakeMessage(true, []);
	assert(placement == "That placement leads to a contradiction." &&
	       removal == "That possibility cannot be discarded.",
	       "an indirect contradiction was not stated plainly");
});

Deno.test("placing only the middle of a three-adjacent clue keeps it", function() {
	const puzzle = makePuzzle(3);
	const clue = new Logos.Adjacent3Clue(puzzle);
	clue.lRow = puzzle.rows[0];
	clue.mRow = puzzle.rows[1];
	clue.rRow = puzzle.rows[2];
	clue.lCol = clue.mCol = clue.rCol = 0;
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	clue.rendered = true;
	puzzle.clues = [clue];

	clue.mRow.slots[clue.mCol].choose(
		clue.mRow.slots[clue.mCol].value, true);
	assert(clue.active &&
	       !clue.display.classList.contains("clue-hidden"),
	       "three-adjacent clue was dismissed after placing its middle");
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

Deno.test("help pages switch between rules, clues, and controls", function() {
	const puzzle = makePuzzle(1);
	const rules = puzzle.help.querySelector(".help-page-rules");
	const clues = puzzle.help.querySelector(".help-page-clues");
	const controls = puzzle.help.querySelector(".help-page-controls");
	const cluesPrevious = clues.querySelector(".help-page-previous");
	const controlsPrevious = controls.querySelector(".help-page-previous");

	puzzle.showHelpPage(0);
	assert(!rules.hidden && clues.hidden && controls.hidden,
	       "rules were not the only visible first page");

	puzzle.turnHelpPage(1);
	assert(rules.hidden && !clues.hidden && controls.hidden,
	       "clues were not the only visible second page");
	assert(cluesPrevious.focused,
	       "page turn did not preserve keyboard focus");

	puzzle.turnHelpPage(1);
	assert(rules.hidden && clues.hidden && !controls.hidden,
	       "controls were not the only visible third page");
	assert(controlsPrevious.focused,
	       "second page turn did not preserve keyboard focus");
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

Deno.test("slot views are reused when switching displays", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const single = slot.singleElem;
	const possible = slot.possibleElem;

	slot.displaySingle(slot.possibilityElems[slot.value]);
	assert(slot.singleElem === single, "single tile was replaced");
	assert(slot.possibleElem === possible, "possibility table was replaced");
	assert(!single.hidden && possible.hidden,
	       "single tile was not the only visible view");
	assert(single.classList.contains("placing"),
	       "placed tile was not animated");

	slot.displayPossible();
	assert(slot.singleElem === single, "single tile was not reused");
	assert(slot.possibleElem === possible, "possibility table was not reused");
	assert(single.hidden && !possible.hidden,
	       "possibility table was not the only visible view");
	assert(!single.classList.contains("placing"),
	       "placement animation was not reset");
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

Deno.test("placement animation choices are saved and restored", function() {
	localStorage.removeItem("placementAnimation");
	let puzzle = makePuzzle(1);
	assert(puzzle.placementAnimation == "settle" &&
	       document.body.dataset.placementAnimation == "settle" &&
	       puzzle.options.querySelector("#placement-settle").checked,
	       "placement animation did not default to settle");

	puzzle.setPlacementAnimation("grow");
	const slot = puzzle.rows[0].slots[0];
	const source = slot.possibilityElems[slot.value];
	source.getBoundingClientRect = function() {
		return { left: 20, top: 30, width: 10, height: 20 };
	};
	slot.singleElem.getBoundingClientRect = function() {
		return { left: 10, top: 10, width: 30, height: 40 };
	};
	slot.displaySingle(source);
	assert(slot.singleElem.style["--tile-place-x"] == "0px" &&
	       slot.singleElem.style["--tile-place-y"] == "10px" &&
	       slot.singleElem.style["--tile-place-scale-x"] == String(1 / 3) &&
	       slot.singleElem.style["--tile-place-scale-y"] == "0.5",
	       "grow animation did not start at its possibility");
	assert(localStorage.getItem("placementAnimation") == "grow",
	       "placement animation choice was not saved");

	puzzle = makePuzzle(1);
	assert(puzzle.placementAnimation == "grow" &&
	       puzzle.options.querySelector("#placement-grow").checked,
	       "placement animation choice was not restored");
	localStorage.removeItem("placementAnimation");
});

Deno.test("revealing a slot preserves its deductions", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const discarded = (slot.value + 1) % symbols.length;

	slot.removePossible(discarded, true);
	slot.removePossible(slot.value, true);
	slot.reveal();
	assert(slot.singleElem.hidden && !slot.possibleElem.hidden,
	       "reveal replaced the possibility table");
	assert(slot.possibleElem.className == "solution",
	       "possibility table was not marked as a solution");
	assert(slot.possibilityElems[slot.value].className ==
	       "possibility answer", "a discarded answer was not restored");
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
	puzzle.seed = 0x1234abcd;

	const entry = puzzle.recordHighScore(500);
	assert(puzzle.highScores.length == 10,
	       "high-score list was not limited to ten entries");
	assert(entry == puzzle.highScores[0],
	       "qualifying high score was not returned");
	puzzle.highlightedScore = entry;
	puzzle.renderHighScores();
	const scoreItem = puzzle.scores.querySelector("ol").children[0];
	assert(scoreItem.className ==
	       "score-new", "new high score was not highlighted");
	const scoreButton = scoreItem.children[0];
	const scoreSeed = scoreItem.children[1];
	assert(entry.seed == 0x1234abcd && scoreSeed.hidden &&
	       scoreSeed.textContent == "Puzzle seed: 1234abcd",
	       "the high score did not retain its puzzle seed");
	scoreButton.listeners.click.call(scoreButton);
	assert(!scoreSeed.hidden,
	       "activating a high score did not reveal its seed");
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
		slot.displaySingle();
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

Deno.test("a concluding placement names the conflicting tile", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame("e2b29313");
	puzzle.rows[3].slots[4].choose(3);
	puzzle.explainLoss();
	const step = puzzle.proof.steps[puzzle.proof.steps.length - 1];
	assert(step.conclusion && step.deduction ==
		       "adjacent3.middle.placement" &&
	       step.row == 3 && step.symbol == 3 && step.domain == 1 << 3 &&
	       Logos.proofMessageText(puzzle, step.message) ==
		       "⚃ must be in the fourth column because that is the only " +
		       "place where ◇ and □ can fit on opposite sides of it." &&
	       Logos.proofMessageText(puzzle, step.contradicts) == "⚃",
	       "the final placement did not record its contradiction");
	puzzle.proof.position = puzzle.proof.steps.length;
	puzzle.showProofPosition();
	assert(puzzle.proofControls.querySelector(".proof-deduction").textContent ==
	       "⚃ must be in the fourth column because that is the only place " +
	       "where ◇ and □ can fit on opposite sides of it, and therefore ⚃ " +
	       "is not. Q.E.D.",
	       "the rendered conclusion did not explain the conflicting tile");
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
	localStorage.removeItem("gameStats");
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
	localStorage.removeItem("gameStats");
});

export { Logos, makePuzzle };
