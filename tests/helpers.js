/* Shared fixtures only: importing these must not register tests. Each test
 * module gets its own fake DOM and application globals. */
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
	append(...children) {
		this.children.push(...children);
	}
	insertBefore(child, before) {
		this.children.splice(this.children.indexOf(before), 0, child);
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
	showModal() { this.open = true; }
	close() { this.open = false; }

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
	"\n;({ countBits, traceExtremeDifficulty, measureExtremeDifficulty, extremeSkulls, countSolutions, cluesSolve, cluesAllow, buildChalkLemma, bestChalkLemma, chalkContradiction, chalkClueContradiction, extremeExplorationTrials, extremeClueIndices, puzzleDifficulty, difficultyRating, puzzleFromSeed, " +
	"difficultyOpportunities, placementDifficultyChoices, nextHintStep, buildHintSteps, measureDifficulty, hasRunDifficulty, " +
	"Puzzle: Puzzle, ExactClue: ExactClue, " +
	"Adjacent2Clue: Adjacent2Clue, " +
	"Adjacent3Clue: Adjacent3Clue, " +
	"ColumnClue: ColumnClue, " +
	"OrderClue: OrderClue, " +
	"defaultSymbols: defaultSymbols, accessRunHistory: accessRunHistory, " +
	"renderProofMessage, symbolsForDate, clueSlots, " +
	"setHistoryStorage: storage => { accessRunHistory = storage; }, " +
	"setDebugDateActive: active => { debugDateActive = active; }, " +
	"adjacent3DeductionMessage: adjacent3DeductionMessage, " +
	"clueProofStep: clueProofStep, " +
	"refreshProofStep, proofStepSupported, buildProofSteps, buildProofRoute, " +
	"lemmaProofDeductions, replayLemmaProof, pruneLemmaProof, domainsFromSlots, proofPlacementsFromSlots, " +
	"orderDeductionMessage: orderDeductionMessage, " +
	"proofMessageText: proofMessageText, " +
	"practiceMistakeMessage: practiceMistakeMessage, " +
	"proofDeductionMessage: proofDeductionMessage, " +
	"proofDeductionCatalog, " +
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
	/* The fake DOM reuses these inputs across games and tests. */
	selectTileAction(puzzle, "place");
	/* Hand-built boards need not be solvable or have a reproducible seed.
	 * Only generated games exercise the real rating and record creation.
	 */
	const runRecord = puzzle.runRecord;
	puzzle.runRecord = function(outcome) {
		if (this.seed !== undefined && this.rows.length === 6 && this.rows[0].slots.length === 6)
			return runRecord.call(this, outcome);
		return { date: Date.now(), seed: this.seed, outcome, rows: this.rows.length,
			columns: this.rows[0].slots.length, generatorVersion: 1,
			...(this.daily ? { daily: this.daily } : {}),
			...(this.scoreEligible ? { elapsed: this.timerElapsed } : {}) };
	};
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

function exhaustPuzzleDeductions(puzzle) {
	let { domains, placements } = puzzle.positionSnapshot();
	let step;
	while ((step = Logos.nextHintStep(puzzle, domains, placements))) {
		domains = step.domains;
		placements = step.placements;
	}
	for (let r = 0; r < puzzle.rows.length; r++) {
		for (let c = 0; c < puzzle.rows[r].slots.length; c++) {
			const slot = puzzle.rows[r].slots[c];
			slot.possible = domains[r].map(bits => !!(bits & (1 << c)));
			if (placements[r] & (1 << slot.value))
				slot.displaySingle();
			else
				slot.displayPossible();
		}
	}
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

/* UI tests use committed snapshots; the browser storage tests exercise the
 * actual IndexedDB transactions and legacy migration.
 */
async function withRunHistory(callback, initial) {
	const runs = structuredClone(initial || []);
	let nextId = 1;
	for (const run of runs)
		run.id = nextId++;
	let reads = 0;
	Logos.setHistoryStorage(async function(run, includeRuns, level = "all", multiplayer = false) {
		reads++;
		if (run) {
			run.id = nextId++;
			runs.push(structuredClone(run));
		}
		const selected = runs.filter(run => !!run.multiplayer === !!multiplayer &&
			run.elapsed !== undefined);
		const wins = selected.filter(run => run.outcome == "won" && !run.extreme)
			.sort((a, b) => a.elapsed - b.elapsed || a.id - b.id);
		return {
			runs: structuredClone(runs),
			hasMultiplayer: runs.some(run => run.multiplayer),
			unratedRuns: structuredClone(wins.filter(run => !Logos.hasRunDifficulty(run))),
			highScores: structuredClone(wins.filter(run => level == "all" ||
				Logos.hasRunDifficulty(run) && run.difficulty.level == level).slice(0, 10)),
			gameStats: {
				won: selected.filter(run => run.outcome == "won").length,
				lost: selected.filter(run => run.outcome == "lost").length,
			},
		};
	});
	try {
		await callback(runs, () => reads);
	} finally {
		Logos.setHistoryStorage(Logos.accessRunHistory);
	}
}

export {
	Logos, FakeElement, Puzzle, ExactClue, Adjacent2Clue, ColumnClue,
	source, symbols, assert, selectTileAction, makePuzzle, resetPuzzle,
	exhaustPuzzleDeductions, withRandom, puzzleSignature, withRunHistory,
};
