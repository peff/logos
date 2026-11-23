import {
	Logos, FakeElement, ColumnClue, assert, makePuzzle,
} from "./helpers.js";

Deno.test("opening analysis preserves nested suppositions and their history", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		const before = JSON.stringify(puzzle.positionSnapshot());
		const slot = puzzle.rows[0].slots[0];
		puzzle.enterSuppose();
		puzzle.requestTileAction(slot, slot.value, "place");
		const parent = puzzle.suppose;
		puzzle.enterSuppose();
		const other = puzzle.rows[1].slots[0];
		puzzle.requestTileAction(other, other.value, "place");
		const branch = puzzle.suppose;
		puzzle.options.hidden = true;
		puzzle.toggleOptions();
		puzzle.analysisUnlocked = false;
		for (let click = 0; click < 3; click++) {
			puzzle.openAnalysis();
			assert(puzzle.suppose === branch && branch.parent === parent,
			       "analysis discarded the supposition");
		}
		assert(!puzzle.analysis.hidden && puzzle.analysisSnapshot === before);
		puzzle.closeAnalysis();
		assert(!puzzle.paused && puzzle.suppose === branch);
		assert(other.elem.classList.contains("suppose-placed"));
		puzzle.moveSuppose(-1);
		assert(!other.elem.classList.contains("suppose-placed"));
		puzzle.moveSuppose(1);
		assert(other.elem.classList.contains("suppose-placed"));
		puzzle.leaveSuppose();
		assert(puzzle.suppose === parent && slot.elem.classList.contains("suppose-placed"));
		assert(JSON.stringify(puzzle.positionSnapshot()) === before);
	} finally {
		puzzle.stopTimer();
		localStorage.removeItem("analysisUnlocked");
	}
});

Deno.test("supposing keeps real moves and clue states intact until backed out", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const row = puzzle.rows[0], real = row.slots[0], slot = row.slots[1];
	puzzle.applyTileAction(real, real.value, "place");
	const before = JSON.stringify(puzzle.positionSnapshot());
	const clue = puzzle.clues.find(c => c.active && c.display);
	const wrong = slot.possible.findIndex((possible, v) => possible && v != slot.value);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, wrong, "place");
	assert(real.single && !slot.single && !puzzle.losses);
	assert(slot.elem.classList.contains("suppose-placed"));
	assert(slot.singleElem.classList.contains("placing"));
	assert(puzzle.suppose.domains[0][wrong] == 2);
	puzzle.requestClueAction(clue, false);
	assert(clue.active && clue.display.classList.contains("suppose-dismissed"));
	assert(puzzle.suppose.position == 1 && puzzle.suppose.history.length == 2);
	puzzle.requestClueAction(clue, true);
	assert(!clue.display.classList.contains("suppose-dismissed"));
	assert(puzzle.suppose.assumption.symbol == wrong);
	puzzle.moveSuppose(-1);
	assert(!puzzle.suppose.assumption && !slot.possibleElem.hidden);
	puzzle.leaveSuppose();
	assert(JSON.stringify(puzzle.positionSnapshot()) == before);
	assert(!slot.elem.classList.contains("suppose-placed"));
	puzzle.stopTimer();
});

Deno.test("suppose moves preserve unchanged text and image symbols", function() {
	const puzzle = makePuzzle(6, false, Logos.symbolsForDate(new Date(2026, 9, 31)));
	puzzle.newGame(0);
	try {
		const fixed = [puzzle.rows[0].slots[0], puzzle.rows[3].slots[0]];
		for (const slot of fixed)
			puzzle.applyTileAction(slot, slot.value, "place");
		let writes = 0;
		const text = fixed[0].singleElem;
		let content = text.textContent;
		Object.defineProperty(text, "textContent", {
			get: () => content,
			set: value => { content = value; writes++; },
		});
		const image = fixed[1].singleElem.children[0];
		puzzle.enterSuppose();
		const slot = puzzle.rows[1].slots[0];
		const wrong = slot.possible.findIndex((possible, v) => possible && v != slot.value);
		puzzle.requestTileAction(slot, wrong, "place");
		assert(slot.singleElem.textContent === slot.symbols[wrong]);
		puzzle.moveSuppose(-1);
		puzzle.moveSuppose(1);
		puzzle.leaveSuppose();
		assert(slot.singleElem.textContent === slot.symbols[slot.value]);
		assert(writes === 0, "unchanged text symbol was rewritten");
		assert(fixed[1].singleElem.children[0] === image, "unchanged image was replaced");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("real placements restore symbols overwritten by a supposition", function() {
	for (const family of [0, 3]) {
		const puzzle = makePuzzle(6, false, Logos.symbolsForDate(new Date(2026, 9, 31)));
		puzzle.newGame(0);
		try {
			const slot = puzzle.rows[family].slots[0];
			const wrong = slot.possible.findIndex((possible, v) => possible && v != slot.value);
			puzzle.enterSuppose();
			puzzle.requestTileAction(slot, wrong, "place");
			const shown = () => family === 0 ? slot.singleElem.textContent :
				slot.singleElem.children[0].alt;
			const label = value => family === 0 ? slot.symbols[value] : slot.symbols[value].label;
			assert(shown() === label(wrong));
			/* Shared moves bypass the tentative-action routing. */
			puzzle.applyTileAction(slot, slot.value, "place");
			assert(slot.single && shown() === label(slot.value));
			puzzle.reconcileSuppose();
			assert(shown() === label(slot.value));
			puzzle.leaveSuppose();
			assert(shown() === label(slot.value));
		} finally {
			puzzle.stopTimer();
		}
	}
});

Deno.test("accepting a supposition commits its moves and clue dismissals", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slot = puzzle.rows[0].slots[0];
	const other = puzzle.rows[1].slots[0];
	const removed = (other.value + 1) % 6;
	const clue = puzzle.clues.find(c => c.active && c.display);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, slot.value, "place");
	puzzle.requestTileAction(other, removed, "remove");
	puzzle.requestClueAction(clue, false);
	await puzzle.acceptSuppose();
	assert(!puzzle.suppose && slot.single && !other.possible[removed]);
	assert(!clue.active && !puzzle.losses);
	puzzle.stopTimer();
});

Deno.test("rejecting a supposition commits only the opposite initial move", function() {
	for (const discard of [false, true]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.newGame(0);
		const slot = puzzle.rows[0].slots[0], other = puzzle.rows[1].slots[0];
		const value = discard ? slot.value : (slot.value + 1) % 6;
		const clue = puzzle.clues.find(c => c.active && c.display);
		puzzle.enterSuppose();
		puzzle.requestTileAction(slot, value, discard ? "remove" : "place");
		puzzle.requestTileAction(other, other.value, "place");
		puzzle.requestClueAction(clue, false);
		puzzle.rejectSuppose();
		assert(!puzzle.suppose && !puzzle.losses);
		assert(discard ? slot.single : !slot.possible[value]);
		assert(!other.single && other.possible.every(Boolean));
		assert(clue.active);
		assert(!puzzle.supposeControls.hidden && puzzle.supposeResult);
		assert(puzzle.supposeResult.discard === !discard);
		assert(puzzle.supposeControls.querySelector(".proof-previous").disabled);
		assert(puzzle.supposeControls.querySelector(".proof-next").disabled);
		assert(puzzle.supposeControls.querySelector(".proof-position").textContent === "· Rejected");
		assert(!puzzle.supposeControls.querySelector(".proof-position").hidden);
		const reminder = puzzle.supposeControls.querySelector(".suppose-reminder");
		assert(!reminder.hidden);
		assert(reminder.children[0].attributes["data-discard"] === String(discard));
		assert(!document.body.classList.contains("suppose-active"));
		puzzle.requestTileAction(other, other.value, "place");
		assert(!puzzle.supposeResult && puzzle.supposeControls.hidden);
		puzzle.stopTimer();
	}
});

Deno.test("committing an incorrect supposition uses normal mistake checking", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slot = puzzle.rows[0].slots[0];
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, slot.value, "remove");
	assert(!puzzle.losses);
	await puzzle.acceptSuppose();
	assert(puzzle.losses == 1 && !puzzle.suppose);
	puzzle.stopTimer();
});

Deno.test("supposition arrows restore steps and new moves replace the remaining route", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const a = puzzle.rows[0].slots[0], b = puzzle.rows[1].slots[0];
	const clue = puzzle.clues.find(c => c.active && c.display);
	puzzle.enterSuppose();
	puzzle.requestTileAction(a, a.value, "place");
	puzzle.requestTileAction(b, b.value, "place");
	puzzle.requestClueAction(clue, false);
	const end = JSON.stringify(puzzle.suppose.domains);
	puzzle.moveSuppose(-1);
	assert(puzzle.suppose.position == 1 && b.singleElem.hidden);
	assert(!clue.display.classList.contains("suppose-dismissed"));
	puzzle.moveSuppose(1);
	assert(JSON.stringify(puzzle.suppose.domains) == end);
	assert(!b.singleElem.hidden && clue.display.classList.contains("suppose-dismissed"));
	puzzle.moveSuppose(-1);
	puzzle.requestTileAction(b, (b.value + 1) % 6, "remove");
	assert(puzzle.suppose.position == 2 && puzzle.suppose.history.length == 3);
	puzzle.moveSuppose(1);
	assert(puzzle.suppose.position == 2);
	puzzle.moveSuppose(-1);
	await puzzle.acceptSuppose();
	assert(a.single && !b.single && b.possible.every(Boolean));
	assert(clue.active);
	puzzle.stopTimer();
});

Deno.test("suppositions auto-dismiss placed clue symbols tentatively and respect the preference", function() {
	for (const automatic of [false, true]) {
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		puzzle.newGame(0);
		puzzle.autoDismissClues = automatic;
		const clue = puzzle.clues.find(c => c.active && c.display &&
			Logos.clueSlots(c).some(slot => !slot.single));
		puzzle.enterSuppose();
		for (const slot of Logos.clueSlots(clue))
			puzzle.requestTileAction(slot, slot.value, "place");
		assert(clue.active);
		assert(clue.display.classList.contains("suppose-dismissed") == automatic);
		puzzle.moveSuppose(-1);
		assert(!clue.display.classList.contains("suppose-dismissed"));
		puzzle.moveSuppose(1);
		assert(clue.display.classList.contains("suppose-dismissed") == automatic);
		puzzle.leaveSuppose();
		assert(clue.active && !clue.display.classList.contains("suppose-dismissed"));
		puzzle.stopTimer();
	}
});

Deno.test("supposed moves use normal sounds including placement cascades", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slot = puzzle.rows[0].slots[0];
	puzzle.enterSuppose();
	puzzle.sounds = [];
	const candidates = slot.possible.map((possible, v) => possible ? v : -1).filter(v => v >= 0);
	for (const v of candidates.slice(0, -1))
		puzzle.requestTileAction(slot, v, "remove");
	assert(puzzle.sounds.slice(0, -1).every(sound => sound == "discard"));
	assert(puzzle.sounds.at(-1) == "place");
	puzzle.moveSuppose(-1);
	const count = puzzle.sounds.length;
	puzzle.moveSuppose(1);
	assert(puzzle.sounds.length == count);
	puzzle.leaveSuppose();
	puzzle.stopTimer();
});

Deno.test("tentative placements highlight the displayed symbol's clues", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slot = puzzle.rows[0].slots[0];
	const symbol = (slot.value + 1) % 6;
	const identity = slot.row.slots.find(s => s.value == symbol);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, symbol, "place");
	slot.singleElem.listeners.pointerdown({ button: 0 });
	for (const clue of puzzle.clues.filter(c => c.display))
		assert(clue.display.classList.contains("clue-highlight-related") ==
			Logos.clueSlots(clue).includes(identity));
	slot.singleElem.listeners.pointerup({});
	assert(puzzle.clues.every(c => !c.display || !c.display.classList.contains("clue-highlight-related")));
	puzzle.leaveSuppose();
	puzzle.stopTimer();
});

Deno.test("arrow keys navigate supposition steps", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slot = puzzle.rows[0].slots[0];
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, slot.value, "place");
	let prevented = 0;
	const press = (key, extra = {}) => document.listeners.keydown({
		key, preventDefault() { prevented++; }, ...extra,
	});
	press("ArrowLeft");
	assert(puzzle.suppose.position == 0 && prevented == 1);
	press("ArrowRight", { shiftKey: true });
	assert(puzzle.suppose.position == 0 && prevented == 1);
	press("ArrowRight");
	assert(puzzle.suppose.position == 1 && prevented == 2);
	puzzle.leaveSuppose();
	puzzle.stopTimer();
});

Deno.test("supposition auto-dismissal keeps violated clues visible", function() {
	const puzzle = makePuzzle(2);
	puzzle.autoDismissClues = true;
	const clue = new ColumnClue(puzzle);
	clue.tRow = puzzle.rows[0];
	clue.bRow = puzzle.rows[1];
	clue.col = 0;
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	puzzle.clues = [clue];
	puzzle.enterSuppose();
	puzzle.requestTileAction(puzzle.rows[0].slots[0], puzzle.rows[0].slots[0].value, "place");
	puzzle.requestTileAction(puzzle.rows[1].slots[1], puzzle.rows[1].slots[0].value, "place");
	assert(!puzzle.suppose.dismissed.length && clue.active);
	assert(!clue.display.classList.contains("suppose-dismissed"));
	puzzle.moveSuppose(-1);
	puzzle.requestTileAction(puzzle.rows[1].slots[0], puzzle.rows[1].slots[0].value, "place");
	assert(puzzle.suppose.dismissed.includes(0) && clue.active);
	puzzle.leaveSuppose();
});

Deno.test("applying a supposition replays in move order and stops at a practice mistake", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	puzzle.practiceMode = true;
	const first = puzzle.rows[4].slots[0], wrong = puzzle.rows[1].slots[0];
	const last = puzzle.rows[0].slots[0];
	puzzle.enterSuppose();
	puzzle.requestTileAction(first, first.value, "place");
	puzzle.requestTileAction(wrong, (wrong.value + 1) % 6, "place");
	puzzle.requestTileAction(last, last.value, "place");
	const calls = [];
	const apply = puzzle.applyTileAction;
	puzzle.applyTileAction = function(slot, value, action) {
		calls.push({ slot, value, action, time: Date.now() });
		return apply.call(this, slot, value, action);
	};
	const replay = puzzle.acceptSuppose();
	assert(first.single && !wrong.single && !last.single && puzzle.supposeReplay);
	puzzle.requestTileAction(last, last.value, "place");
	assert(!last.single);
	await replay;
	assert(calls.length == 2 && calls[0].slot == first && calls[1].slot == wrong);
	assert(calls[1].time - calls[0].time >= 250);
	assert(puzzle.losses == 1 && !last.single && !puzzle.supposeReplay);
	assert(puzzle.pendingProof.failedSlot == wrong);
	puzzle.stopTimer();
});

Deno.test("a new game cancels pending supposition replay moves", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	puzzle.enterSuppose();
	for (const row of puzzle.rows.slice(0, 3))
		puzzle.requestTileAction(row.slots[0], row.slots[0].value, "place");
	const replay = puzzle.acceptSuppose();
	assert(puzzle.supposeReplay);
	puzzle.newGame(1);
	const before = JSON.stringify(puzzle.positionSnapshot());
	await replay;
	assert(!puzzle.supposeReplay && JSON.stringify(puzzle.positionSnapshot()) == before);
	puzzle.stopTimer();
});

Deno.test("nested suppositions fold hierarchical steps into their parent without committing", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const slots = [0, 1, 3, 4].map(r => puzzle.rows[r].slots[0]);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slots[0], slots[0].value, "place");
	const root = puzzle.suppose;
	assert(!puzzle.supposeButton.hidden && !puzzle.supposeButton.disabled);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slots[1], slots[1].value, "place");
	assert(puzzle.suppose.history[1].label == "1.1");
	puzzle.enterSuppose();
	puzzle.requestTileAction(slots[2], slots[2].value, "place");
	assert(puzzle.suppose.history[1].label == "1.1.1");
	await puzzle.acceptSuppose();
	assert(puzzle.suppose.parent == root && !puzzle.supposeReplay);
	assert(puzzle.suppose.history[2].label == "1.2");
	assert(puzzle.suppose.history[2].message.startsWith("Place "));
	await puzzle.acceptSuppose();
	assert(puzzle.suppose == root && !puzzle.supposeReplay);
	assert(root.history.map(s => s.label).join(",") == "0,1,2,3");
	assert(slots.every(slot => !slot.single));
	puzzle.moveSuppose(-1);
	assert(slots[2].singleElem.hidden && !slots[1].singleElem.hidden);
	puzzle.moveSuppose(1);
	assert(!slots[2].singleElem.hidden);
	puzzle.requestTileAction(slots[3], slots[3].value, "place");
	assert(root.history[root.position].label == "4");
	assert(root.history.slice(2).every(step => step.message.startsWith("Place ")));
	await puzzle.acceptSuppose();
	assert(slots.every(slot => slot.single) && !puzzle.losses);
	puzzle.stopTimer();
});

Deno.test("nested rejection and back-out affect only their parent exploration", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const a = puzzle.rows[0].slots[0], b = puzzle.rows[1].slots[0];
	puzzle.enterSuppose();
	puzzle.requestTileAction(a, a.value, "place");
	const root = puzzle.suppose;
	const before = JSON.stringify(root.domains);
	puzzle.enterSuppose();
	const wrong = (b.value + 1) % 6;
	puzzle.requestTileAction(b, wrong, "place");
	const clue = puzzle.clues.find(c => c.active && c.display);
	puzzle.requestClueAction(clue, false);
	puzzle.leaveSuppose();
	assert(puzzle.suppose == root && JSON.stringify(root.domains) == before);
	assert(!clue.display.classList.contains("suppose-dismissed"));
	puzzle.enterSuppose();
	puzzle.requestTileAction(b, wrong, "place");
	puzzle.rejectSuppose();
	assert(puzzle.suppose == root && !(root.domains[1][wrong] & 1));
	assert(root.assumption.row == 0 && root.history[root.position].move.discard);
	assert(b.possible[wrong] && !puzzle.losses);
	puzzle.moveSuppose(-1);
	assert(JSON.stringify(root.domains) == before);
	puzzle.enterSuppose();
	puzzle.requestTileAction(b, b.value, "place");
	puzzle.newGame(1);
	assert(!puzzle.suppose);
	puzzle.stopTimer();
});

Deno.test("Suppose controls recover after hints, pauses, and entering Zen in Options", function() {
	const previousPracticeMode = localStorage.getItem("practiceMode");
	localStorage.setItem("hintAcknowledged", "true");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame("5be42607");
	const controls = [puzzle.supposeButton, puzzle.supposeTap, puzzle.supposeFooter];
	const disabled = expected => assert(controls.every(button => button.disabled === expected),
		"Suppose controls did not reflect whether exploration is available");
	puzzle.practiceMode = false;
	disabled(false);
	puzzle.togglePause();
	disabled(true);
	puzzle.togglePause();
	disabled(false);
	puzzle.hint();
	assert(puzzle.proof, "hint did not open its proof");
	disabled(true);
	puzzle.closeProof();
	disabled(false);
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	disabled(true);
	puzzle.setPracticeMode(true);
	puzzle.toggleOptions();
	disabled(false);
	puzzle.setPageHidden(true);
	disabled(true);
	puzzle.setPageHidden(false);
	disabled(false);
	puzzle.enterSuppose();
	assert(puzzle.suppose, "restored controls did not allow a supposition");
	puzzle.leaveSuppose();
	puzzle.stopTimer();
	puzzle.say("");
	if (previousPracticeMode === null)
		localStorage.removeItem("practiceMode");
	else
		localStorage.setItem("practiceMode", previousPracticeMode);
});

Deno.test("move recordings retain nested explorations and rewound branches", async function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const first = puzzle.rows[0].slots[0], second = puzzle.rows[1].slots[0];
	puzzle.requestTileAction(first, (first.value + 1) % 6, "remove");
	puzzle.enterSuppose();
	puzzle.requestTileAction(first, first.value, "place");
	puzzle.enterSuppose();
	puzzle.requestTileAction(second, (second.value + 1) % 6, "place");
	puzzle.moveSuppose(-1);
	puzzle.requestTileAction(second, second.value, "place");
	await puzzle.acceptSuppose();
	puzzle.leaveSuppose();
	const history = puzzle.moveHistorySnapshot();
	assert(history.version === 1 && history.initial.seed === "00000000");
	assert(history.events.map(event => event.type).join(",") ===
	       "move,suppose-enter,suppose-move,suppose-enter,suppose-move,suppose-rewind,suppose-move,suppose-keep,suppose-leave,suppose-leave");
	assert(history.events[4].depth === 2 && history.events[5].position === 0);
	assert(history.events[4].domains[1][(second.value + 1) % 6] === 1);
	assert(history.events[6].domains[1][second.value] === 1);
	assert(history.final.domains[0][first.value] !== 1,
	       "abandoned supposition was confused with a committed move");
	puzzle.newGame(1);
	assert(puzzle.moveHistorySnapshot().events.length === 0);
	assert(history.events.length === 10, "export changed when a new game started");
	puzzle.enterSuppose();
	const slot = puzzle.rows[0].slots[0];
	puzzle.requestTileAction(slot, (slot.value + 1) % 6, "place");
	puzzle.rejectSuppose();
	assert(puzzle.moveRecording.events.map(event => event.type).join(",") ===
	       "suppose-enter,suppose-move,suppose-reject,suppose-leave,move");
	assert(!puzzle.moveRecording.events.at(-1).replay);
	puzzle.enterSuppose();
	puzzle.requestTileAction(slot, slot.value, "place");
	await puzzle.acceptSuppose();
	assert(puzzle.moveRecording.events.at(-1).replay);
	assert(puzzle.moveRecording.events.at(-1).domains[0][slot.value] === 1);
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("rejection results close and give way to a new supposition or game", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		const move = { row: 0, column: 0, symbol: 0, discard: true };
		puzzle.showSupposeResult(move);
		puzzle.leaveSuppose();
		assert(!puzzle.supposeResult && puzzle.supposeControls.hidden);
		puzzle.showSupposeResult(move);
		puzzle.enterSuppose();
		assert(!puzzle.supposeResult && puzzle.suppose);
		puzzle.leaveSuppose();
		puzzle.showSupposeResult(move);
		puzzle.newGame(1);
		assert(!puzzle.supposeResult && puzzle.supposeControls.hidden);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("Suppose hints use tentative domains and restore nested history after a walkthrough", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const first = puzzle.rows[0].slots[0];
		puzzle.requestTileAction(first, first.value, "place");
		puzzle.enterSuppose();
		const second = puzzle.rows[1].slots[0];
		puzzle.requestTileAction(second, second.value, "place");
		puzzle.moveSuppose(-1);
		const state = puzzle.suppose;
		const history = JSON.stringify(puzzle.supposeModel().serialize());
		const board = JSON.stringify(puzzle.positionSnapshot());
		assert(!puzzle.explainButton.disabled);
		puzzle.hint(1);
		assert(puzzle.hintRequest && !puzzle.proof);
		assert(puzzle.hintRequest.step.clues.some(clue => clue.display.classList.contains("hint-current")));
		puzzle.renderSuppose();
		assert(!puzzle.supposeControls.hidden && puzzle.proofControls.hidden,
		       "highlight-only hint replaced the Suppose controls");
		assert(JSON.stringify(puzzle.hintRequest.base) === JSON.stringify(state.domains));
		assert(puzzle.hintRequest.basePlacements[0] & (1 << first.value));
		puzzle.hint(2);
		assert(!puzzle.proofControls.hidden && !puzzle.proof && puzzle.supposeControls.hidden);
		assert(puzzle.proofControls.querySelector(".proof-position").textContent === "Suppose hint");
		assert(!puzzle.proofControls.querySelector(".proof-return").hidden);
		puzzle.returnToSuppose();
		assert(!puzzle.hintRequest && puzzle.proofControls.hidden && !puzzle.supposeControls.hidden);
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === history);
		puzzle.hint(3);
		assert(puzzle.proof && puzzle.suppose === state && puzzle.supposeControls.hidden);
		document.listeners.keydown({ key: "ArrowLeft", preventDefault() {} });
		assert(puzzle.proof.position === 0 && state.position === 0);
		puzzle.requestTileAction(second, second.value, "place");
		puzzle.requestClueAction(puzzle.clues.find(clue => clue.active), false);
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === history,
		       "walkthrough allowed edits to the hidden branch");
		assert(!first.singleElem.hidden, "walkthrough base lost a supposed placement");
		while (puzzle.proof.position < puzzle.proof.steps.length) puzzle.moveProof(1);
		puzzle.returnToSuppose();
		assert(puzzle.suppose === state && !puzzle.supposeControls.hidden);
		assert(!first.singleElem.hidden && first.singleElem.textContent === first.symbols[first.value]);
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === history);
		assert(JSON.stringify(puzzle.positionSnapshot()) === board);
		puzzle.moveSuppose(1);
		assert(!second.singleElem.hidden, "hint lost the branch's redo history");
		puzzle.hint(2);
		puzzle.moveSuppose(-1);
		assert(!puzzle.hintRequest && puzzle.proofControls.hidden, "rewind retained a stale hint");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("Suppose checks the solution only after accepting assistance", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const acknowledged = localStorage.getItem("hintAcknowledged");
	try {
		puzzle.practiceMode = false;
		puzzle.scoreEligible = true;
		puzzle.hintAcknowledged = false;
		let checks = 0;
		const matches = puzzle.supposeMatchesSolution;
		puzzle.supposeMatchesSolution = function() {
			checks++;
			assert(this.practiceMode && !this.scoreEligible, "answer checked before entering Zen");
			return matches.call(this);
		};
		puzzle.enterSuppose();
		const slot = puzzle.rows[0].slots[0];
		const wrong = slot.possible.findIndex((possible, symbol) => possible && symbol !== slot.value);
		puzzle.requestTileAction(slot, wrong, "place");
		assert(!puzzle.explainButton.disabled && checks === 0);
		puzzle.hint(1);
		assert(puzzle.pendingHint && checks === 0 && !puzzle.practiceMode);
		puzzle.finishHintNotice(false);
		assert(!puzzle.hintRequest && checks === 0 && puzzle.scoreEligible);
		puzzle.hint(1);
		puzzle.finishHintNotice(true);
		assert(checks === 1 && puzzle.hintRequest.contradictionSteps.length && !puzzle.proof);
		assert(!puzzle.supposeControls.hidden && puzzle.proofControls.hidden);
		puzzle.hint(3);
		assert(checks === 1 && puzzle.proof.steps.at(-1).contradiction);
		puzzle.returnToSuppose();
		assert(!puzzle.hintRequest && !puzzle.supposeControls.hidden && puzzle.proofControls.hidden);
		puzzle.moveSuppose(-1);
		assert(!puzzle.explainButton.disabled);
		puzzle.requestTileAction(slot, slot.value, "remove");
		assert(!puzzle.explainButton.disabled && checks === 1);
		puzzle.hint();
		assert(checks === 2 && puzzle.proof.steps.at(-1).contradiction);
	} finally {
		puzzle.stopTimer();
		if (acknowledged === null) localStorage.removeItem("hintAcknowledged");
		else localStorage.setItem("hintAcknowledged", acknowledged);
	}
});

Deno.test("contradiction explanations identify empty and overcrowded rows", function() {
	const puzzle = makePuzzle(1, false, Logos.defaultSymbols);
	for (const row of [
		[0, 63, 63, 63, 63, 63], // symbol with nowhere to go
		[31, 31, 31, 31, 31, 31], // column with no candidate
		[1, 1, 62, 62, 62, 62], // two symbols in the same column
		[3, 3, 3, 60, 60, 60], // three symbols competing for two columns
	]) {
		const before = JSON.stringify(row);
		const steps = Logos.buildContradictionSteps(puzzle, [row], [0]);
		assert(steps.length === 1 && steps[0].contradiction && steps[0].conflictRow === 0);
		assert(!steps[0].clues.length);
		assert(JSON.stringify(row) === before, "explainer changed its input");
	}
	assert(!Logos.positionContradiction(puzzle, [[3, 3, 60, 60, 60, 60]]));
});

Deno.test("an immediate clue contradiction is explained without making another deduction", function() {
	const puzzle = makePuzzle(2, false, Logos.defaultSymbols);
	const clue = new ColumnClue(puzzle);
	clue.tRow = puzzle.rows[0];
	clue.bRow = puzzle.rows[1];
	clue.col = 0;
	clue.display = new FakeElement();
	puzzle.clues = [clue];
	const domains = [Array(6).fill(63), Array(6).fill(63)];
	domains[0][clue.tRow.slots[0].value] = 1;
	domains[1][clue.bRow.slots[0].value] = 2;
	const steps = Logos.buildContradictionSteps(puzzle, domains, [0, 0]);
	assert(steps.length === 1 && steps[0].contradiction && steps[0].clues[0] === clue);
	assert(steps[0].message.includes("cannot share a column"));
});

Deno.test("contradiction hints preserve the branch through all stages and rewind", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		// A later bad move must not cause the initial correct assumption to be rejected.
		const first = puzzle.rows[0].slots[0];
		puzzle.requestTileAction(first, first.value, "place");
		const other = puzzle.rows[1].slots[0];
		puzzle.requestTileAction(other, other.value, "remove");
		const before = JSON.stringify(puzzle.supposeModel().serialize());
		const real = JSON.stringify(puzzle.positionSnapshot());
		puzzle.hint(1);
		assert(puzzle.hintRequest.contradictionSteps.length);
		assert(puzzle.proofControls.hidden && !puzzle.supposeControls.hidden);
		puzzle.hint(2);
		assert(!puzzle.proofControls.hidden && puzzle.supposeControls.hidden);
		puzzle.hint(3);
		const steps = puzzle.proof.steps;
		let domains = puzzle.proof.base.map(row => row.slice());
		let placements = puzzle.proof.basePlacements.slice();
		for (const step of steps) {
			if (step.contradiction) {
				assert(Logos.positionContradiction(puzzle, domains));
			} else {
				assert(Logos.proofStepSupported(puzzle, step, domains, placements));
				Logos.applyProofStep(domains, placements, step);
			}
			assert(JSON.stringify(domains) === JSON.stringify(step.domains));
			assert(JSON.stringify(placements) === JSON.stringify(step.placements));
		}
		puzzle.moveProof(steps.length - puzzle.proof.position);
		assert(puzzle.proofControls.querySelector(".proof-position").textContent === "Suppose hint · Contradiction");
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === before);
		assert(JSON.stringify(puzzle.positionSnapshot()) === real);
		puzzle.moveSuppose(-1);
		assert(puzzle.supposeMatchesSolution(), "hint rejected the initial assumption");
		puzzle.hint(1);
		assert(!puzzle.hintRequest.contradictionSteps);
	} finally {
		puzzle.stopTimer();
	}
});

function checkContradictionWalkthrough(puzzle, base, basePlacements, steps) {
	let domains = base.map(row => row.slice()), placements = basePlacements.slice();
	const scopes = [];
	for (const step of steps) {
		if (step.lemmaStage === "start") {
			scopes.push({ domains: domains.map(row => row.slice()), placements: placements.slice(), trial: step.lemmaTrial });
		} else if (step.lemmaStage === "end") {
			const scope = scopes.pop();
			domains = scope.domains;
			placements = scope.placements;
			domains[scope.trial.row][scope.trial.symbol] &= ~(1 << scope.trial.column);
		} else if (step.contradiction || step.lemmaStage === "contradiction") {
			assert(Logos.positionContradiction(puzzle, domains), "unjustified contradiction");
		} else {
			if (step.lemmaStage === "assumption") {
				assert(domains[step.row][step.symbol] & (1 << step.column));
			} else {
				assert(Logos.proofStepSupported(puzzle, step, domains, placements), "unsupported deduction");
			}
			Logos.applyProofStep(domains, placements, step);
		}
		assert(JSON.stringify(domains) === JSON.stringify(step.domains), "incorrect proof snapshot");
		assert(JSON.stringify(placements) === JSON.stringify(step.placements), "incorrect placements");
	}
	assert(!scopes.length && steps.at(-1).contradiction);
}

Deno.test("an Extreme contradiction can exceed the walkthrough budget without becoming valid", function() {
	// Found by analysis/suppose-contradictions.js. This is a real wrong
	// removal, not an artificial search with its budget set to zero.
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0x4c3f2a56, false, false, true);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const slot = puzzle.rows[0].slots[0];
		assert(slot.value === 0);
		puzzle.requestTileAction(slot, slot.value, "remove");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		puzzle.hint(1);
		assert(puzzle.hintRequest.unexplainedContradiction && !puzzle.proof);
		assert(puzzle.supposeControls.hidden && !puzzle.proofControls.hidden);
		const request = puzzle.hintRequest;
		const steps = Logos.buildContradictionSteps(puzzle, request.base, request.basePlacements,
			{ maxSteps: 2000 });
		assert(steps.length > 500 && steps.some(step => step.lemmaStage === "start"));
		checkContradictionWalkthrough(puzzle, request.base, request.basePlacements, steps);
		puzzle.hint(3);
		assert(!puzzle.proof && puzzle.hintRequest === request);
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("a consistent position does not produce a contradiction explanation", function() {
	const puzzle = Logos.puzzleFromSeed(0x12345678);
	const domains = puzzle.rows.map(row => {
		const result = Array(6).fill(0);
		row.slots.forEach((slot, column) => result[slot.value] = 1 << column);
		return result;
	});
	assert(!Logos.buildContradictionSteps(puzzle, domains, Array(6).fill(63)).length);
});

Deno.test("Extreme contradiction hints can use lemmas within the existing supposition", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0x4c3f2a56, false, false, true);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const slot = puzzle.rows[0].slots[0];
		puzzle.requestTileAction(slot, 3, "place");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		puzzle.hint(3);
		assert(puzzle.proof && puzzle.proof.steps.some(step => step.lemmaStage === "start"));
		checkContradictionWalkthrough(puzzle, puzzle.proof.base, puzzle.proof.basePlacements, puzzle.proof.steps);
		while (puzzle.proof.position < puzzle.proof.steps.length) puzzle.moveProof(1);
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("overcrowded columns highlight only their competing candidate tiles", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const row = puzzle.rows[1];
		for (const symbol of [0, 1, 2])
			for (const column of [2, 3, 4, 5])
				puzzle.requestTileAction(row.slots[column], symbol, "remove");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		puzzle.hint(1);
		assert(puzzle.hintRequest.step.conflictRow === 1);
		puzzle.renderSuppose();
		for (const [column, slot] of row.slots.entries()) {
			assert(!slot.elem.classList.contains("hint-current"));
			for (const [symbol, tile] of slot.possibilityElems.entries())
				assert(tile.classList.contains("hint-current") === (symbol < 3 && column < 2));
		}
		assert(!puzzle.supposeControls.hidden && puzzle.proofControls.hidden);
		puzzle.hint(2);
		assert(Logos.proofMessageText(puzzle, puzzle.hintRequest.step.message) ===
			"There isn't room for all of A, B, and C in columns one and two.");
		puzzle.hint(3);
		assert(puzzle.proof.steps.length === 1 && puzzle.proof.steps[0].contradiction);
		assert(row.elem.classList.contains("pencil-conflict"));
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
		assert(row.slots.every(slot => slot.possibilityElems.every(tile => !tile.classList.contains("hint-current"))));
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("an empty column hint highlights only that slot", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		puzzle.suppose.domains[0] = Array(6).fill(31);
		puzzle.renderSuppose();
		puzzle.hint(1);
		assert(puzzle.hintRequest.step.conflictRow === 0 && puzzle.hintRequest.step.conflictColumn === 5);
		puzzle.renderSuppose();
		for (const [column, slot] of puzzle.rows[0].slots.entries())
			assert(slot.elem.classList.contains("hint-current") === (column === 5));
		puzzle.hint(2);
		assert(puzzle.hintRequest.step.message.includes("column 6"));
		puzzle.returnToSuppose();
		assert(puzzle.rows[0].slots.every(slot => !slot.elem.classList.contains("hint-current")));
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("a symbol with nowhere to go is highlighted only in unplaced slots", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const row = puzzle.rows[1];
		// Reproduce the cascade through actual moves: A has columns 2/3,
		// B has 1/2, and C has 1/3. Placing D in 1 leaves A homeless.
		for (const [symbol, columns] of [[0, [0, 3, 4, 5]], [1, [2, 3, 4, 5]], [2, [1, 3, 4, 5]]])
			for (const column of columns)
				puzzle.requestTileAction(row.slots[column], symbol, "remove");
		puzzle.requestTileAction(row.slots[0], 3, "place");
		puzzle.hint(1);
		assert(puzzle.hintRequest.step.conflictSymbol === 0);
		puzzle.renderSuppose();
		for (const [column, slot] of row.slots.entries()) {
			assert(!slot.elem.classList.contains("hint-current"));
			for (const [symbol, tile] of slot.possibilityElems.entries())
				assert(tile.classList.contains("hint-current") === (symbol === 0 && column >= 3));
		}
		puzzle.returnToSuppose();
		assert(row.slots.every(slot => !slot.possibilityElems[0].classList.contains("hint-current")));
		assert(puzzle.suppose.domains[1][0] === 0, "highlight restored a discarded possibility");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("a duplicate placement explains the tile missing from the displayed row", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		const row = puzzle.rows[1];
		// A/B/C share columns 1/2. Placing C in 1 forces A and B into 2.
		for (const symbol of [0, 1, 2])
			for (const column of [2, 3, 4, 5])
				puzzle.requestTileAction(row.slots[column], symbol, "remove");
		puzzle.requestTileAction(row.slots[0], 2, "place");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		assert(row.slots[1].singleElem.textContent === row.slots[1].symbols[0]);
		puzzle.hint(1);
		assert(puzzle.hintRequest.step.conflictRow === 1 && puzzle.hintRequest.step.conflictSymbol === 1);
		puzzle.renderSuppose();
		for (const [column, slot] of row.slots.entries()) {
			assert(!slot.elem.classList.contains("hint-current"));
			for (const [symbol, tile] of slot.possibilityElems.entries())
				assert(tile.classList.contains("hint-current") === (symbol === 1 && column >= 2));
		}
		puzzle.hint(2);
		assert(Logos.proofMessageText(puzzle, puzzle.hintRequest.step.message) ===
			"Contradiction: B has no possible column.");
		puzzle.hint(3);
		assert(row.slots[1].singleElem.textContent === row.slots[1].symbols[0]);
		puzzle.returnToSuppose();
		assert(row.slots.every(slot => !slot.possibilityElems[1].classList.contains("hint-current")));
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("a contradiction hint explains every alternative in a small choice", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0x78c9d796, false, false, true);
	try {
		puzzle.hintAcknowledged = true;
		puzzle.enterSuppose();
		// Exhaust the opening deductions, then wrongly discard II from
		// column 1. That leaves I/V there; rejecting just V proves little.
		for (const [row, symbol, columns] of [
			[0, 0, [5]], [0, 4, [0, 5]],
			[1, 0, [5]], [1, 2, [0, 5]], [1, 3, [0, 1]],
			[2, 2, [0, 1]], [2, 3, [0]], [2, 5, [0, 5]],
			[3, 1, [0, 5]], [4, 2, [0]], [4, 3, [0, 5]],
			[5, 0, [0, 5]], [5, 3, [0, 5]],
		])
			for (const column of columns)
				puzzle.requestTileAction(puzzle.rows[row].slots[column], symbol, "remove");
		const valid = puzzle.suppose.domains.map(row => row.slice());
		assert(Logos.findContradictionLemma(puzzle, valid, puzzle.clues, 1),
		       "valid fixture must still permit a failed trial");
		assert(!Logos.buildContradictionChoices(puzzle, valid, Array(6).fill(0), { depthLimit: 1 }).length,
		       "one failed trial was treated as an exhausted choice");
		puzzle.requestTileAction(puzzle.rows[2].slots[0], 1, "remove");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		const messages = [], explain = puzzle.showHintExplanation;
		puzzle.showHintExplanation = function(message) {
			messages.push(Logos.proofMessageText(this, message));
			return explain.call(this, message);
		};
		puzzle.hint(1);
		const choices = puzzle.hintRequest.step.contradictionChoices;
		assert(choices.row === 2 && choices.column === 0);
		assert(choices.alternatives.map(trial => trial.symbol).join() === "0,4");
		assert(messages.at(-1) === "Neither I nor V can occupy column 1.");
		const slot = puzzle.rows[2].slots[0];
		assert(slot.possibilityElems[0].classList.contains("hint-current") &&
		       slot.possibilityElems[4].classList.contains("hint-current"));
		assert(puzzle.rows[2].slots.every(slot => !slot.elem.classList.contains("hint-current")));
		puzzle.hint(2);
		assert(messages.at(-1) === "Placing V in column 1 leads to a contradiction.");
		assert(!slot.possibilityElems[0].classList.contains("hint-current") &&
		       slot.possibilityElems[4].classList.contains("hint-current"));
		puzzle.hint(3);
		const proof = puzzle.proof;
		assert(proof.steps.length < 281, "exhausting the choice lengthened the old detour");
		const trials = proof.steps.filter(step => step.lemmaStage === "start" && step.lemmaDepth === 1)
			.map(step => step.lemmaTrial);
		assert(trials.length === 2 && trials.every(trial => trial.row === 2 && trial.column === 0));
		assert(trials.map(trial => trial.symbol).join() === "4,0");
		assert(proof.steps.at(-1).conflictColumn === 0);
		checkContradictionWalkthrough(puzzle, proof.base, proof.basePlacements, proof.steps);
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("fallback contradiction lemmas introduce the purpose and highlight candidate positions", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	try {
		puzzle.enterSuppose();
		puzzle.requestTileAction(puzzle.rows[1].slots[5], 0, "remove");
		const saved = JSON.stringify(puzzle.supposeModel().serialize());
		// Exercise the presentation of a proof beginning with an individual
		// lemma, without an exhausted-choice explanation attached to it.
		const step = { clues: [], lemmaTrial: { row: 1, symbol: 0, column: 2 } };
		puzzle.hintRequest = {
			base: puzzle.suppose.domains.map(row => row.slice()),
			step, contradictionSteps: [step],
			supposeSnapshot: JSON.stringify(puzzle.supposeSnapshot()),
		};
		const messages = [], explain = puzzle.showHintExplanation;
		puzzle.showHintExplanation = function(message) {
			messages.push(Logos.proofMessageText(this, message));
			return explain.call(this, message);
		};
		puzzle.showHint(1);
		assert(messages.at(-1) === "To see why your supposition conflicts, explore the positions of A.");
		assert(!puzzle.proofControls.hidden && puzzle.supposeControls.hidden);
		for (const [row, model] of puzzle.rows.entries())
			for (const [column, slot] of model.slots.entries()) {
				assert(!slot.elem.classList.contains("hint-current"));
				for (const [symbol, tile] of slot.possibilityElems.entries())
					assert(tile.classList.contains("hint-current") === (row === 1 && symbol === 0 && column < 5));
			}
		puzzle.showHint(2);
		assert(messages.at(-1) === "Placing A in column 3 leads to a contradiction.");
		for (const [column, slot] of puzzle.rows[1].slots.entries())
			assert(slot.possibilityElems[0].classList.contains("hint-current") === (column === 2));
		puzzle.returnToSuppose();
		assert(JSON.stringify(puzzle.supposeModel().serialize()) === saved);
		assert(puzzle.proofControls.hidden && !puzzle.supposeControls.hidden);
	} finally {
		puzzle.stopTimer();
	}
});
