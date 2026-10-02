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
		this.attributes = {};
		this.innerHTML = "";
		this.value = "";
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
	setAttribute(name, value) {
		this.attributes[name] = String(value);
	}
	setCustomValidity(message) {
		this.validationMessage = message;
	}
	reportValidity() {}
	querySelector(selector) {
		const match = selector.match(/^input\[name=([^\]]+)\]:checked$/);
		if (match)
			return this.children.find(child =>
				child.name == match[1] && child.checked);
		const child = this.querySelectorAll(selector)[0];
		if (child)
			return child;
		if (!this.queries[selector])
			this.queries[selector] = new FakeElement();
		return this.queries[selector];
	}
	querySelectorAll(selector) {
		return this.children.flatMap(child => [
			...(selector.startsWith(".") &&
			    (child.className || "").split(" ").includes(selector.slice(1)) ?
				[child] : []),
			...(child.querySelectorAll ? child.querySelectorAll(selector) : []),
		]);
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
	modals: [],
	hidden: false,
	addEventListener(type, listener) { this.listeners[type] = listener; },
	createElement() { return new FakeElement(); },
	createTextNode(text) { return { textContent: text }; },
	querySelector(selector) { return this.body.querySelector(selector); },
	querySelectorAll(selector) {
		return selector == ".modal:not([hidden])" ?
			this.modals.filter(modal => !modal.hidden) : [];
	},
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
globalThis.Audio = class {
	pause() {}
	play() {}
};
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
	new URL("../logos.js", import.meta.url));
const Logos = eval(source +
	"\n;({ puzzleDifficulty, difficultyRating, puzzleFromSeed, " +
	"difficultyOpportunities, placementDifficultyChoices, nextHintStep, measureDifficulty, hasRunDifficulty, " +
	"Puzzle: Puzzle, ExactClue: ExactClue, " +
	"Adjacent2Clue: Adjacent2Clue, " +
	"Adjacent3Clue: Adjacent3Clue, " +
	"ColumnClue: ColumnClue, " +
	"OrderClue: OrderClue, " +
	"defaultSymbols: defaultSymbols, accessRunHistory: accessRunHistory, " +
	"setHistoryStorage: storage => { accessRunHistory = storage; }, " +
	"adjacent3DeductionMessage: adjacent3DeductionMessage, " +
	"clueProofStep: clueProofStep, " +
	"orderDeductionMessage: orderDeductionMessage, " +
	"proofMessageText: proofMessageText, " +
	"practiceMistakeMessage: practiceMistakeMessage, " +
	"proofDeductionMessage: proofDeductionMessage, " +
	"combineRelatedProofSteps: combineRelatedProofSteps, " +
	"drainForcedProofSteps: drainForcedProofSteps, " +
	"nextForcedProofStep: nextForcedProofStep, " +
	"proofConclusionPresented: proofConclusionPresented, " +
	"romanNumeral: romanNumeral, formatOlympiad: formatOlympiad, greekNumeralDay: greekNumeralDay });");
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
	const help = elem();
	for (const [name, title] of [["rules", "Objective"], ["clues", "Clues"],
		["controls", "Controls"], ["hints", "Hints and Proofs"]]) {
		const page = elem();
		page.className = "help-page help-page-" + name;
		page.querySelector("h3").textContent = title;
		help.appendChild(page);
	}
	const puzzle = new Puzzle(elem(), elem(), elem(), elem(), elem(),
		puzzleSymbols || Array(numRows).fill(symbols),
		elem(), elem(), help, elem(),
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

Deno.test("random difficulty preferences filter candidates without changing explicit seeds", function() {
	const originalRandom = crypto.getRandomValues;
	const seeds = [0x98079244, 0xe2a689dd];
	const puzzle = makePuzzle(6);
	let message;
	puzzle.say = value => { message = value; };
	crypto.getRandomValues = values => {
		assert(seeds.length, "generation requested an unexpected candidate");
		values[0] = seeds.shift();
		return values;
	};
	try {
		puzzle.setRandomDifficulties(["hard"]);
		assert(puzzle.newGame() && puzzle.seed == 0xe2a689dd && seeds.length == 0,
		       "random generation did not skip the easy candidate");
		assert(puzzle.newGame("98079244") && puzzle.seed == 0x98079244,
		       "difficulty preferences rejected an explicit seed");
		puzzle.setRandomDifficulties([]);
		const identity = puzzle.gameIdentity;
		assert(!puzzle.newGame() && puzzle.gameIdentity !== identity && puzzle.timerTimeout === null &&
		       puzzle.gameOver && puzzle.seed === undefined && puzzle.clues.length == 0 &&
		       puzzle.timer.classList.contains("contemplating") && puzzle.messages.classList.contains("won") &&
		       message == "You have chosen the path of contemplation.",
		       "empty selection did not replace the game with contemplation");
		assert(puzzle.newGame("98079244"), "empty selection blocked an explicit seed");
		assert(!puzzle.timer.classList.contains("contemplating") && !puzzle.messages.classList.contains("won"),
		       "a new puzzle retained contemplation styling");
		const restored = makePuzzle(6);
		assert(restored.randomDifficulties.length == 0, "empty preference was not restored");
		restored.setRandomDifficulties(["easy", "hard"]);
		assert(makePuzzle(6).randomDifficulties.join() == "easy,hard", "mixed preference was not restored");
	} finally {
		puzzle.stopTimer();
		crypto.getRandomValues = originalRandom;
		localStorage.removeItem("randomDifficulties");
	}
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

Deno.test("a blank seed starts a random game from Options", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	const input = puzzle.options.querySelector("#game-seed");
	input.value = "   ";
	puzzle.playSeed();
	assert(!puzzle.gameOver && typeof puzzle.seed == "number" &&
	       input.value == puzzle.seed.toString(16).padStart(8, "0") &&
	       input.validationMessage == "",
	       "a blank seed did not start a random game");
	puzzle.stopTimer();
});

Deno.test("opening options resets the seed and its action label", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.newGame("12345678");
	const start = puzzle.options.querySelector("#start-game-button");
	const input = puzzle.options.querySelector("#game-seed");
	input.value = "";
	input.listeners.input();
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	assert(input.value == "12345678" && start.value == "Restart" &&
	       puzzle.options.querySelector(".modal-close").value == "Resume game",
	       "opening options did not restore the seed and distinct button labels");
	puzzle.toggleOptions();
	puzzle.stopTimer();
});

Deno.test("the seed action describes random, chosen, and restarted puzzles", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	const input = puzzle.options.querySelector("#game-seed");
	const start = puzzle.options.querySelector("#start-game-button");
	function edit(value, expected) {
		input.value = value;
		input.listeners.input();
		assert(start.value == expected,
		       "unexpected seed action for " + JSON.stringify(value));
		assert(puzzle.options.querySelector("#copy-seed-link").disabled ==
		       (expected == "Random" || value == "invalid"),
		       "copy link was not enabled only for a valid seed");
	}
	edit("", "Random");
	edit("0", "Start");
	puzzle.newGame(0x2a);
	puzzle.stopTimer();
	assert(start.value == "Restart", "a new game did not update the action");
	edit("", "Random");
	edit("   ", "Random");
	edit("2b", "Start");
	edit("invalid", "Start");
	edit(" 2A ", "Restart");
	edit("0000002a", "Restart");
	puzzle.gameOver = true;
	edit("2a", "Restart");
	edit("2b", "Start");
	puzzle.newGame(0);
	puzzle.stopTimer();
	edit("0", "Restart");
});

Deno.test("pasting a seed replaces the field and refreshes its controls", function() {
	const puzzle = makePuzzle(6);
	puzzle.options.hidden = false;
	const input = puzzle.options.querySelector("#game-seed");
	input.value = "12345678";
	let prevented = false;
	input.listeners.paste.call(input, {
		clipboardData: { getData() { return " 98079244\n"; } },
		preventDefault() { prevented = true; },
	});
	assert(prevented && input.value == "98079244", "paste did not replace the existing seed");
	assert(puzzle.options.querySelector("#seed-difficulty").textContent == "" &&
	       !puzzle.options.querySelector("#copy-seed-link").disabled,
	       "paste revealed difficulty or failed to refresh seed controls");
});

Deno.test("seed difficulty is revealed only for the current started puzzle", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.options.hidden = false;
	const input = puzzle.options.querySelector("#game-seed");
	const display = puzzle.options.querySelector("#seed-difficulty");
	for (const value of ["9", "98079244", "2a", "invalid!", ""]) {
		input.value = value;
		input.listeners.input();
		assert(!puzzle.seedDifficultyCache && display.textContent == "",
		       "an unplayed seed revealed its difficulty");
	}
	puzzle.newGame("98079244", true);
	puzzle.updateSeedDifficulty();
	assert(display.textContent == "" && !puzzle.seedDifficultyCache,
	       "the Start Game invitation revealed difficulty");
	puzzle.startGame();
	puzzle.stopTimer();
	assert(display.textContent == "Difficulty: Easy", "starting did not reveal difficulty");
	const cache = puzzle.seedDifficultyCache;
	for (const value of ["2a", "98079245", "", "invalid!"]) {
		input.value = value;
		input.listeners.input();
		assert(display.textContent == "" && puzzle.seedDifficultyCache === cache,
		       "editing the seed computed or displayed another puzzle's difficulty");
	}
	input.value = "98079244";
	input.listeners.input();
	assert(display.textContent == "Difficulty: Easy" && puzzle.seedDifficultyCache === cache,
	       "returning to the current seed did not restore its rating");
	// Both win and loss paths leave the seed intact and set gameOver.
	puzzle.gameOver = true;
	puzzle.updateSeedDifficulty();
	assert(display.textContent == "Difficulty: Easy", "completed game lost its rating");
	puzzle.newGame("2a");
	puzzle.stopTimer();
	input.value = " 2A ";
	input.listeners.input();
	assert(display.textContent.startsWith("Difficulty: ") && puzzle.seedDifficultyCache.seed === 42,
	       "equivalent short seed did not show the current rating");
	puzzle.newGame("2a", true);
	assert(display.textContent == "", "cached difficulty leaked before starting a replay");
});

Deno.test("puzzle links prepare the board but wait for Start Game to begin play", function() {
	const reference = makePuzzle(6);
	reference.say = function() {};
	reference.newGame(0x2a);
	reference.stopTimer();
	const expected = puzzleSignature(reference);
	for (const url of [
		"https://example.com/logos/#seed=0000002a",
		"http://localhost:8000/index.html#seed=2A",
		"file:///home/player/logos/index.html#seed=2a",
	]) {
		const puzzle = makePuzzle(6);
		puzzle.clear();
		puzzle.say = function() {};
		assert(puzzle.loadURLSeed(url), "puzzle link was not accepted: " + url);
		const identity = puzzle.gameIdentity;
		assert(puzzle.seed == 42 && !puzzle.gameOver && puzzle.paused &&
		       puzzle.timerTimeout === null && puzzle.timerElapsed == 0 && puzzle.timer.disabled &&
		       document.body.classList.contains("game-started"),
		       "loading a link did not prepare a paused puzzle");
		assert(!puzzle.invitation.hidden && puzzle.hClues.inert && puzzle.vClues.inert &&
		       puzzle.invitation.querySelector(".invitation-seed").textContent == "0000002a",
		       "loading a link did not show its invitation and lock the clues");
		puzzle.options.hidden = true;
		puzzle.toggleOptions();
		assert(puzzle.options.querySelector("#game-seed").value == "0000002a" &&
		       puzzle.options.querySelector("#start-game-button").value == "Start",
		       "Options did not expose the pending seed");
		puzzle.toggleOptions();
		puzzle.setPageHidden(true);
		puzzle.setPageHidden(false);
		puzzle.togglePause();
		assert(puzzle.paused && puzzle.timerTimeout === null,
		       "Options, visibility, or pause controls started the invited game early");
		puzzle.startGame();
		puzzle.stopTimer();
		assert(puzzle.gameIdentity === identity && !puzzle.paused && puzzle.seed == 0x2a && puzzleSignature(puzzle) == expected &&
		       puzzle.pendingSeed === undefined,
		       "Start Game did not consume the linked seed");
		assert(puzzle.invitation.hidden,
		       "starting the linked puzzle left the invitation visible");
		assert(!puzzle.startGame() && puzzle.gameIdentity === identity,
		       "accepting an already dismissed invitation replaced the game");
	}
});

Deno.test("the invitation keeps play paused until its reveal finishes", async function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.loadURLSeed("https://example.com/#seed=21");
	let reveal;
	puzzle.invitation.animate = function() {
		return { finished: new Promise(resolve => { reveal = resolve; }), cancel() {} };
	};
	assert(puzzle.startGame() && !puzzle.startGame(), "a second click started another reveal");
	assert(puzzle.paused && puzzle.timerTimeout === null && !puzzle.invitation.hidden,
	       "the clock started before the reveal completed");
	puzzle.setPageHidden(true);
	reveal();
	await Promise.resolve();
	assert(puzzle.invitation.hidden && puzzle.paused && puzzle.timerTimeout === null,
	       "a reveal in a hidden tab started the clock");
	puzzle.setPageHidden(false);
	assert(!puzzle.paused && puzzle.timerTimeout !== null && !puzzle.hClues.inert,
	       "returning to the revealed puzzle did not begin play");
	puzzle.stopTimer();
	delete puzzle.invitation.animate;
});

Deno.test("opening Options during the reveal keeps the timer stopped", async function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.loadURLSeed("https://example.com/#seed=21");
	let reveal;
	puzzle.invitation.animate = function() {
		return { finished: new Promise(resolve => { reveal = resolve; }), cancel() {} };
	};
	const modals = document.modals;
	document.modals = [puzzle.options];
	try {
		puzzle.options.hidden = true;
		puzzle.startGame();
		puzzle.toggleOptions();
		reveal();
		await Promise.resolve();
		assert(puzzle.invitation.hidden && puzzle.paused && puzzle.timerTimeout === null,
		       "the reveal started the timer behind Options");
		puzzle.toggleOptions();
		assert(!puzzle.paused && puzzle.timerTimeout !== null,
		       "closing Options after the reveal did not begin play");
	} finally {
		puzzle.stopTimer();
		delete puzzle.invitation.animate;
		document.modals = modals;
	}
});

Deno.test("an invitation reveal cannot restart a replacement game", async function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.loadURLSeed("https://example.com/#seed=21");
	let reveal;
	let cancelled = false;
	puzzle.invitation.animate = function() {
		return {
			finished: new Promise(resolve => { reveal = resolve; }),
			cancel() { cancelled = true; },
		};
	};
	puzzle.startGame();
	puzzle.newGame(7);
	puzzle.stopTimer();
	reveal();
	await Promise.resolve();
	assert(cancelled && puzzle.seed == 7 && puzzle.invitation.hidden &&
	       puzzle.timerTimeout === null && puzzle.pendingSeed === undefined,
	       "an obsolete reveal changed the replacement game");
	delete puzzle.invitation.animate;
});

Deno.test("a linked zero seed can be started from Options", function() {
	const puzzle = makePuzzle(6);
	puzzle.clear();
	puzzle.say = function() {};
	assert(puzzle.loadURLSeed("https://example.com/#seed=0"),
	       "a zero seed was not accepted from a URL");
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	puzzle.playSeed();
	puzzle.stopTimer();
	assert(puzzle.seed == 0 && puzzle.pendingSeed === undefined,
	       "starting from Options did not consume the linked zero seed");
	assert(puzzle.invitation.hidden,
	       "starting from Options left the invitation visible");
});

Deno.test("starting another puzzle discards the pending linked seed", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.loadURLSeed("https://example.com/#seed=2a");
	assert(!puzzle.newGame("invalid") && puzzle.pendingSeed == 42,
	       "an invalid seed discarded the pending puzzle");
	puzzle.newGame(7);
	puzzle.stopTimer();
	assert(puzzle.seed == 7 && puzzle.pendingSeed === undefined,
	       "starting another puzzle retained the linked seed");
	assert(puzzle.invitation.hidden,
	       "starting another puzzle left the invitation visible");
});

Deno.test("New Game skips the invitation and requests a fresh puzzle", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	puzzle.loadURLSeed("https://example.com/#seed=2a");
	let requested = false;
	puzzle.randomPuzzleSeed = function() { requested = true; return 7; };
	puzzle.newGame();
	try {
		assert(requested && puzzle.seed == 7 && puzzle.pendingSeed === undefined,
		       "New Game reused the linked puzzle");
		assert(puzzle.invitation.hidden && !puzzle.paused && !puzzle.hClues.inert &&
		       puzzle.timerTimeout !== null,
		       "New Game did not dismiss the invitation and begin play");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("missing or invalid URL seeds leave the puzzle unstarted", function() {
	const puzzle = makePuzzle(6);
	for (const fragment of ["", "#help", "#seed=", "#seed=xyz",
	                       "#seed=100000000", "#seed=-1", "#seed=12.5"]) {
		assert(!puzzle.loadURLSeed("https://example.com/" + fragment),
		       "an absent or invalid URL seed was accepted: " + fragment);
		assert(puzzle.seed === undefined && puzzle.pendingSeed === undefined,
		       "an invalid link changed the initial state");
	}
	assert(!puzzle.startGame() && puzzle.seed === undefined,
	       "accepting a nonexistent invitation started a game");
});

Deno.test("copying a puzzle link preserves the game and has a manual fallback", async function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	const oldWindow = globalThis.window;
	const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	const copied = [];
	const prompted = [];
	globalThis.window = {
		location: { href: "https://example.com/logos/index.html?theme=stone#seed=42" },
		prompt(message, value) { prompted.push(value); },
	};
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { async writeText(value) { copied.push(value); } },
	});
	try {
		puzzle.newGame(42);
		puzzle.stopTimer();
		const before = puzzleSignature(puzzle);
		const input = puzzle.options.querySelector("#game-seed");
		const button = puzzle.options.querySelector("#copy-seed-link");
		input.value = " AB ";
		input.listeners.input();
		await puzzle.copySeedLink();
		assert(copied[0] == "https://example.com/logos/index.html?theme=stone#seed=000000ab" &&
		       button.value == "Copied",
		       "copy did not normalize the selected seed or replace the old fragment");
		assert(puzzle.seed == 42 && puzzleSignature(puzzle) == before,
		       "copying a different seed replaced the current puzzle");
		input.value = "0";
		input.listeners.input();
		assert(button.value == "Copy link", "editing retained stale copy feedback");
		window.location.href = "file:///home/player/logos/index.html";
		navigator.clipboard.writeText = async function() { throw new Error("denied"); };
		await puzzle.copySeedLink();
		assert(prompted[0] == "file:///home/player/logos/index.html#seed=00000000",
		       "clipboard failure did not offer the file URL for manual copying");
		for (const value of ["", "xyz"]) {
			input.value = value;
			await puzzle.copySeedLink();
		}
		assert(copied.length == 1 && prompted.length == 1,
		       "copying an invalid seed produced a link");
	} finally {
		puzzle.stopTimer();
		if (oldWindow === undefined)
			delete globalThis.window;
		else
			globalThis.window = oldWindow;
		if (clipboard)
			Object.defineProperty(navigator, "clipboard", clipboard);
		else
			delete navigator.clipboard;
	}
});

Deno.test("the timer appears only after a timed game starts", function() {
	const puzzle = makePuzzle(6);
	assert(puzzle.timer.hidden,
	       "the timer was visible outside a game");
	puzzle.newGame(1);
	assert(!puzzle.timer.hidden && puzzle.timerTimeout !== null,
	       "a timed game did not reveal the timer");
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("the custom cursor is a saved boolean option", function() {
	localStorage.removeItem("customCursor");
	const puzzle = makePuzzle(6);
	assert(String(document.body.dataset.customCursor) == "true" &&
	       puzzle.options.querySelector("#custom-cursor").checked,
	       "the custom cursor was not enabled by default");
	puzzle.setCustomCursor(false);
	assert(String(document.body.dataset.customCursor) == "false" &&
	       !puzzle.options.querySelector("#custom-cursor").checked &&
	       localStorage.getItem("customCursor") == "false",
	       "the custom cursor choice was not applied and saved");
	localStorage.removeItem("customCursor");
	puzzle.stopTimer();
});

Deno.test("control and Tap controls combine to select the discard cursor",
		function() {
	const puzzle = makePuzzle(6);
	document.listeners.keydown({
		key: "Control",
		ctrlKey: true,
	});
	assert(document.body.dataset.discardCursor == "true",
	       "pressing control did not enable the discard cursor");
	selectTileAction(puzzle, "remove");
	puzzle.setShowActionSelector(true);
	document.listeners.keyup({ key: "Control" });
	assert(document.body.dataset.discardCursor == "true",
	       "releasing control cleared the selected discard mode");
	puzzle.setShowActionSelector(false);
	assert(!Object.hasOwn(document.body.dataset, "discardCursor"),
	       "disabling Tap controls did not restore the regular cursor");
	puzzle.setShowActionSelector(true);
	selectTileAction(puzzle, "place");
	puzzle.updateActionCursor();
	assert(!Object.hasOwn(document.body.dataset, "discardCursor"),
	       "selecting choose did not restore the regular cursor");
	document.listeners.keydown({ key: "Control", ctrlKey: true });
	puzzle.setShowActionSelector(false);
	assert(document.body.dataset.discardCursor == "true",
	       "disabling Tap controls cleared held control state");
	document.listeners.keyup({ key: "Control" });
	puzzle.stopTimer();
});

Deno.test("chalk cursors combine modifiers, Tap controls, and blur", function() {
	const oldWindow = globalThis.window;
	globalThis.window = new FakeElement();
	try {
		const puzzle = makePuzzle(6);
		function check(chalk, discard, message) {
			assert((document.body.dataset.chalkCursor == "true") == chalk &&
			       (document.body.dataset.discardCursor == "true") == discard,
			       message);
		}
		puzzle.setShowActionSelector(false);
		document.listeners.keydown({ key: "Shift" });
		check(true, false, "Shift did not enable the chalk cursor");
		document.listeners.keydown({ key: "Alt" });
		document.listeners.keyup({ key: "Shift" });
		check(true, false, "releasing Shift ignored held Alt");
		document.listeners.keydown({ key: "Control" });
		check(true, true, "Control did not preserve chalk mode");
		document.listeners.keyup({ key: "x" });
		check(true, true, "an unrelated key cleared the modifiers");
		document.listeners.keyup({ key: "Alt" });
		check(false, true, "releasing Alt did not preserve discard mode");
		document.listeners.keyup({ key: "Control" });
		check(false, false, "releasing all modifiers did not restore the cursor");
		selectTileAction(puzzle, "pencil-remove");
		puzzle.setShowActionSelector(true);
		document.listeners.keydown({ key: "Shift" });
		document.listeners.keydown({ key: "Control" });
		document.listeners.keyup({ key: "Shift" });
		document.listeners.keyup({ key: "Control" });
		check(true, true, "key releases cleared the tap selection");
		puzzle.setShowActionSelector(false);
		check(false, false, "hidden tap controls still affected the cursor");
		for (const key of ["Control", "Shift", "Alt"])
			document.listeners.keydown({ key });
		window.listeners.blur();
		check(false, false, "blur did not clear held modifiers");
		puzzle.setShowActionSelector(true);
		window.listeners.blur();
		check(true, true, "blur cleared the tap selection");
		selectTileAction(puzzle, "place");
		puzzle.setShowActionSelector(false);
		puzzle.stopTimer();
	} finally {
		if (oldWindow === undefined)
			delete globalThis.window;
		else
			globalThis.window = oldWindow;
	}
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
	function pointerAction(target, options) {
		const event = {
			button: options.button,
			ctrlKey: !!options.ctrlKey,
			altKey: !!options.altKey,
			shiftKey: !!options.shiftKey,
			currentTarget: target,
			preventDefault() {},
		};
		target.listeners.pointerdown(event);
		if (options.button == 2)
			target.listeners.contextmenu(event);
	}

	pointerAction(cell, { button: 0, shiftKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       !puzzle.pencilMarks[0].discard,
	       "shift-click did not add a pencil selection");
	assert(!slot.single && puzzle.losses == 0,
	       "pencil selection made a committed move");
	pointerAction(cell, { button: 2, shiftKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "shift-right-click did not pencil-discard");
	assert(puzzle.losses == 0,
	       "pencil elimination checked the hidden solution");
	pointerAction(cell, { button: 0, altKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       !puzzle.pencilMarks[0].discard,
	       "option-click did not retain pencil selection compatibility");
	pointerAction(cell, { button: 2, altKey: true });
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard,
	       "option-right-click did not retain pencil discard compatibility");

	const wrong = (value + 1) % symbols.length;
	pointerAction(slot.possibilityElems[wrong], {
		button: 0,
		ctrlKey: true,
	});
	assert(!slot.possible[wrong],
	       "control-click was mistaken for a pencil mark");
});

Deno.test("chalk modifiers combine with Tap controls", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const cell = slot.possibilityElems[slot.value];
	const actions = [];
	puzzle.requestTileAction = function(slot, value, action) {
		actions.push(action);
	};
	for (const tapControls of [false, true]) {
		puzzle.showActionSelector = tapControls;
		for (const selected of ["place", "remove", "pencil-select", "pencil-remove"]) {
			selectTileAction(puzzle, selected);
			for (const modifier of [null, "shiftKey", "altKey"]) {
				for (const click of ["left", "right", "control"]) {
					const discard = click != "left" ||
						(tapControls && selected.endsWith("remove"));
					const chalk = modifier ||
						(tapControls && selected.startsWith("pencil-"));
					const expected = chalk ?
						(discard ? "pencil-remove" : "pencil-select") :
						(discard ? "remove" : "place");
					const event = {
						button: click == "right" ? 2 : 0,
						ctrlKey: click == "control",
						shiftKey: modifier == "shiftKey",
						altKey: modifier == "altKey",
						currentTarget: cell,
						preventDefault() {},
					};
					actions.length = 0;
					cell.listeners.pointerdown(event);
					assert(actions.length == 1 && actions[0] == expected,
					       "mouse action did not commit on press");
					if (click != "left")
						cell.listeners.contextmenu(event);
					if (click != "right")
						cell.listeners.click(event);
					assert(actions.length == 1 && actions[0] == expected,
					       `${selected}, ${modifier}, ${click}, taps=${tapControls}, ` +
					       `expected ${expected}, got ${actions}`);
				}
			}
		}
	}
	puzzle.stopTimer();
});

Deno.test("control-tap falls back to the context-menu event", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	const cell = slot.possibilityElems[wrong];
	cell.listeners.contextmenu({
		button: 0,
		ctrlKey: true,
		currentTarget: cell,
		preventDefault() {},
	});
	assert(!slot.possible[wrong],
	       "a control-tap without pointer events did not discard");
	puzzle.stopTimer();
});

Deno.test("Tap controls apply the mark selector to right-click", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	const cell = slot.possibilityElems[wrong];
	function rightClick() {
		cell.listeners.contextmenu({
			currentTarget: cell,
			preventDefault() {},
		});
	}

	puzzle.showActionSelector = true;
	selectTileAction(puzzle, "pencil-select");
	rightClick();
	assert(puzzle.pencilMarks.length == 1 &&
	       puzzle.pencilMarks[0].discard && slot.possible[wrong],
	       "right-click did not use chalk discard");

	selectTileAction(puzzle, "place");
	rightClick();
	assert(!slot.possible[wrong],
	       "right-click did not use declared discard");
	puzzle.stopTimer();
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

	slot.elem.listeners.click({ target: slot.possibleElem });
	assert(!slot.single && puzzle.expandedSlot == slot,
	       "clicking the slot space did not open its expanded tray");
	assert(!puzzle.slotTray.hidden &&
	       puzzle.slotTrayOptions.children.length == symbols.length,
	       "expanded tray did not show all possibilities");
	assert(puzzle.slotTrayOptions.children.every(function(tile, i) {
		return !slot.possible[i] ||
		       tile.attributes["aria-label"] == "Choose " + symbols[i];
	}), "expanded tray did not decorate its Choose action");
	assert(puzzle.slotTrayAction.className.includes("slot-tray-action-place") &&
	       puzzle.slotTrayAction.className.includes(slot.row.familyClass),
	       "expanded tray did not identify its Choose action");
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
	puzzle.applySlotTrayAction(wrong);
	assert(puzzle.expandedSlot == slot && puzzle.losses == 0,
	       "an eliminated tray tile applied an action");
	assert(puzzle.slotTrayOptions.children.every(function(tile, i) {
		return !slot.possible[i] ||
		       tile.attributes["aria-label"] == "Discard " + symbols[i];
	}), "expanded tray did not decorate its Discard action");
	assert(puzzle.slotTrayAction.className.includes("slot-tray-action-remove") &&
	       puzzle.slotTrayAction.className.includes(slot.row.familyClass),
	       "expanded tray did not identify its Discard action");
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
	assert(puzzle.slotTrayAction.className.includes(
		       "slot-tray-action-pencil-select") &&
	       puzzle.slotTrayActionSample.className.includes("pencil-selected"),
	       "expanded tray did not identify its chalk Choose action");
	selectTileAction(puzzle, "pencil-remove");
	puzzle.renderSlotTray();
	assert(puzzle.slotTrayAction.className.includes(
		       "slot-tray-action-pencil-remove") &&
	       puzzle.slotTrayActionSample.className.includes("pencil-removed"),
	       "expanded tray did not identify its chalk Discard action");
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
	assert(puzzle.sounds.length == 1 && puzzle.sounds[0] == "toggle",
	       "group click did not play the toggle sound");
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

Deno.test("shift-press highlights clues with shared symbols", async function() {
	const puzzle = makePuzzle(3);
	function column(top, bottom, column) {
		const clue = new ColumnClue(puzzle);
		clue.tRow = puzzle.rows[top];
		clue.bRow = puzzle.rows[bottom];
		clue.col = column;
		clue.display = new FakeElement();
		clue.active = true;
		return clue;
	}
	const selected = column(0, 1, 0);
	const related = column(0, 2, 0);
	const unrelated = column(1, 2, 1);
	puzzle.clues = [selected, related, unrelated];
	for (const clue of puzzle.clues)
		clue.render();

	let prevented = false;
	selected.display.onpointerdown({
		button: 0,
		shiftKey: true,
		preventDefault() { prevented = true; },
	});
	assert(prevented &&
	       selected.display.classList.contains("clue-highlight-source") &&
	       related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "shift-press did not distinguish related clues");
	selected.display.onpointerup({});
	assert(!selected.display.classList.contains("clue-highlight-source") &&
	       !related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "releasing the pointer did not clear clue highlights");

	selected.display.onclick({ preventDefault() {} });
	assert(selected.active,
	       "the click following a shift-press dismissed the clue");
	selected.display.onclick({ preventDefault() {} });
	assert(!selected.active,
	       "an ordinary click no longer dismissed the clue");
	await new Promise(resolve => setTimeout(resolve, 0));
});

Deno.test("pressing a filled slot highlights its clues", function() {
	const puzzle = makePuzzle(3);
	const slot = puzzle.rows[0].slots[0];
	function column(top, bottom, column) {
		const clue = new ColumnClue(puzzle);
		clue.tRow = puzzle.rows[top];
		clue.bRow = puzzle.rows[bottom];
		clue.col = column;
		clue.display = new FakeElement();
		clue.active = true;
		return clue;
	}
	const related = column(0, 1, 0);
	const unrelated = column(1, 2, 1);
	puzzle.clues = [related, unrelated];
	for (const clue of puzzle.clues)
		clue.render();
	slot.displaySingle();

	slot.singleElem.listeners.pointerdown({ button: 0 });
	assert(slot.singleElem.classList.contains("clue-highlight-source") &&
	       related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "filled slot did not highlight its related clues");
	slot.singleElem.listeners.pointerup({});
	assert(!slot.singleElem.classList.contains("clue-highlight-source") &&
	       !related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "filled-slot highlights survived pointer release");

	slot.displayPossible();
	slot.singleElem.listeners.pointerdown({ button: 0 });
	assert(!related.display.classList.contains("clue-highlight-related"),
	       "an unresolved slot highlighted clues");

	const event = {
		button: 0,
		currentTarget: slot.possibilityElems[slot.value],
	};
	slot.possibilityElems[slot.value].listeners.pointerdown(event);
	assert(slot.single, "the possibility press did not fill its slot");
	assert(!related.display.classList.contains("clue-highlight-related"),
	       "a newly filled slot flashed its clue highlights");
});

Deno.test("dragging a clue inserts it between display slots", async function() {
	const puzzle = makePuzzle(3);
	function column(top, bottom, column) {
		const clue = new ColumnClue(puzzle);
		clue.tRow = puzzle.rows[top];
		clue.bRow = puzzle.rows[bottom];
		clue.col = column;
		clue.display = puzzle.vClueSlots[column];
		clue.active = true;
		return clue;
	}
	const first = column(0, 1, 0);
	const second = column(0, 2, 1);
	const third = column(1, 2, 2);
	puzzle.clues = [first, second, third];
	for (const clue of puzzle.clues)
		clue.render();
	const originalClues = puzzle.clues.slice();
	const sourceSlot = third.display;
	const oldElementFromPoint = document.elementFromPoint;
	document.elementFromPoint = function() { return first.display; };
	const down = {
		button: 0,
		pointerId: 7,
		clientX: 0,
		clientY: 0,
	};
	third.display.onpointerdown(down);
	third.display.onpointermove({
		pointerId: 7,
		clientX: 125,
		clientY: 0,
		preventDefault() {},
	});
	assert(third.display.classList.contains("clue-dragging") &&
	       first.display.classList.contains("clue-drop-target"),
	       "clue drag did not show its source and insertion point");
	third.display.onpointerup({
		pointerId: 7,
		clientX: 125,
		clientY: 0,
		preventDefault() {},
	});
	assert(third.display == puzzle.vClueSlots[0] &&
	       first.display == puzzle.vClueSlots[1] &&
	       second.display == puzzle.vClueSlots[2],
	       "clue was not inserted into its target slot");
	assert(puzzle.clues.every((clue, i) => clue == originalClues[i]),
	       "display rearrangement reordered the logical clue list");
	sourceSlot.onclick({ preventDefault() {} });
	assert(first.active && second.active && third.active,
	       "the click after a drag dismissed a clue");
	document.elementFromPoint = oldElementFromPoint;
	await new Promise(resolve => setTimeout(resolve, 0));
});

Deno.test("wrapped clue insertions mark their target slot", async function() {
	const puzzle = makePuzzle(3);
	function horizontal(column) {
		const clue = new ColumnClue(puzzle);
		clue.displayType = "horizontal";
		clue.display = puzzle.hClueSlots[column];
		clue.active = true;
		return clue;
	}
	const clues = [horizontal(0), horizontal(1), horizontal(2),
		      horizontal(3)];
	puzzle.clues = clues;
	for (const clue of clues)
		clue.render();
	const nextRow = puzzle.hClueSlots[3];
	const oldElementFromPoint = document.elementFromPoint;
	document.elementFromPoint = function() { return nextRow; };
	clues[0].display.onpointerdown({
		button: 0, pointerId: 8, clientX: 100, clientY: 0,
	});
	clues[0].display.onpointermove({
		pointerId: 8, clientX: 5, clientY: 20, preventDefault() {},
	});
	assert(nextRow.classList.contains("clue-drop-target"),
	       "wrapped insertion did not highlight its target slot");
	clues[0].display.onpointercancel({ pointerId: 8 });
	document.elementFromPoint = oldElementFromPoint;
	await new Promise(resolve => setTimeout(resolve, 0));
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

	puzzle.applyTileAction(top, top.value, "place");
	assert(clue.active, "partially exhausted clue was dismissed");
	puzzle.applyTileAction(bottom, bottom.value, "place");
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
	puzzle.applyTileAction(top, top.value, "place");
	puzzle.applyTileAction(bottom, bottom.value, "place");
	assert(clue.active, "disabled automatic dismissal still hid a clue");

	puzzle.setAutoDismissClues(true);
	assert(!clue.active && clue.display.classList.contains("clue-hidden"),
	       "enabling automatic dismissal did not hide an exhausted clue");
	localStorage.removeItem("autoDismissClues");
});

Deno.test("practice mode is saved and suppresses timing and scores", function() {
	localStorage.removeItem("practiceMode");
	let puzzle = makePuzzle(6, true);
	puzzle.setPracticeMode(true);
	puzzle.newGame(1);
	assert(puzzle.practiceMode && !puzzle.scoreEligible &&
	       !puzzle.timer.hidden && puzzle.timer.classList.contains("zen") &&
	       puzzle.timerTimeout === null &&
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
	assert(!puzzle.setPracticeMode(false) && puzzle.practiceMode &&
	       !puzzle.practiceModePreference &&
	       !puzzle.options.querySelector("#practice-mode").checked &&
	       !puzzle.timer.hidden && puzzle.timer.classList.contains("zen") &&
	       puzzle.timerTimeout === null &&
	       puzzle.messages.innerHTML ==
		       "Accepting enlightenment is a one-way door. Your next " +
		       "journey will not be so calm." &&
	       localStorage.getItem("practiceMode") == "false",
	       "an active game was allowed to leave practice mode");
	puzzle.newGame(3);
	assert(!puzzle.practiceMode && !puzzle.practiceModePreference &&
	       !puzzle.options.querySelector("#practice-mode").checked &&
	       !puzzle.timer.hidden && puzzle.timerTimeout !== null &&
	       puzzle.scoreEligible,
	       "a new game did not adopt the pending regular mode");
	puzzle.stopTimer();
	puzzle.say("");
	localStorage.removeItem("practiceMode");
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

Deno.test("help pages use stationary folios and switch through hints", function() {
	const puzzle = makePuzzle(1);
	const rules = puzzle.help.querySelector(".help-page-rules");
	const clues = puzzle.help.querySelector(".help-page-clues");
	const controls = puzzle.help.querySelector(".help-page-controls");
	const cluesPrevious = puzzle.helpFolios[1].querySelector(".help-page-previous");
	const controlsPrevious = puzzle.helpFolios[2].querySelector(".help-page-previous");
	assert(puzzle.help.querySelector(".help-navigation").children.length == 4 &&
	       puzzle.helpPages.every(page => !page.querySelectorAll(".help-folio").length),
	       "folios were not kept outside the scrolling pages");

	puzzle.showHelpPage(0);
	assert(!rules.inert && clues.inert && controls.inert,
	       "rules were not the only visible first page");

	puzzle.turnHelpPage(1);
	assert(rules.inert && !clues.inert && controls.inert,
	       "clues were not the only visible second page");
	assert(cluesPrevious.focused,
	       "page turn did not preserve keyboard focus");

	puzzle.turnHelpPage(1);
	assert(rules.inert && clues.inert && !controls.inert,
	       "controls were not the only visible third page");
	assert(controlsPrevious.focused,
	       "second page turn did not preserve keyboard focus");
	puzzle.turnHelpPage(1);
	const hints = puzzle.help.querySelector(".help-page-hints");
	assert(!hints.inert && controls.inert &&
	       !puzzle.helpFolios[3].hidden && puzzle.helpFolios[2].hidden &&
	       puzzle.helpFolios[3].querySelector(".help-page-number").textContent == "Leaf IV of IV" &&
	       puzzle.helpFolios[2].querySelector(".help-page-next").textContent == "Hints and Proofs ›",
	       "fourth leaf or generated navigation is wrong");
	puzzle.helpFolios[3].querySelector(".help-page-previous").onclick();
	assert(!controls.inert && hints.inert, "generated button did not turn the page");
});

Deno.test("help scrolling keeps page navigation and accessibility in sync", function() {
	const puzzle = makePuzzle(1);
	puzzle.help.hidden = false;
	const viewport = puzzle.helpViewport;
	viewport.clientWidth = 400;
	puzzle.showHelpPage(0);
	viewport.scrollLeft = 790;
	viewport.listeners.scroll();
	assert(puzzle.helpPage == 2 && viewport.scrollLeft == 790,
	       "scrolling did not select the nearest leaf without moving it");
	for (const [index, page] of puzzle.helpPages.entries()) {
		assert(page.inert == (index != 2) &&
		       page.attributes["aria-hidden"] == String(index != 2),
		       "offscreen pages remained accessible");
	}
	puzzle.turnHelpPage(-1);
	assert(puzzle.helpPage == 1 && viewport.scrollLeft == 400,
	       "button navigation did not follow the swiped page");
	viewport.clientWidth = 0;
	viewport.listeners.scroll();
	assert(puzzle.helpPage == 1, "a collapsed viewport lost the current page");
});

Deno.test("arrow keys navigate help without escaping the visible dialog", function() {
	const puzzle = makePuzzle(1);
	puzzle.help.hidden = false;
	puzzle.paused = true;
	document.modals = [puzzle.help];
	let prevented = 0;
	const press = (key, extra = {}) => document.listeners.keydown({
		key, preventDefault() { prevented++; }, ...extra,
	});
	try {
		press("ArrowLeft");
		assert(puzzle.helpPage == 0, "left arrow escaped the first leaf");
		press("ArrowRight");
		assert(puzzle.helpPage == 1 &&
		       puzzle.helpViewport.focused,
		       "right arrow did not turn the leaf and move focus");
		press("ArrowLeft");
		assert(puzzle.helpPage == 0, "left arrow did not turn back");
		for (const modifier of ["shiftKey", "ctrlKey", "altKey", "metaKey"])
			press("ArrowRight", { [modifier]: true });
		for (const target of [
			{ tagName: "INPUT", type: "text" },
			{ tagName: "SELECT" }, { tagName: "TEXTAREA" },
			{ isContentEditable: true },
		])
			press("ArrowRight", { target });
		assert(puzzle.helpPage == 0 && prevented == 3,
		       "navigation consumed a modified key or an editing key");
		puzzle.showHelpPage(puzzle.helpPages.length - 1);
		press("ArrowRight");
		assert(puzzle.helpPage == puzzle.helpPages.length - 1,
		       "right arrow escaped the last leaf");
		puzzle.about.hidden = false;
		document.modals.push(puzzle.about);
		puzzle.proof = {};
		puzzle.paused = false;
		puzzle.moveProof = () => { throw new Error("moved a covered proof"); };
		press("ArrowLeft");
		assert(puzzle.helpPage == puzzle.helpPages.length - 1 && prevented == 4,
		       "another dialog allowed navigation of the help behind it");
	} finally {
		document.modals = [];
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

Deno.test("placed tiles skid from their small tiles", function() {
	const puzzle = makePuzzle(1);
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
	       "skid animation did not start at its possibility");
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

Deno.test("sound volume is saved independently of the sound toggle", function() {
	const saved = { ...localStorage.values };
	try {
		localStorage.removeItem("soundVolume");
		const puzzle = makePuzzle(1);
		const slider = puzzle.options.querySelector("#sound-volume");
		assert(puzzle.soundVolume == 1 && slider.value == 100,
		       "default volume changed existing sound levels");
		puzzle.setSoundVolume(0.4);
		puzzle.playMediaSampleSound("discard", 1);
		assert(puzzle.soundSamples.discard.volume == 0.55 * 0.4,
		       "media playback ignored the volume setting");
		puzzle.setSoundEffects(false);
		assert(slider.disabled && puzzle.soundSamples.discard.muted,
		       "turning sound off did not disable the slider and mute playback");
		const reloaded = makePuzzle(1);
		assert(reloaded.soundVolume == 0.4 && !reloaded.soundEffects,
		       "reloading did not retain the volume while muted");
		reloaded.setSoundEffects(true);
		assert(!reloaded.options.querySelector("#sound-volume").disabled &&
		       !reloaded.soundSamples.discard.muted && reloaded.soundVolume == 0.4,
		       "enabling sound did not retain its volume");
		puzzle.setSoundVolume(0);
		assert(puzzle.soundSamples.discard.volume == 0 &&
		       slider.attributes["aria-valuetext"] == "0%",
		       "zero volume did not silence an existing media sample");
		puzzle.setSoundVolume(2);
		assert(puzzle.soundVolume == 1, "volume exceeded the media range");
		localStorage.setItem("soundVolume", "invalid");
		assert(makePuzzle(1).soundVolume == 1, "invalid saved volume was not ignored");
	} finally {
		localStorage.values = saved;
	}
});

Deno.test("samples and chimes share a live volume control", function() {
	const saved = { ...localStorage.values };
	const elem = () => new FakeElement();
	const puzzle = new Puzzle(elem(), elem(), elem(), elem(), elem(), [symbols],
		elem(), elem(), elem(), elem(), elem(), elem(), elem(), elem());
	const outputs = [];
	puzzle.audioContext = {
		state: "running", currentTime: 0, destination: {},
		createGain() {
			return {
				gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
				connect(node) { outputs.push(node); return node; },
			};
		},
		createBufferSource() {
			return { playbackRate: {}, connect(node) { return node; }, start() {}, stop() {} };
		},
		createOscillator() {
			return { frequency: {}, connect(node) { return node; }, start() {}, stop() {} };
		},
	};
	try {
		puzzle.setSoundEffects(true);
		puzzle.setSoundVolume(0.4);
		puzzle.soundBuffers.discard = {};
		puzzle.playSound("discard");
		const master = puzzle.soundGain;
		assert(master.gain.value == 0.4 && outputs[0] == puzzle.audioContext.destination &&
		       outputs[1] == master, "sample playback bypassed the master volume");
		for (const type of ["win", "practice-mistake"]) {
			outputs.length = 0;
			puzzle.playSound(type);
			assert(outputs.length > 0 && outputs.every(node => node == master),
			       "synthesized chimes bypassed the master volume");
		}
		puzzle.setSoundVolume(0.2);
		assert(master.gain.value == 0.2, "volume did not update existing audio routing");
		puzzle.setSoundEffects(false);
		assert(master.gain.value == 0, "muting left Web Audio sounds audible");
		puzzle.setSoundEffects(true);
		assert(master.gain.value == 0.2, "unmuting did not restore the saved level");
	} finally {
		localStorage.values = saved;
	}
});

Deno.test("sample variation uses Web Audio resampling", function() {
	const puzzle = makePuzzle(1);
	const sources = [];
	const gains = [];
	puzzle.audioContext = {
		state: "running",
		destination: {},
		createBufferSource() {
			const source = {
				playbackRate: {},
				connect(node) { return node; },
				start() { this.started = true; },
				stop() { this.stopped = true; },
			};
			sources.push(source);
			return source;
		},
		createGain() {
			const gain = {
				gain: {},
				connect(node) { return node; },
			};
			gains.push(gain);
			return gain;
		},
	};
	puzzle.soundBuffers.discard = {};

	puzzle.playSampleSound("discard");
	puzzle.playSampleSound("discard");

	assert(sources.length == 2 && sources[0].started &&
	       sources[0].playbackRate.value == 1 &&
	       sources[1].playbackRate.value == 1.0833,
	       "discard variation did not use buffer source playback rates");
	assert(sources[0].stopped,
	       "a previous buffer source continued playing");
	assert(gains[0].gain.value == 0.55,
	       "buffer playback did not apply the sample volume");
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

/* UI tests use committed snapshots; the browser storage tests exercise the
 * actual IndexedDB transactions and legacy migration.
 */
async function withRunHistory(callback, initial) {
	const runs = structuredClone(initial || []);
	let nextId = 1;
	for (const run of runs)
		run.id = nextId++;
	let reads = 0;
	Logos.setHistoryStorage(async function(run, includeRuns, level = "all") {
		reads++;
		if (run) {
			run.id = nextId++;
			runs.push(structuredClone(run));
		}
		const wins = runs.filter(run => run.outcome == "won")
			.sort((a, b) => a.elapsed - b.elapsed || a.id - b.id);
		return {
			runs: structuredClone(runs),
			unratedRuns: structuredClone(wins.filter(run => !Logos.hasRunDifficulty(run))),
			highScores: structuredClone(wins.filter(run => level == "all" ||
				Logos.hasRunDifficulty(run) && run.difficulty.level == level).slice(0, 10)),
			gameStats: {
				won: runs.filter(run => run.outcome == "won").length,
				lost: runs.filter(run => run.outcome == "lost").length,
			},
		};
	});
	try {
		await callback(runs, () => reads);
	} finally {
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
}

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
		assert(link.href == "#seed=1234abcd" && link.target == "_blank",
		       "Chronicle seed did not link to a new puzzle tab");
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
		assert(puzzle.highlightedScore === null,
		       "a removed score retained its highlight");
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

Deno.test("continued losses record only the first mistake", async function() {
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
		puzzle.checkWin();
		assert(runs.length == 1 && runs[0].outcome == "lost" &&
		       runs[0].elapsed == 700 && puzzle.gameStats.lost == 1,
		       "continued play recorded more than the initial loss");
		puzzle.renderHighScores();
		assert(puzzle.scores.querySelector(".games-won").textContent == 0,
		       "loss counted as a win");
	});
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
		assert(puzzle.scores.querySelector(".modal-close").value == "Exitus",
		       "history did not label its close button");
		await puzzle.toggleScores();
		assert(puzzle.scores.hidden, "closing the Chronicle did not dismiss the modal");
		await puzzle.toggleScores();
		assert(puzzle.scores.querySelector(".history-view").hidden &&
		       puzzle.scores.querySelector(".modal-close").value == "Rejoin the mortal realm",
		       "reopening did not return to the Pantheon");
		puzzle.resumeAfterModal = true;
		await puzzle.showRunHistory();
		assert(puzzle.scores.querySelector(".modal-close").value == "Exitus",
		       "Chronicle did not retain its compact close label during play");
		puzzle.scores.listeners.click({ target: puzzle.scores });
		assert(puzzle.scores.hidden, "outside click did not dismiss the Chronicle");
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
			assert(puzzle.pantheonScrollTarget === null, "arrival retained the pending scroll");
			await puzzle.selectPantheon("all");
			viewport.listeners.wheel();
			viewport.scrollLeft = 400;
			await viewport.listeners.scroll();
			assert(puzzle.pantheonLevel == "easy", "direct scrolling did not take over");
			globalThis.matchMedia = () => ({ matches: true });
			await puzzle.selectPantheon("hard");
			assert(scrolls.at(-1).behavior == "instant", "reduced motion used smooth scrolling");
		} finally {
			document.modals = [];
			delete globalThis.matchMedia;
		}
	}, []);
});

Deno.test("Help page turns retarget an ongoing smooth scroll", function() {
	const puzzle = makePuzzle(1);
	puzzle.help.hidden = false;
	const viewport = puzzle.helpViewport;
	viewport.clientWidth = 400;
	const scrolls = [];
	viewport.scrollTo = options => scrolls.push(options);
	globalThis.matchMedia = () => ({ matches: false });
	try {
		puzzle.showHelpPage(0);
		puzzle.turnHelpPage(1);
		assert(puzzle.helpPage == 1 && scrolls[0].behavior == "smooth",
		       "single help turn did not animate");
		viewport.scrollLeft = 100;
		viewport.listeners.scroll();
		assert(puzzle.helpPage == 1, "animation replaced the intended help page");
		puzzle.turnHelpPage(1);
		assert(puzzle.helpPage == 2 && viewport.scrollLeft == 100 &&
		       puzzle.helpScrollTarget == 800 && scrolls.length == 2 &&
		       scrolls[1].left == 800 && scrolls[1].behavior == "smooth",
		       "second help turn did not retarget the animation");
		viewport.listeners.scroll();
		assert(puzzle.helpPage == 2, "intermediate scrolling replaced the destination");
		puzzle.turnHelpPage(-1);
		assert(puzzle.helpPage == 1 && scrolls[2].left == 400 &&
		       scrolls[2].behavior == "smooth", "reverse turn did not retarget smoothly");
		viewport.scrollLeft = 400;
		viewport.listeners.scroll();
		assert(puzzle.helpScrollTarget === null, "arrival retained the pending destination");
		globalThis.matchMedia = () => ({ matches: true });
		puzzle.turnHelpPage(-1);
		assert(viewport.scrollLeft == 0 && scrolls.length == 3,
		       "reduced motion animated a help turn");
	} finally {
		delete globalThis.matchMedia;
	}
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

Deno.test("initializing options does not write stale preferences", function() {
	const setItem = localStorage.setItem;
	const writes = [];
	localStorage.setItem = function(key, value) { writes.push([key, value]); };
	try {
		const puzzle = makePuzzle(1);
		assert(writes.length == 0, "initializing options wrote to storage");
		puzzle.setCustomCursor(false);
		puzzle.setSoundEffects(true);
		assert(JSON.stringify(writes) ==
		       JSON.stringify([["customCursor", false], ["soundEffects", true]]),
		       "changing options did not write only the changed preferences");
	} finally {
		localStorage.setItem = setItem;
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

Deno.test("Escape dismisses transient interfaces", function() {
	const puzzle = makePuzzle(1);
	const keydown = document.listeners.keydown;
	let prevented = 0;
	puzzle.slotTray.hidden = false;
	keydown({
		key: "Escape",
		preventDefault() { prevented++; },
	});
	assert(puzzle.slotTray.hidden && prevented == 1,
	       "Escape did not close the expanded tile tray");

	const modal = new FakeElement();
	modal.hidden = false;
	const close = modal.querySelector(".modal-close");
	close.click = function() { modal.hidden = true; };
	document.modals = [modal];
	keydown({
		key: "Escape",
		preventDefault() { prevented++; },
	});
	document.modals = [];
	assert(modal.hidden && prevented == 2,
	       "Escape did not use the visible modal's close action");
});

Deno.test("timer pause survives dialogs and page visibility without charging paused time", function() {
	const puzzle = makePuzzle(6);
	puzzle.say = function() {};
	const now = Date.now;
	let time = 10000;
	Date.now = () => time;
	try {
		puzzle.newGame(42);
		time += 3000;
		puzzle.togglePause();
		assert(puzzle.manualPaused && puzzle.paused && puzzle.timerTimeout === null &&
		       puzzle.timerElapsed == 3000 && puzzle.hClues.inert && puzzle.vClues.inert &&
		       document.body.classList.contains("game-paused"), "pause did not freeze play");
		puzzle.options.hidden = true;
		puzzle.toggleOptions();
		puzzle.toggleOptions();
		puzzle.setPageHidden(true);
		time += 60000;
		puzzle.setPageHidden(false);
		assert(puzzle.paused && puzzle.timerTimeout === null,
		       "a dialog or visibility change resumed an explicit pause");
		puzzle.togglePause();
		assert(!puzzle.paused && !puzzle.hClues.inert && !puzzle.vClues.inert &&
		       puzzle.timerTimeout !== null && !document.body.classList.contains("game-paused"),
		       "resume did not restore play");
		time += 2000;
		puzzle.stopTimer();
		assert(puzzle.timerElapsed == 5000, "paused time counted toward elapsed time");
		puzzle.togglePause();
		puzzle.newGame(43);
		assert(!puzzle.manualPaused && !puzzle.paused && !puzzle.hClues.inert,
		       "a new game retained the pause");
		puzzle.setPracticeMode(true);
		puzzle.togglePause();
		assert(!puzzle.manualPaused && puzzle.timer.disabled, "Zen mode enabled timer pause");
		puzzle.clear();
		puzzle.togglePause();
		assert(!puzzle.manualPaused && puzzle.timer.disabled, "an inactive game could be paused");
	} finally {
		puzzle.stopTimer();
		Date.now = now;
		localStorage.removeItem("practiceMode");
	}
});

Deno.test("page visibility pauses and resumes active play", function() {
	const puzzle = makePuzzle(1);
	let stoppedSounds = 0;
	puzzle.stopSampleSounds = function() { stoppedSounds++; };
	puzzle.startTimer();
	document.hidden = true;
	document.listeners.visibilitychange();
	assert(puzzle.pageHidden && puzzle.paused &&
	       puzzle.timerTimeout === null && stoppedSounds == 1,
	       "hiding the page did not pause active play");
	document.hidden = false;
	document.listeners.visibilitychange();
	assert(!puzzle.pageHidden && !puzzle.paused &&
	       puzzle.timerTimeout !== null,
	       "showing the page did not resume active play");
	puzzle.stopTimer();

	puzzle.paused = true;
	document.hidden = true;
	document.listeners.visibilitychange();
	document.hidden = false;
	document.listeners.visibilitychange();
	assert(puzzle.paused && puzzle.timerTimeout === null,
	       "showing the page resumed play behind a modal");
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

Deno.test("a loss can continue as a Zen game", function() {
	localStorage.removeItem("continueAfterLoss");
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.setContinueAfterLoss(true);
	puzzle.newGame("9ed0fb2b");
	const slot = puzzle.rows[1].slots[4];
	slot.discard(4);
	assert(!puzzle.gameOver && puzzle.practiceMode &&
	       !puzzle.practiceModePreference && !puzzle.scoreEligible &&
	       !puzzle.timer.hidden && puzzle.timerTimeout === null &&
	       !puzzle.timer.classList.contains("zen") &&
	       puzzle.timer.classList.contains("lost") &&
	       puzzle.pendingProof && puzzle.pendingProof.continueGame &&
	       slot.possibleElem.className != "solution" &&
	       slot.possibilityElems[4].classList.contains("failed-action") &&
	       localStorage.getItem("continueAfterLoss") == "true",
	       "a continued loss did not retain a live Zen game");
	assert(puzzle.sounds.length == 1 && puzzle.sounds[0] == "mistake",
	       "a continued loss did not use the normal loss sound");
	puzzle.explainLoss();
	assert(puzzle.proof && puzzle.proof.continueGame,
	       "a continued loss did not open a continuable proof");
	puzzle.explainLoss();
	assert(!puzzle.proof && !puzzle.gameOver && !slot.single &&
	       slot.possibilityElems[4].classList.contains("failed-action"),
	       "closing the continued proof did not restore the board");
	const other = puzzle.rows[0].slots[0];
	other.discard((other.value + 1) % other.possible.length);
	assert(!puzzle.pendingProof && !puzzle.practiceMistake &&
	       !slot.possibilityElems[4].classList.contains("failed-action"),
	       "another tile action did not clear the continued loss marker");
	localStorage.removeItem("continueAfterLoss");
	localStorage.removeItem("practiceMode");
});

export { Logos, makePuzzle };

Deno.test("puzzle difficulty rates generated puzzles without changing play state", () => {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.startTimer = function() {};
	for (const [seed, level] of [[0x98079244, "easy"],
		[0xc549b7c4, "medium"], [0xe2a689dd, "hard"],
		[0x0e9f4c26, "easy"], [0x4e233909, "hard"],
		[0x0a568040, "easy"], [0xb91f28c7, "medium"]]) {
		puzzle.newGame(seed);
		const before = puzzleSignature(puzzle);
		const rating = Logos.puzzleDifficulty(puzzle);
		assert(rating.level == level);
		assert(puzzleSignature(puzzle) == before);
		// Rating describes the puzzle, not the remaining work on the board.
		const slot = puzzle.rows[0].slots[0];
		slot.choose(slot.value);
		const progressed = puzzleSignature(puzzle);
		assert(JSON.stringify(Logos.puzzleDifficulty(puzzle)) == JSON.stringify(rating));
		assert(puzzleSignature(puzzle) == progressed);
	}
});

Deno.test("placement-first composite uses score boundaries without rounding", () => {
	for (const [excessDiscards, scarcity, score, level] of [
		[0, 0, 0, "easy"], [46.99, 0, 46.99, "easy"],
		[12, 7, 47, "medium"], [0, 10, 50, "medium"],
		[69.99, 0, 69.99, "medium"], [20, 10, 70, "hard"],
		[50, 30, 200, "hard"],
	]) {
		const rating = Logos.difficultyRating({excessDiscards, scarcity});
		assert(rating.score == score && rating.level == level);
	}
});

Deno.test("opportunities include full candidate reductions and placements", () => {
	const opportunities = Logos.difficultyOpportunities;
	const puzzle = makePuzzle(2);
	const clue = new Logos.ColumnClue(puzzle);
	puzzle.clues = [clue];
	const r = puzzle.rows.indexOf(clue.tRow);
	const other = puzzle.rows.indexOf(clue.bRow);
	const a = clue.tRow.slots[clue.col].value;
	const b = clue.bRow.slots[clue.col].value;
	const domains = [Array(6).fill(63), Array(6).fill(63)];
	domains[r][a] = 3;
	let moves = opportunities(puzzle, domains);
	assert(moves.length == 1);
	assert(moves[0].row == other && moves[0].symbol == b);
	assert(moves[0].after == 3 && !moves[0].placement);
	domains[r][a] = 1;
	moves = opportunities(puzzle, domains);
	assert(moves.length == 1 && moves[0].placement);
	assert(moves[0].after == 1);
});

Deno.test("seed reconstruction matches gameplay without changing the active puzzle", () => {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.startTimer = function() {};
	for (const seed of [0, 0xffffffff, 0x98079244, 0xe2a689dd]) {
		puzzle.newGame(seed);
		const before = puzzleSignature(puzzle);
		const reconstructed = Logos.puzzleFromSeed(seed);
		const signature = model => {
			const result = JSON.parse(puzzleSignature(model));
			for (const clue of result.clues) delete clue.rendered;
			return JSON.stringify(result);
		};
		assert(signature(puzzle) == signature(reconstructed), "seed reconstruction differs");
		assert(JSON.stringify(Logos.puzzleDifficulty(puzzle)) ==
		       JSON.stringify(Logos.puzzleDifficulty(reconstructed)));
		assert(before == puzzleSignature(puzzle), "reconstruction changed the active board");
	}
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
		await puzzle.recordOutcome("won");
		assert(!puzzle.scores.hidden && puzzle.pantheonLevel == "hard");
		assert(puzzle.highScores.length == 1 && puzzle.highlightedScore.seed == 0xe2a689dd);
		assert(puzzle.pantheonTablets[puzzle.pantheonLevel].querySelector("ol").children.at(-1).className == "score-new");
		await puzzle.selectPantheon("all");
		assert(puzzle.highScores.length == 10 && !puzzle.highScores.some(run => run.seed == 0xe2a689dd));
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
	assert(puzzle.analysis.querySelector(".analysis-deductions").children.length <= 3 &&
	       puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Difficulty: easy") &&
	       puzzle.analysis.querySelector(".analysis-summary").textContent.includes("Cutoffs: Easy < 47; Medium < 70;"),
	       "analysis is missing its rating or has unbounded deductions");
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

function feedbackPuzzle(seed = "02b839f1", sample = true) {
	localStorage.removeItem("difficultyFeedbackDisabled");
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.say = function() {};
	puzzle.newGame(seed);
	puzzle.stopTimer();
	puzzle.feedbackEndpoint = "https://feedback.example.test/api/feedback";
	if (sample) {
		const finish = puzzle.finishDifficultyFeedback;
		puzzle.finishDifficultyFeedback = function(...args) {
			// Sampling happens before the first await; restore the global immediately.
			const random = Math.random;
			Math.random = () => 0;
			try { return finish.apply(this, args); }
			finally { Math.random = random; }
		};
	}
	puzzle.scores.hidden = true;
	document.modals = [puzzle.scores, puzzle.feedback];
	return puzzle;
}

Deno.test("feedback waits for the Pantheon after a scored win", async () => {
	await withRunHistory(async () => {
		const puzzle = feedbackPuzzle();
		try {
			for (const row of puzzle.rows)
				for (const slot of row.slots) slot.single = true;
			await puzzle.checkWin();
			assert(!puzzle.scores.hidden && puzzle.feedback.hidden);
			assert(!Object.hasOwn(puzzle.feedbackRequest.data, "oldLevel") &&
			       puzzle.feedbackRequest.data.newLevel == "hard" &&
			       puzzle.feedbackRequest.data.ratingVersion == "placement-composite-2");
			await puzzle.toggleScores();
			assert(!puzzle.feedback.hidden && puzzle.paused);
			puzzle.dismissDifficultyFeedback();
			assert(puzzle.feedback.hidden && !puzzle.paused);
		} finally { document.modals = []; }
	});
});

Deno.test("feedback skips disabled endpoints, opt-out, and stale games", async () => {
	const puzzle = feedbackPuzzle();
	try {
		puzzle.feedbackEndpoint = "";
		await puzzle.finishDifficultyFeedback("won", null);
		assert(!puzzle.feedbackRequest);
		puzzle.feedbackEndpoint = "https://feedback.example.test/api/feedback";
		puzzle.feedbackDisabled = true;
		await puzzle.finishDifficultyFeedback("won", null);
		assert(!puzzle.feedbackRequest);
		puzzle.feedbackDisabled = false;
		let release;
		const waiting = puzzle.finishDifficultyFeedback("won", new Promise(r => release = r));
		puzzle.maybeShowDifficultyFeedback();
		assert(puzzle.feedback.hidden, "feedback interrupted a pending score save");
		puzzle.newGame("98079244"); puzzle.stopTimer();
		release(); await waiting;
		assert(!puzzle.feedbackRequest && puzzle.feedback.hidden);
	} finally { document.modals = []; }
});

Deno.test("feedback covers losses and defers continuing games until completion", async () => {
	const puzzle = feedbackPuzzle();
	puzzle.recordOutcome = async function() {};
	try {
		puzzle.lose("A mistake");
		await Promise.resolve();
		assert(!puzzle.feedback.hidden && puzzle.feedbackRequest.data.outcome == "lost");
		puzzle.dismissDifficultyFeedback();
		puzzle.newGame("02b839f1"); puzzle.stopTimer();
		puzzle.feedbackCooldown = 0; // Test the continuing path independently.
		puzzle.continueAfterLoss = true;
		puzzle.lose("A mistake");
		await Promise.resolve();
		assert(!puzzle.feedbackRequest && puzzle.feedback.hidden);
		assert(puzzle.continuedFromLoss && puzzle.practiceMode);
		puzzle.usedHints = true;
		for (const row of puzzle.rows)
			for (const slot of row.slots) slot.single = true;
		await puzzle.checkWin();
		assert(!puzzle.feedback.hidden);
		const data = puzzle.feedbackRequest.data;
		assert(data.outcome == "won" && data.continuedAfterLoss && data.hintsUsed && data.zenMode);
		puzzle.dismissDifficultyFeedback();
		puzzle.newGame("02b839f1"); puzzle.stopTimer();
		assert(!puzzle.usedHints && !puzzle.continuedFromLoss);
	} finally { document.modals = []; }
});

Deno.test("feedback retries one report, remembers identity and name, and thanks the player", async () => {
	const receiver = (await import("../server/worker.js")).default;
	const puzzle = feedbackPuzzle();
	const originalFetch = globalThis.fetch;
	const reports = [];
	puzzle.feedbackDismissals = 2;
	let message;
	puzzle.say = text => message = text;
	globalThis.fetch = async (url, options) => {
		assert(url == puzzle.feedbackEndpoint && options.credentials == "omit");
		reports.push(JSON.parse(options.body));
		if (reports.length == 1)
			return new Response("", {status: 503});
		return receiver.fetch(new Request(url, {method: "POST", headers: options.headers,
			body: options.body}), {DB: {prepare() { return {bind() {
			return {async run() {}};
		}}; }}});
	};
	try {
		await puzzle.finishDifficultyFeedback("won", null);
		puzzle.feedback.querySelector(".feedback-name").value = "  Peff  ";
		await puzzle.sendDifficultyFeedback("about-right");
		assert(puzzle.feedback.querySelector(".feedback-status").textContent.includes("couldn’t"));
		assert(!puzzle.feedback.querySelector(".feedback-retry").hidden);
		await puzzle.sendDifficultyFeedback();
		assert(reports.length == 2 && JSON.stringify(reports[0]) == JSON.stringify(reports[1]));
		assert(reports[0].playerName == "Peff" && reports[0].senderId != reports[0].id);
		assert(message.includes("Thank you"));
		assert(puzzle.feedback.hidden && !puzzle.feedbackRequest && !puzzle.paused,
		       "successful submission did not dismiss feedback");
		assert(puzzle.feedbackDismissals == 0 && puzzle.feedbackCooldown == 2,
		       "successful submission did not reset backoff");
		await puzzle.sendDifficultyFeedback();
		assert(reports.length == 2);
		puzzle.dismissDifficultyFeedback(true);
		assert(puzzle.feedbackDismissals == 0 && puzzle.feedbackCooldown == 2,
		       "closing completed feedback was treated as a dismissal");
		const next = makePuzzle(6);
		assert(next.feedbackDisabled && next.feedbackName == "Peff" &&
		       next.feedbackSenderId == reports[0].senderId);
	} finally {
		globalThis.fetch = originalFetch;
		document.modals = [];
		for (const key of ["Disabled", "Name", "SenderId"])
			localStorage.removeItem("difficultyFeedback" + key);
	}
});

Deno.test("dismissing an in-flight report prevents a late response changing the UI", async () => {
	const puzzle = feedbackPuzzle();
	const originalFetch = globalThis.fetch;
	let release;
	globalThis.fetch = () => new Promise(r => release = r);
	try {
		await puzzle.finishDifficultyFeedback("lost", null);
		const sending = puzzle.sendDifficultyFeedback("unsure");
		puzzle.dismissDifficultyFeedback();
		release(new Response('{"ok":true}')); await sending;
		assert(puzzle.feedback.hidden && !puzzle.feedbackRequest);
	} finally {
		globalThis.fetch = originalFetch;
		document.modals = [];
		for (const key of ["Disabled", "Name", "SenderId"])
			localStorage.removeItem("difficultyFeedback" + key);
	}
});

Deno.test("feedback samples all games and backs off after dismissals", async () => {
	const puzzle = feedbackPuzzle(undefined, false);
	const random = Math.random;
	try {
		Math.random = () => 0.2;
		await puzzle.finishDifficultyFeedback("won", null);
		assert(!puzzle.feedbackRequest, "game outside the sample prompted");
		Math.random = () => 0.199;
		await puzzle.finishDifficultyFeedback("won", null);
		assert(!puzzle.feedback.hidden, "sampled game did not prompt");
		Math.random = () => 0;
		for (const gap of [5, 10, 20, 20]) {
			puzzle.dismissDifficultyFeedback();
			assert(puzzle.feedbackCooldown == gap, "dismissal did not increase the gap");
			puzzle.dismissDifficultyFeedback();
			assert(puzzle.feedbackCooldown == gap, "duplicate dismissal increased the gap");
			for (let i = 0; i < gap; i++) {
				puzzle.newGame("02b839f1"); puzzle.stopTimer();
				await puzzle.finishDifficultyFeedback(i % 2 ? "won" : "lost", null);
				assert(!puzzle.feedbackRequest && puzzle.feedback.hidden,
				       "sampled game ignored the cooldown");
			}
			puzzle.newGame("02b839f1"); puzzle.stopTimer();
			await puzzle.finishDifficultyFeedback("won", null);
			assert(!puzzle.feedback.hidden, "cooldown lasted too long");
		}
		const next = feedbackPuzzle();
		assert(next.feedbackCooldown == 0 && next.feedbackDismissals == 0,
		       "backoff survived a new page instance");
	} finally {
		Math.random = random;
		document.modals = [];
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

Deno.test("excess discards accumulate across stretches after each allowance", () => {
	for (const [seed, excess, level] of [
		["e36efbeb", 17.7, "medium"],
		["eeaf9adc", 13.5, "medium"],
		["18530f24", 0.1, "easy"],
		["67d6cd2b", 0, "easy"],
	]) {
		const metrics = Logos.measureDifficulty(Logos.puzzleFromSeed(parseInt(seed, 16)));
		assert(metrics.excessDiscards == excess,
		       "excess discards differ from independently recorded route stretches");
		assert(Logos.difficultyRating(metrics).level == level);
	}
});

Deno.test("difficulty prioritizes placements and row cascades", () => {
	const domains = [[15, 3, 6, 12], [15, 15, 15, 15]];
	const placements = [0, 0];
	const before = JSON.stringify({domains, placements});
	const discard = {row: 1, symbol: 1, after: 7, placement: false};
	const place = {row: 1, symbol: 0, after: 1, placement: true};
	const cascade = {row: 0, symbol: 0, after: 12, placement: false};
	assert(Logos.placementDifficultyChoices(domains, placements, [discard, place])[0] === place);
	assert(Logos.placementDifficultyChoices(domains, placements, [place, cascade])[0] === cascade);
	const otherDiscard = {...discard, symbol: 2};
	assert(Logos.placementDifficultyChoices(domains, placements, [discard, otherDiscard]).length === 2);
	assert(JSON.stringify({domains, placements}) === before, "lookahead mutated the board");
});

Deno.test("full difficulty observations do not truncate candidate reductions to anchored ones", () => {
	const puzzle = {clues: [{constrain(d) { d[0][0] &= d[0][1] === 3 ? 1 : 3; }}]};
	const domains = [[15, 3, 15, 15]];
	assert(Logos.difficultyOpportunities(puzzle, domains)[0].after === 1);
});
