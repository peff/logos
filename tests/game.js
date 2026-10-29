import {
	Logos, FakeElement, Puzzle, ExactClue, ColumnClue, symbols, assert,
	selectTileAction, makePuzzle, resetPuzzle, withRandom, puzzleSignature,
} from "./helpers.js";

function revealedTiles(puzzle) {
	return puzzle.rows[3].slots[0].symbols.filter(symbol => typeof symbol != "string").length;
}

function imageTestSymbols() {
	const symbols = Logos.defaultSymbols.map(row => row.slice());
	for (const [value, label, drawing] of [
		[0, "Red circle", '<circle cx="50" cy="50" r="40" fill="red"/>'],
		[1, "Blue square", '<rect x="10" y="10" width="80" height="80" fill="blue"/>'],
	]) {
		symbols[3][value] = {
			label,
			src: "data:image/svg+xml," + encodeURIComponent(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
				drawing + '</svg>'),
		};
	}
	return symbols;
}

Deno.test("seasonal symbols reveal left to right on October 26–31 in local time", function() {
	const expected = ["Ghost", "Bat", "Witch", "Candy corn", "Skull", "Jack-o’-lantern"];
	for (const year of [2026, 2027]) {
		for (const date of [new Date(year, 9, 25, 23, 59, 59),
			new Date(year, 10, 1), new Date(year, 0, 31)])
			assert(Logos.symbolsForDate(date) === Logos.defaultSymbols,
			       "seasonal symbols appeared outside the reveal window");
		for (let day = 26; day <= 31; day++) {
			const selected = Logos.symbolsForDate(new Date(year, 9, day));
			for (let family = 0; family < 6; family++)
				for (let value = 0; value < 6; value++) {
					if (family == 3 && value < day - 25)
						assert(selected[family][value].label == expected[value],
						       "wrong reveal order or midnight boundary");
					else
						assert(selected[family][value] === Logos.defaultSymbols[family][value],
						       "an unrevealed symbol changed");
				}
		}
	}
	assert(Logos.defaultSymbols[3].every(symbol => typeof symbol == "string"),
	       "selection mutated the classic symbols");
});

Deno.test("seasonal symbols refresh on load, new games, and accepting invitations", function() {
	let date = new Date(2026, 9, 26);
	const puzzle = makePuzzle(6, false, () => Logos.symbolsForDate(date));
	const slots = puzzle.rows.flatMap(row => row.slots);
	assert(revealedTiles(puzzle) == 1, "initial board did not select today's symbols");
	try {
		puzzle.newGame(42);
		date = new Date(2026, 9, 27);
		puzzle.restorePlayDisplay();
		assert(revealedTiles(puzzle) == 1, "a running game's artwork changed");
		puzzle.newGame(42);
		assert(revealedTiles(puzzle) == 2, "new game did not refresh the date");
		assert(puzzle.rows.flatMap(row => row.slots).every((slot, i) => slot === slots[i]),
		       "refresh replaced slots or their event bindings");
		assert(puzzle.rows[3].slots[0].possibilityElems[1].children[0].children[0].alt == "Bat",
		       "cached possibilities did not refresh");
		date = new Date(2026, 9, 31);
		puzzle.newGame("20250101", true);
		assert(revealedTiles(puzzle) == 6, "a historical puzzle used its seed as the date");
		date = new Date(2026, 10, 1);
		assert(puzzle.startInvitedGame(), "invitation did not start");
		assert(revealedTiles(puzzle) == 0, "overnight invitation retained Halloween tiles");
		puzzle.showMultiplayerLobby();
		assert(puzzle.rows[3].slots.every((slot, value) =>
		       slot.singleElem.textContent == Logos.defaultSymbols[3][value]),
		       "clearing the board restored stale artwork");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("returning from a daily preview preserves the suspended game's symbols", function() {
	let date = new Date(2026, 9, 26);
	const puzzle = makePuzzle(6, false, () => Logos.symbolsForDate(date));
	try {
		puzzle.newGame(42);
		puzzle.saveDailyReturn();
		date = new Date(2026, 10, 1);
		puzzle.newGame("20261031", true, true);
		assert(revealedTiles(puzzle) == 0, "daily preview did not use the current date");
		assert(puzzle.restoreDailyReturn() && revealedTiles(puzzle) == 1,
		       "returning to an existing game changed its artwork");
		puzzle.newGame(42);
		assert(revealedTiles(puzzle) == 0, "a subsequent new game did not refresh");
	} finally {
		puzzle.stopTimer();
	}
});

Deno.test("image symbols preserve seeded puzzles and positions", function() {
	const classic = makePuzzle(6, false, Logos.defaultSymbols);
	const images = makePuzzle(6, false, imageTestSymbols());
	try {
		for (const seed of [0x12345678, 0x5be42607]) {
			classic.newGame(seed);
			images.newGame(seed);
			assert(puzzleSignature(classic) == puzzleSignature(images),
			       "artwork changed the seeded solution or clues");
			assert(JSON.stringify(classic.positionSnapshot()) ==
			       JSON.stringify(images.positionSnapshot()),
			       "artwork changed the initial position");
		}
	} finally {
		classic.stopTimer();
		images.stopTimer();
	}
});

Deno.test("image symbols render on the board, in clues, proofs, and the picker", function() {
	const symbols = imageTestSymbols();
	const puzzle = makePuzzle(6, false, symbols);
	const slot = puzzle.rows[3].slots[0];
	slot.newGame(0);
	assert(slot.singleElem.children[0].alt == "Red circle" &&
	       slot.singleElem.children[0].src == symbols[3][0].src &&
	       slot.singleElem.children[0].draggable === false &&
	       slot.possibilityElems[1].children[0].children[0].alt == "Blue square",
	       "board symbols did not render as named, non-draggable images");
	const clue = new ColumnClue(puzzle);
	clue.tRow = puzzle.rows[3];
	clue.bRow = puzzle.rows[4];
	clue.col = 0;
	clue.bRow.slots[0].newGame(0);
	clue.display = new FakeElement();
	clue.render();
	assert(clue.display.children[0].children[0].alt == "Red circle" &&
	       clue.display.children[1].textContent == "△",
	       "clues did not mix image and text symbols");
	const message = "\ue0003:0\ue001 is above \ue0004:0\ue001.";
	assert(Logos.proofMessageText(puzzle, message) == "Red circle is above △.",
	       "proof text did not use symbol names");
	const display = new FakeElement();
	Logos.renderProofMessage(puzzle, display, message, false);
	assert(display.children[0].children[1].children[0].alt == "Red circle" &&
	       display.children[0].children[3].textContent == "△",
	       "proof tiles did not mix image and text symbols");
	selectTileAction(puzzle, "place");
	puzzle.expandedSlot = slot;
	puzzle.renderSlotTray();
	assert(puzzle.slotTrayTiles[0].children[0].src == symbols[3][0].src &&
	       puzzle.slotTrayTiles[0].attributes["aria-label"] == "Choose Red circle" &&
	       puzzle.slotTrayTiles[2].textContent == symbols[3][2],
	       "picker did not render images with descriptive action labels");
});

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
	assert(puzzle.invitation.classList.contains("invitation-exiting"),
	       "exit fade did not release the static blur");
	assert(puzzle.paused && puzzle.timerTimeout === null && !puzzle.invitation.hidden,
	       "the clock started before the reveal completed");
	puzzle.setPageHidden(true);
	reveal();
	await Promise.resolve();
	assert(puzzle.invitation.hidden && puzzle.paused && puzzle.timerTimeout === null,
	       "a reveal in a hidden tab started the clock");
	assert(!puzzle.invitation.classList.contains("invitation-exiting"),
	       "completed reveal retained its exit state");
	puzzle.setPageHidden(false);
	assert(!puzzle.paused && puzzle.timerTimeout !== null && !puzzle.hClues.inert,
	       "returning to the revealed puzzle did not begin play");
	puzzle.stopTimer();
	delete puzzle.invitation.animate;
});

Deno.test("invitations work when the browser cannot animate backdrops", async function() {
	for (const accept of [true, false]) {
		const puzzle = makePuzzle(6);
		puzzle.say = function() {};
		puzzle.loadURLSeed("https://example.com/#seed=21");
		let reveal;
		puzzle.invitation.animate = function(frames, options) {
			if (options.pseudoElement)
				throw new SyntaxError("unsupported pseudo-element");
			return { finished: new Promise(resolve => { reveal = resolve; }), cancel() {} };
		};
		try {
			if (accept)
				assert(puzzle.startGame());
			else
				puzzle.closeInvitation();
			assert(puzzle.paused && puzzle.timerTimeout === null && !puzzle.invitation.hidden,
			       "the invitation did not wait for its dialog animation");
			reveal();
			await Promise.resolve();
			assert(puzzle.invitation.hidden &&
			       !puzzle.invitation.classList.contains("invitation-exiting"),
			       "the invitation remained after its animation finished");
			assert(accept ? !puzzle.paused && puzzle.timerTimeout !== null &&
			               puzzle.pendingSeed === undefined :
			               puzzle.timerTimeout === null && puzzle.pendingSeed === 0x21 &&
			               puzzle.invitationDeclined,
			       "the invitation did not complete the chosen action");
		} finally {
			puzzle.stopTimer();
			delete puzzle.invitation.animate;
		}
	}
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
	assert(!puzzle.invitation.classList.contains("invitation-exiting"),
	       "cancelled reveal retained its exit state");
	delete puzzle.invitation.animate;
});

Deno.test("declining an invitation preserves the unstarted puzzle for Options", function() {
	const puzzle = makePuzzle(6);
	let message;
	puzzle.say = function(text) { message = text; };
	puzzle.loadURLSeed("https://example.com/#seed=21");
	assert(!puzzle.invitation.hidden, "invitation lacked a modal backdrop");
	const before = puzzleSignature(puzzle);
	const identity = puzzle.gameIdentity;
	puzzle.closeInvitation();
	puzzle.updateActionControls();
	assert(puzzle.invitation.hidden &&
	       puzzle.seed === 0x21 && puzzle.pendingSeed === 0x21 &&
	       puzzle.paused && puzzle.hClues.inert && puzzle.vClues.inert &&
	       puzzle.timerTimeout === null && puzzleSignature(puzzle) === before,
	       "declining changed the board, started play, or reopened the invitation");
	assert(puzzle.timerText.textContent === "—" && puzzle.timer.classList.contains("unstarted") &&
	       puzzle.timer.title === "Invitation declined" && message === "Let this mystery remain.",
	       "declined invitation still looked like a running game");
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	assert(puzzle.options.querySelector("#start-game-button").value === "Start");
	puzzle.playSeed();
	assert(puzzle.gameIdentity === identity && puzzleSignature(puzzle) === before &&
	       puzzle.pendingSeed === undefined && !puzzle.paused && puzzle.timerTimeout !== null,
	       "Options did not start the preserved puzzle");
	assert(!puzzle.timer.classList.contains("unstarted") && puzzle.timerText.textContent === "0:00",
	       "starting the declined puzzle did not restore its clock");
	puzzle.stopTimer();
	puzzle.loadURLSeed("https://example.com/#seed=21");
	const modals = document.modals;
	document.modals = [puzzle.invitation];
	try {
		puzzle.startGame();
		assert(puzzle.invitation.hidden && !puzzle.paused && puzzle.timerTimeout !== null,
		       "the invitation's own backdrop kept the started game paused");
	} finally {
		document.modals = modals;
		puzzle.stopTimer();
	}
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

Deno.test("the pre-game dash becomes a clock when a timed game starts", function() {
	const puzzle = makePuzzle(6);
	assert(!puzzle.timer.hidden && puzzle.timerText.textContent === "—",
	       "the initial board did not show a dash");
	puzzle.newGame(1, true);
	assert(puzzle.timerText.textContent === "—" && puzzle.timerTimeout === null,
	       "the invitation showed a running clock");
	puzzle.startGame();
	assert(puzzle.timerText.textContent === "0:00" && !puzzle.timer.classList.contains("unstarted"),
	       "accepting did not replace the dash with the clock");
	puzzle.stopTimer();
	puzzle.newGame(1);
	assert(!puzzle.timer.hidden && puzzle.timerTimeout !== null,
	       "a timed game did not reveal the timer");
	puzzle.stopTimer();
	puzzle.say("");
});

Deno.test("a false placement loses the game", function() {
	const puzzle = makePuzzle(1);
	puzzle.continueAfterLoss = false;
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
	assert(slot.possibilityElems[discarded].className.split(" ").includes(
	       "dead-possibility"), "reveal restored a discarded possibility");

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
	assert(!sources[0].stopped,
	       "a repeated effect interrupted the previous sound");
	assert(gains[0].gain.value == 0.55,
	       "buffer playback did not apply the sample volume");

	puzzle.soundBuffers.place = {};
	puzzle.playSampleSound("place");
	assert(!sources[1].stopped && sources[2].started,
	       "a different effect interrupted the discard sound");
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
	assert(puzzle.sounds.length == 1 && puzzle.sounds[0] == "place",
	       "placement chain did not make only one place sound");
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
	assert(puzzle.sounds.length == 1 && puzzle.sounds[0] == "place",
	       "row singleton did not make only one place sound");
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

Deno.test("native dialog cancellation uses the application close path", function() {
	const puzzle = makePuzzle(1);
	let prevented = 0;
	const cancel = { preventDefault() { prevented++; } };
	puzzle.openSlotTray(puzzle.rows[0].slots[0]);
	assert(puzzle.slotTray.open);
	puzzle.slotTray.listeners.cancel(cancel);
	assert(puzzle.slotTray.hidden && !puzzle.slotTray.open && !puzzle.expandedSlot && prevented == 1,
	       "cancellation did not close the expanded tile tray");

	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	assert(puzzle.options.open && puzzle.paused);
	puzzle.options.listeners.cancel(cancel);
	assert(puzzle.options.hidden && !puzzle.options.open && !puzzle.paused && prevented == 2,
	       "cancellation did not close Options and resume play");
	puzzle.stopTimer();
});

Deno.test("dialog backdrop dismissal ignores panel padding", function() {
	const puzzle = makePuzzle(1);
	puzzle.options.hidden = true;
	puzzle.toggleOptions();
	puzzle.options.getBoundingClientRect = () => ({ left: 10, top: 10, right: 100, bottom: 100 });
	puzzle.options.listeners.click({ target: puzzle.options, clientX: 12, clientY: 12 });
	assert(puzzle.options.open, "a padding click closed the dialog");
	puzzle.options.listeners.click({ target: puzzle.options, clientX: 2, clientY: 2 });
	assert(!puzzle.options.open && !puzzle.paused, "a backdrop click did not resume play");
	delete puzzle.options.getBoundingClientRect;
	puzzle.stopTimer();
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
	puzzle.startTimer();
	document.hidden = true;
	document.listeners.visibilitychange();
	assert(puzzle.pageHidden && puzzle.paused &&
	       puzzle.timerTimeout === null,
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

Deno.test("a loss continues as a Zen game by default", function() {
	localStorage.removeItem("continueAfterLoss");
	localStorage.removeItem("practiceMode");
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	assert(puzzle.continueAfterLoss &&
	       puzzle.options.querySelector("#continue-after-loss").checked,
	       "continuing after loss was not enabled by default");
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
	       localStorage.getItem("continueAfterLoss") === null,
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
