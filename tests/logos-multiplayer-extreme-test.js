import {
	Logos, makePuzzle, exhaustPuzzleDeductions,
} from "./logos-test-helpers.js";
import {
	InMemoryMultiplayerNetwork, MultiplayerSession, assert, boardState,
	makeSession, stopAll, captureMultiplayerRuns, finishSharedPuzzle,
} from "./logos-multiplayer-test-helpers.js";

Deno.test("hosting an extreme solo puzzle shares its seed and mode", function() {
	const puzzle = makePuzzle(6, true);
	puzzle.newGame(0, false, false, true);
	const host = { puzzle, session: new MultiplayerSession(puzzle, { role: "host", playerId: "host" }) };
	const guest = makeSession("guest", "alice");
	try {
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		assert(guest.puzzle.extreme === true);
		const message = host.session.syncMessage();
		assert(message.seed === 0 && message.extreme === true);
		assert(!("extremeIndices" in message));
		const identity = guest.puzzle.gameIdentity;
		guest.session.receiveSync({ ...message, seed: 2 });
		assert(guest.puzzle.gameIdentity === identity && guest.session.ready);
		assert(!Logos.cluesSolve(guest.puzzle, guest.puzzle.clues));
		assert(Logos.countSolutions(guest.puzzle, guest.puzzle.clues) === 1);
		assert(boardState(puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("guests can start extreme games, replay moves and return to ordinary games", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		network.addGuest(guest.session);
		guest.puzzle.options.hidden = true;
		guest.puzzle.toggleOptions();
		guest.puzzle.setExtremeMode(true);
		guest.puzzle.options.querySelector("#game-seed").value = "0";
		guest.puzzle.playSeed();
		guest.puzzle.setExtremeMode(false);
		assert(host.puzzle.extreme && guest.puzzle.extreme);
		const slot = guest.puzzle.rows[0].slots[0];
		guest.puzzle.requestTileAction(slot, slot.value, "place");
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [guest, late]) {
			assert(game.puzzle.extreme === true);
			assert(boardState(game.puzzle) === boardState(host.puzzle));
			assert(!Logos.cluesSolve(game.puzzle, game.puzzle.clues));
			assert(Logos.countSolutions(game.puzzle, game.puzzle.clues) === 1);
			assert(await game.puzzle.recordOutcome("won") === false);
		}
		const identity = host.puzzle.gameIdentity;
		guest.session.requestNewGame(0, [999]);
		assert(host.puzzle.gameIdentity === identity);
		guest.session.requestNewGame(2, true);
		assert(host.puzzle.gameIdentity === identity, "seed without an extreme puzzle was accepted");
		assert(host.session.requestNewGame(0));
		for (const game of [host, guest, late]) {
			assert(!game.puzzle.extreme);
			assert(Logos.cluesSolve(game.puzzle, game.puzzle.clues));
		}
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("extreme clue assistance is shared and survives adoption, late joins and resync", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.newGame(0, false, false, true);
	exhaustPuzzleDeductions(puzzle);
	const host = { puzzle, session: new MultiplayerSession(puzzle, { role: "host", playerId: "host" }) };
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		network.addGuest(guest.session);
		guest.puzzle.hintAcknowledged = true;
		const count = host.puzzle.clues.length;
		guest.puzzle.explainLoss();
		assert(guest.puzzle.hintRequest.stalled && host.puzzle.clues.length === count);
		guest.puzzle.explainLoss();
		assert(guest.puzzle.hintRequest.stage === 2 && !host.puzzle.hintRequest);
		assert(host.session.history.at(-1).action.type === "hint" && host.puzzle.clues.length === count);
		guest.puzzle.explainLoss();
		assert(host.session.history.at(-1).action.type === "hint");
		assert(guest.puzzle.proof && !host.puzzle.proof);
		assert(guest.puzzle.proof.steps.at(-1).placements.every(bits => bits === 63));
		assert(host.puzzle.clues.length === count && !guest.puzzle.revealedClues.length);
		guest.puzzle.explainLoss();
		guest.puzzle.explainLoss();
		guest.puzzle.requestExtremeClue();
		assert(!guest.puzzle.proof);
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [host, guest, late]) {
			assert(game.puzzle.clues.length === count + 1 && game.puzzle.revealedClues.length === 1);
			assert(JSON.stringify(game.puzzle.positionSnapshot()) === JSON.stringify(host.puzzle.positionSnapshot()));
			assert(game.puzzle.practiceMode);
		}
		const revision = host.session.revision;
		guest.session.requestAction({ type: "reveal-clue", clue: guest.puzzle.revealedClues[0] });
		assert(host.session.revision === revision, "duplicate reveal was accepted");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("shared Extreme results retain mode, host time, and JSON-safe skull ratings", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "guest");
	const hostRuns = captureMultiplayerRuns(host), guestRuns = captureMultiplayerRuns(guest);
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x4c3f2a56, "host", true);
		network.addGuest(guest.session);
		host.puzzle.timerStarted = Date.now() - 45000;
		finishSharedPuzzle(host);
		assert(hostRuns.length === 1 && guestRuns.length === 1 &&
		       JSON.stringify(hostRuns) === JSON.stringify(guestRuns));
		const run = hostRuns[0];
		assert(run.extreme === true && run.multiplayer && run.elapsed >= 45000 &&
		       run.extremeDifficulty.version === 1 && run.extremeDifficulty.stalled &&
		       run.extremeDifficulty.level === null && !run.difficulty);
		guest.session.requestSync();
		assert(guestRuns.length === 1);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("random multiplayer starts use the requester’s Extreme preference", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "guest");
	try {
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		guest.puzzle.setExtremeMode(true);
		guest.puzzle.setRandomDifficulties([]);
		guest.puzzle.randomPuzzleSeed = extreme => {
			assert(extreme === true);
			return 0;
		};
		assert(guest.session.requestNewGame());
		assert(host.puzzle.extreme && guest.puzzle.extreme && !host.puzzle.extremeMode);
		const identity = host.puzzle.gameIdentity;
		guest.puzzle.options.hidden = false;
		guest.puzzle.options.querySelector("#game-seed").value = "2";
		guest.puzzle.playSeed();
		assert(host.puzzle.gameIdentity === identity && !guest.puzzle.options.hidden &&
		       guest.puzzle.options.querySelector("#seed-difficulty").textContent === "No Extreme variant for this seed.");
		assert(host.session.requestNewGame(0));
		assert(!guest.puzzle.extreme && guest.puzzle.extremeMode);
	} finally {
		guest.puzzle.setExtremeMode(false);
		guest.puzzle.setRandomDifficulties(["easy", "medium", "hard"]);
		stopAll(host, guest);
	}
});
