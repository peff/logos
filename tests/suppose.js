import {
	Logos, FakeElement, ColumnClue, assert, makePuzzle,
} from "./helpers.js";

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
