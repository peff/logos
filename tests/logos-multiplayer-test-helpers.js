/* Session fixtures shared by multiplayer suites; no test registration. */
import { Logos, makePuzzle } from "./logos-test-helpers.js";
import "../friends/logos-multiplayer.js";
import "../friends/logos-webrtc.js";

const {
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	encodeSignal,
	normalizePlayerName,
} = globalThis.LogosFriends;

function assert(condition, message) {
	if (!condition)
		throw new Error(message || "assertion failed");
}

function boardState(puzzle) {
	return JSON.stringify({
		gameOver: puzzle.gameOver,
		rows: puzzle.rows.map(row => row.slots.map(slot => ({
			single: slot.single,
			possible: slot.possible,
		}))),
	});
}

function makeSession(role, playerId, symbols = Logos.defaultSymbols) {
	const puzzle = makePuzzle(6, true, symbols);
	const session = new MultiplayerSession(puzzle, { role, playerId });
	return { puzzle, session };
}

function stopAll(...games) {
	for (const game of games) {
		game.session.leave();
		game.puzzle.stopTimer();
		game.puzzle.say("");
	}
}

function wrongMove(puzzle, rowStart = 0) {
	for (let offset = 0; offset < puzzle.rows.length; offset++) {
		const row = puzzle.rows[(rowStart + offset) % puzzle.rows.length];
		for (const slot of row.slots) {
			if (slot.single)
				continue;
			for (let value = 0; value < slot.possible.length; value++)
				if (value != slot.value && slot.possible[value])
					return { slot, value };
		}
	}
	throw new Error("no wrong move is available");
}

function captureMultiplayerRuns(game) {
	const runs = [];
	game.puzzle.recordOutcome = async (outcome, run) => {
		assert(outcome == run.outcome, "result outcome differs from saved run");
		runs.push(structuredClone(run));
		return true;
	};
	return runs;
}

function finishSharedPuzzle(game) {
	for (const row of game.puzzle.rows)
		for (const slot of row.slots)
			if (!slot.single)
				game.puzzle.requestTileAction(slot, slot.value, "place");
}

export {
	InMemoryMultiplayerNetwork, MultiplayerSession,
	WebRTCGuestTransport, WebRTCHostTransport,
	decodeSignal, encodeSignal, normalizePlayerName, assert, boardState,
	makeSession, stopAll, wrongMove, captureMultiplayerRuns, finishSharedPuzzle,
};
