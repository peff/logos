import {
	Logos, FakeElement, ColumnClue, symbols, assert, selectTileAction,
	makePuzzle,
} from "./helpers.js";

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

Deno.test("Control-click fallback combines discard with chalk modifiers", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const cell = slot.possibilityElems[slot.value];
	const actions = [];
	puzzle.requestTileAction = function(slot, value, action) {
		actions.push(action);
	};
	for (const coarse of [false, true]) {
		puzzle.coarsePointer = coarse;
		for (const taps of [false, true]) {
			puzzle.showActionSelector = taps;
			selectTileAction(puzzle, "place");
			for (const modifier of [null, "shiftKey", "altKey"]) {
				const event = {
					button: 0,
					ctrlKey: true,
					shiftKey: modifier == "shiftKey",
					altKey: modifier == "altKey",
					currentTarget: cell,
				};
				actions.length = 0;
				/* Coarse input defers to click; also cover click alone. */
				if (coarse)
					cell.listeners.pointerdown(event);
				cell.listeners.click(event);
				const expected = modifier ? "pencil-remove" : "remove";
				assert(actions.length == 1 && actions[0] == expected,
				       `coarse=${coarse}, taps=${taps}, ${modifier}: ` +
				       `expected ${expected}, got ${actions}`);
			}
		}
	}
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

Deno.test("touch swipes discard board and tray possibilities", function() {
	for (const tray of [false, true]) {
		for (const chalk of [false, true]) {
			for (const direction of [[45, 0], [-45, 0], [0, 45], [0, -45]]) {
				const puzzle = makePuzzle(1);
				const slot = puzzle.rows[0].slots[0];
				const value = (slot.value + 1) % symbols.length;
				puzzle.coarsePointer = false;
				puzzle.expandTileChoices = tray;
				puzzle.showActionSelector = true;
				selectTileAction(puzzle, chalk ? "pencil-select" : "place");
				if (tray)
					puzzle.expandedSlot = slot;
				const tile = tray ? puzzle.slotTrayTiles[value] :
					slot.possibilityElems[value];
				const ev = { pointerType: "touch", pointerId: 1,
					button: 0, clientX: 100, clientY: 100 };
				tile.listeners.pointerdown(ev);
				assert(!slot.single && slot.possible[value],
				       "touch down acted on a fine-pointer device");
				const end = { ...ev, clientX: 100 + direction[0],
					clientY: 100 + direction[1] };
				tile.listeners.pointermove(end);
				tile.listeners.contextmenu({ preventDefault() {} });
				assert(slot.possible[value] && !puzzle.pencilMarks.length,
				       "swiping triggered a long-press action");
				tile.listeners.pointerup(end);
				assert(chalk ? puzzle.pencilMarks.length == 1 &&
				       puzzle.pencilMarks[0].discard : !slot.possible[value],
				       "swipe did not discard with the selected mark");
				assert(!tile.style.transform && !tile.style.opacity,
				       "swipe left its preview on a reused tile");
				selectTileAction(puzzle, "place");
				puzzle.stopTimer();
			}
		}
	}
});

Deno.test("reversed and cancelled tile swipes do not act", function() {
	for (const cancel of ["return", "pointercancel", "lostpointercapture"]) {
		const puzzle = makePuzzle(1);
		const slot = puzzle.rows[0].slots[0];
		const tile = slot.possibilityElems[slot.value];
		const ev = { pointerType: "touch", pointerId: 1,
			button: 0, clientX: 100, clientY: 100 };
		tile.listeners.pointerdown(ev);
		tile.listeners.pointermove({ ...ev, clientX: 145 });
		if (cancel == "return")
			tile.listeners.pointerup(ev);
		else
			tile.listeners[cancel](ev);
		assert(!slot.single && !puzzle.losses,
		       "cancelled swipe acted on the tile");
		let suppressed = false;
		document.listeners.click({ detail: 1, preventDefault() {},
			stopImmediatePropagation() { suppressed = true; } });
		assert(suppressed, "cancelled swipe allowed a release tap");
		assert(!tile.style.transform, "cancelled swipe left a preview");
		puzzle.stopTimer();
	}
});

Deno.test("coarse pointers use an expanded slot tray", function() {
	const puzzle = makePuzzle(1);
	const slot = puzzle.rows[0].slots[0];
	const wrong = (slot.value + 1) % symbols.length;
	puzzle.expandTileChoices = true;
	const panel = puzzle.slotTray;
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
	assert(puzzle.slotTrayTiles.every(function(tile, i) {
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
	const trayTiles = puzzle.slotTrayTiles.slice();

	selectTileAction(puzzle, "remove");
	let tile = puzzle.slotTrayTiles[wrong];
	tile.listeners.click({});
	assert(!slot.possible[wrong], "tray removal did not commit");
	assert(puzzle.expandedSlot === null && puzzle.slotTray.hidden,
	       "tray removal did not close the slot");

	puzzle.openSlotTray(slot);
	assert(puzzle.slotTrayTiles.every(function(tile, i) {
		return tile === trayTiles[i];
	}), "expanded tray did not reuse its tiles");
	puzzle.applySlotTrayAction(wrong);
	assert(puzzle.expandedSlot == slot && puzzle.losses == 0,
	       "an eliminated tray tile applied an action");
	assert(puzzle.slotTrayTiles.every(function(tile, i) {
		return !slot.possible[i] ||
		       tile.attributes["aria-label"] == "Discard " + symbols[i];
	}), "expanded tray did not decorate its Discard action");
	assert(puzzle.slotTrayAction.className.includes("slot-tray-action-remove") &&
	       puzzle.slotTrayAction.className.includes(slot.row.familyClass),
	       "expanded tray did not identify its Discard action");
	selectTileAction(puzzle, "pencil-select");
	tile = puzzle.slotTrayTiles[slot.value];
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
	tile = puzzle.slotTrayTiles[slot.value];
	tile.listeners.click({});
	assert(slot.single && puzzle.expandedSlot === null &&
	       puzzle.slotTray.hidden,
	       "tray placement did not resolve and close the slot");
	assert(!panel.classList.contains("opening"),
	       "closing the tray retained its opening animation");
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
});

Deno.test("tray long-press and modified clicks discard with the selected mark", function() {
	for (const mark of ["place", "pencil-select"]) {
		for (const gesture of ["long-press", "right-click", "control-click", "context-only"]) {
			const puzzle = makePuzzle(1);
			const slot = puzzle.rows[0].slots[0];
			const wrong = (slot.value + 1) % symbols.length;
			puzzle.expandTileChoices = true;
			/* The tray always uses its selector, even if the board's is hidden. */
			puzzle.showActionSelector = false;
			selectTileAction(puzzle, mark);
			puzzle.openSlotTray(slot);
			const tile = puzzle.slotTrayTiles[wrong];
			let actions = 0;
			const request = puzzle.requestTileAction;
			puzzle.requestTileAction = function(slot, value, action) {
				assert(this.expandedSlot === null && this.slotTray.hidden,
				       "tray was not closed before committing");
				actions++;
				return request.call(this, slot, value, action);
			};
			let prevented = false;
			const event = {
				button: gesture == "right-click" ? 2 : 0,
				ctrlKey: gesture == "control-click",
				pointerType: gesture == "long-press" ? "touch" : "mouse",
				currentTarget: tile,
				preventDefault() { prevented = true; },
			};
			if (gesture != "context-only")
				tile.listeners.pointerdown(event);
			assert(actions == 0, "tray acted before click or context menu");
			if (gesture == "control-click")
				tile.listeners.click(event);
			else {
				tile.listeners.contextmenu(event);
				assert(prevented, "tray context menu was not suppressed");
			}
			assert(actions == 1, "tray did not apply one discard");
			if (mark == "place")
				assert(!slot.possible[wrong], "tray did not discard the possibility");
			else
				assert(slot.possible[wrong] && puzzle.pencilMarks.length == 1 &&
				       puzzle.pencilMarks[0].discard,
				       "tray did not use chalk discard");
			/* A follow-up event on the closed tray must not apply another action. */
			tile.listeners.contextmenu(event);
			tile.listeners.click(event);
			assert(actions == 1, "follow-up event applied another tray action");
			puzzle.stopTimer();
		}
	}
});

Deno.test("touch options use independent defaults and saved settings",
		function() {
	localStorage.removeItem("expandTileChoices");
	localStorage.removeItem("showActionSelector");
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

Deno.test("right and control presses toggle clues exactly once", function() {
	for (const control of [false, true]) {
		const puzzle = makePuzzle(2);
		const clue = new ColumnClue(puzzle);
		clue.display = new FakeElement();
		clue.active = true;
		clue.render();
		clue.rendered = true;
		puzzle.clues = [clue];
		const event = {
			button: control ? 0 : 2, ctrlKey: control,
			pointerType: "mouse", preventDefault() {},
		};
		for (const active of [false, true]) {
			clue.display.onpointerdown(event);
			assert(clue.active == active, "press did not toggle immediately");
			assert(!clue.display.classList.contains("clue-highlight-source"),
			       "dismissal flashed clue highlights");
			clue.display.onpointerup(event);
			clue.display.oncontextmenu(event);
			clue.display.onclick(event);
			assert(clue.active == active, "follow-up event toggled the clue again");
		}
	}
});

Deno.test("chalk clue dismissal toggles separately and erases without restoring regular dismissals", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	const [clue, regular] = puzzle.clues.filter(clue => clue.display);
	puzzle.applyClueAction(regular, false);
	const event = { button: 2, pointerType: "mouse", shiftKey: true,
		preventDefault() {} };
	clue.display.onpointerdown(event);
	clue.display.oncontextmenu(event);
	assert(clue.active && clue.chalkMark);
	assert(clue.display.classList.contains("chalk-dismissed"));
	assert(!puzzle.eraseChalkBoard.hidden);
	clue.display.onpointerdown(event);
	clue.display.oncontextmenu(event);
	assert(clue.active && !clue.chalkMark);
	puzzle.requestChalkClue(clue);
	const index = puzzle.clues.indexOf(clue);
	assert(puzzle.positionSnapshot().chalkClues[0] === index);
	puzzle.saveDailyReturn();
	const saved = puzzle.dailyReturn;
	puzzle.newGame(1);
	puzzle.dailyReturn = saved;
	puzzle.restoreDailyReturn();
	assert(puzzle.clues[index].chalkMark);
	puzzle.eraseChalkMarks();
	assert(puzzle.clues[index].active && !puzzle.clues[index].chalkMark);
	assert(!puzzle.clues[index].display.classList.contains("chalk-dismissed"));
	assert(puzzle.clues.some(clue => clue.display && !clue.active));
	assert(puzzle.eraseChalkBoard.hidden);
	puzzle.stopTimer();
});

Deno.test("touch clue swipes use chalk without changing normal dismissal", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.newGame(0);
	puzzle.showActionSelector = true;
	puzzle.getTileAction = () => "pencil-remove";
	const clue = puzzle.clues.find(clue => clue.display);
	const event = { button: 0, pointerType: "touch", pointerId: 4,
		clientX: 100, clientY: 100, preventDefault() {} };
	clue.display.onpointerdown(event);
	clue.display.onpointerup({ ...event, clientX: 150 });
	assert(clue.active && clue.chalkMark);
	puzzle.eraseChalkMarks();
	assert(clue.active && !clue.chalkMark);
	puzzle.stopTimer();
});

Deno.test("touch holds highlight clues without dismissing them", async function() {
	const puzzle = makePuzzle(2);
	const clue = new ColumnClue(puzzle);
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	puzzle.clues = [clue];
	const event = {
		button: 0, pointerType: "touch", pointerId: 7, clientX: 100, clientY: 100,
		preventDefault() {},
	};
	clue.display.onpointerdown(event);
	assert(!clue.display.classList.contains("clue-highlight-source"),
	       "touch highlighted before the swipe grace period");
	await new Promise(resolve => setTimeout(resolve, 100));
	assert(clue.display.classList.contains("clue-highlight-source"),
	       "holding a clue did not highlight it");
	clue.display.oncontextmenu(event);
	assert(clue.active, "touch context menu dismissed the clue");
	clue.display.onpointerup(event);
	clue.display.onclick(event);
	assert(clue.active && !clue.display.classList.contains("clue-highlight-source"),
	       "touch release dismissed the clue or left highlights behind");
});

Deno.test("touch swipes slide a cover along either axis", async function() {
	const puzzle = makePuzzle(2);
	const clue = new ColumnClue(puzzle);
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	clue.rendered = true;
	puzzle.clues = [clue];
	const display = clue.display;
	display.clientWidth = 100;
	display.clientHeight = 80;
	function event(x = 100, y = 100, pointerType = "touch") {
		return {
			button: 0, pointerType, pointerId: 7,
			clientX: x, clientY: y, preventDefault() {},
		};
	}
	function swipe(dx, dy = 0, options = {}) {
		const before = clue.active;
		display.onpointerdown(event(100, 100, options.pointerType));
		assert(clue.active == before &&
		       display.classList.contains("clue-highlight-source") == (options.pointerType == "mouse"),
		       "press did not distinguish immediate mouse and delayed touch highlighting");
		if (options.multi)
			display.onpointerdown({ ...event(), pointerId: 8, isPrimary: false });
		if (options.cancel)
			display.onpointercancel(event());
		if (options.lostCapture)
			display.onlostpointercapture();
		const release = event(100 + dx, 100 + dy, options.pointerType);
		display.onpointerup(release);
		const active = clue.active;
		display.onlostpointercapture();
		display.onclick(release);
		assert(clue.active == active &&
		       !display.classList.contains("clue-highlight-source"),
		       "follow-up events toggled dismissal or left highlights behind");
	}
	display.onpointerdown(event());
	display.onpointermove(event(115));
	assert(clue.active && !display.classList.contains("clue-highlight-source") &&
	       display.classList.contains("clue-swiping") &&
	       display.children.at(-1).className == "clue-swipe-cover" &&
	       display.children.at(-1).style.transform == "translateX(-85px)" &&
	       !display.children[0].style.transform,
	       "swipe did not slide a cover over the stationary symbols");
	display.onpointermove(event(145));
	display.onpointerup(event(105));
	assert(clue.active && !display.classList.contains("clue-swiping"),
	       "returning before release did not cancel dismissal");
	display.onpointerdown(event());
	display.onpointermove(event(145));
	display.onpointercancel();
	assert(clue.active && !display.classList.contains("clue-swiping") &&
	       !display.children.some(child => child.className == "clue-swipe-cover"),
	       "cancellation left a swipe preview behind");
	swipe(0);
	swipe(0);
	assert(clue.active, "taps dismissed the clue");
	swipe(15);
	assert(clue.active, "a small finger movement dismissed the clue");
	swipe(0, -40);
	assert(!clue.active, "upward swipe did not dismiss the clue");
	swipe(0, 40);
	assert(clue.active, "downward swipe did not restore the clue");
	swipe(40, 60);
	assert(!clue.active, "diagonal swipe did not use its dominant axis");
	swipe(-40, -60);
	assert(clue.active, "reverse diagonal swipe did not restore the clue");
	swipe(-40, 5);
	assert(!clue.active, "left swipe did not dismiss the clue");
	swipe(40, -5);
	assert(clue.active, "right swipe did not restore the clue");
	for (const options of [
		{ cancel: true }, { lostCapture: true }, { multi: true },
		{ pointerType: "mouse" },
	]) {
		swipe(60, 0, options);
		assert(clue.active, "cancelled gesture or mouse drag dismissed the clue");
	}
	await new Promise(resolve => setTimeout(resolve, 100));
	assert(!display.classList.contains("clue-highlight-source"),
	       "a released or cancelled touch left a highlight timer running");
	puzzle.proof = {};
	display.onpointerdown(event());
	display.onpointerup(event(160));
	assert(clue.active && !display.classList.contains("clue-highlight-source"),
	       "touch changed clues during a proof");
});

Deno.test("pressing a clue highlights clues with shared symbols", function() {
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
		preventDefault() { prevented = true; },
	});
	assert(prevented &&
	       selected.display.classList.contains("clue-highlight-source") &&
	       related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "press did not distinguish related clues");
	selected.display.onpointerup({});
	selected.display.onlostpointercapture();
	assert(!selected.display.classList.contains("clue-highlight-source") &&
	       !related.display.classList.contains("clue-highlight-related") &&
	       !unrelated.display.classList.contains("clue-highlight-related"),
	       "releasing the pointer did not clear clue highlights");

	selected.display.onclick({ preventDefault() {} });
	assert(selected.active,
	       "the click following a press dismissed the clue");
	selected.display.onclick({ preventDefault() {} });
	assert(selected.active,
	       "repeated mouse clicks dismissed the clue");
});

Deno.test("losing clue pointer capture clears highlights", function() {
	const puzzle = makePuzzle(2);
	const clue = new ColumnClue(puzzle);
	clue.display = new FakeElement();
	clue.active = true;
	clue.render();
	puzzle.clues = [clue];
	clue.display.onpointerdown({
		button: 0, shiftKey: true, preventDefault() {},
	});
	assert(clue.display.classList.contains("clue-highlight-source"),
	       "press did not highlight the clue");
	clue.display.onlostpointercapture();
	assert(!clue.display.classList.contains("clue-highlight-source") && clue.active,
	       "losing capture left highlights behind or dismissed the clue");
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

Deno.test("contradicted selections retain circles rather than discard marks", function() {
	const puzzle = makePuzzle(1);
	const [first, second] = puzzle.rows[0].slots;
	const value = first.value;
	first.pencil(value, false);
	second.pencil(value, false);
	for (const slot of [first, second]) {
		const classes = slot.possibilityElems[value].className;
		assert(classes.includes("pencil-selected pencil-explicit") &&
		       classes.includes("pencil-contradiction") &&
		       !classes.includes("pencil-removed") && !classes.includes("pencil-derived"),
		       "contradiction replaced or faded an explicit circle");
	}
	puzzle.openSlotTray(first);
	assert(puzzle.slotTrayTiles[value].className.includes("pencil-contradiction"),
	       "expanded tile lost the contradiction");
	second.pencil(value, false);
	assert(!first.possibilityElems[value].className.includes("pencil-contradiction") &&
	       !puzzle.slotTrayTiles[value].className.includes("pencil-contradiction"),
	       "resolving a contradiction left the slash behind");
});

Deno.test("erase chalk clears every row without changing deductions", function() {
	const puzzle = makePuzzle(2);
	puzzle.setShowActionSelector(false);
	assert(puzzle.eraseChalkBoard.hidden && puzzle.eraseChalkTap.hidden &&
	       puzzle.eraseChalkFooter.hidden,
	       "an eraser appeared without chalk");
	const first = puzzle.rows[0].slots[0];
	const second = puzzle.rows[1].slots[0];
	first.pencil(first.value, false);
	first.pencil((first.value + 1) % symbols.length, false);
	second.pencil(second.value, true);
	const state = () => JSON.stringify(puzzle.rows.map(row =>
		row.slots.map(slot => [slot.single, slot.possible])));
	const before = state();
	assert(!puzzle.eraseChalkBoard.hidden && puzzle.eraseChalkTap.hidden &&
	       !puzzle.eraseChalkFooter.hidden,
	       "mouse controls did not enable the board and footer erasers");
	puzzle.setShowActionSelector(true);
	assert(puzzle.eraseChalkBoard.hidden && !puzzle.eraseChalkTap.hidden &&
	       puzzle.eraseChalkFooter.hidden,
	       "Tap controls did not take over the eraser");
	puzzle.openSlotTray(first);
	puzzle.eraseChalkMarks();
	assert(puzzle.pencilMarks.length == 0 &&
	       puzzle.eraseChalkBoard.hidden && puzzle.eraseChalkTap.hidden &&
	       puzzle.eraseChalkFooter.hidden,
	       "erasing did not clear marks and hide all erasers");
	assert(before == state(),
	       "erasing changed committed deductions");
	for (const row of puzzle.rows) {
		assert(!row.elem.classList.contains("pencil-conflict"),
		       "erasing left a chalk conflict");
		for (const slot of row.slots)
			for (const tile of slot.possibilityElems)
				assert(!tile.className.includes("pencil-"),
				       "erasing left a chalk display");
	}
	for (const tile of puzzle.slotTrayTiles)
		assert(!tile.className.includes("pencil-"),
		       "erasing left chalk in the open tray");
	puzzle.setShowActionSelector(false);
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
		       puzzle.helpScroll.target == 800 && scrolls.length == 2 &&
		       scrolls[1].left == 800 && scrolls[1].behavior == "smooth",
		       "second help turn did not retarget the animation");
		viewport.listeners.scroll();
		assert(puzzle.helpPage == 2, "intermediate scrolling replaced the destination");
		puzzle.turnHelpPage(-1);
		assert(puzzle.helpPage == 1 && scrolls[2].left == 400 &&
		       scrolls[2].behavior == "smooth", "reverse turn did not retarget smoothly");
		viewport.scrollLeft = 400;
		viewport.listeners.scroll();
		assert(puzzle.helpScroll.target === null, "arrival retained the pending destination");
		globalThis.matchMedia = () => ({ matches: true });
		puzzle.turnHelpPage(-1);
		assert(viewport.scrollLeft == 0 && scrolls.length == 3,
		       "reduced motion animated a help turn");
		globalThis.matchMedia = () => ({ matches: false });
		puzzle.turnHelpPage(1);
		viewport.listeners.pointerdown();
		viewport.scrollLeft = 800;
		viewport.listeners.scroll();
		assert(puzzle.helpPage == 2 && puzzle.helpScroll.target === null,
		       "direct manipulation did not take over from the pending turn");
	} finally {
		delete globalThis.matchMedia;
	}
});
