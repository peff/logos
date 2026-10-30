import { mock } from "node:test";
import { Logos } from "./helpers.js";
import {
	InMemoryMultiplayerNetwork, assert, boardState, makeSession, stopAll,
	wrongMove,
} from "./multiplayer-helpers.js";

async function waitForConflictRewind(puzzle, timers) {
	for (let i = 0; (puzzle.supposeRewindTimer !== null || puzzle.actionController?.branchForPlayer()?.rewinding) && i < 60; i++)
		await timers.tick(50);
	assert(puzzle.supposeRewindTimer === null && !puzzle.actionController?.branchForPlayer()?.rewinding, "conflict rewind did not finish");
}

Deno.test("multiplayer suppositions stay private and incorporate shared moves when rewound", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const before = boardState(p);
		p.enterSuppose();
		const move = wrongMove(p);
		p.requestTileAction(move.slot, move.value, "place");
		assert(p.suppose && !host.puzzle.suppose);
		assert(boardState(p) == before && host.session.revision == 0);
		const root = p.suppose;
		p.enterSuppose();
		const row = p.rows.indexOf(move.slot.row);
		const column = move.slot.row.slots.indexOf(move.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], move.value, "remove");
		assert(p.suppose.parent == root, "shared update closed a private branch");
		assert(!(root.domains[row][move.value] & (1 << column)));
		assert(move.slot.row.elem.classList.contains("pencil-conflict"), "conflict was not highlighted");
		p.leaveSuppose();
		p.moveSuppose(-1);
		assert(!(root.domains[row][move.value] & (1 << column)), "rewind resurrected a shared discard");
		assert(!move.slot.row.elem.classList.contains("pencil-conflict"));
		p.leaveSuppose();
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer applies private moves through the host and skips redundant moves", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "remove");
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.enterSuppose();
		host.session.commitAction("host", "in-flight", { type: "remove", row, column, value: a.value });
		assert(p.suppose && !a.slot.possible[a.value]);
		await p.acceptSuppose();
		assert(!p.suppose && !b.slot.possible[b.value]);
		assert(host.puzzle.suppose, "accepting a guest branch closed the host branch");
		assert(boardState(p) == boardState(host.puzzle));
		assert(host.session.history.at(-1).action.type == "remove");
		guest.session.receiveSync(host.session.syncMessage());
		assert(boardState(p) == boardState(host.puzzle), "batch did not survive resync");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer branch application stops at a mistake in Zen mode", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.rules.practiceMode = true;
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "remove");
		await p.acceptSuppose();
		assert(p.losses == 1 && host.puzzle.losses == 1);
		assert(b.slot.possible[b.value], "moves continued after a mistake");
		assert(host.session.history.length == 1 && host.session.history[0].action.type == "place");
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("rejecting a multiplayer supposition shares only the inverse assumption", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = host.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "remove");
		p.rejectSuppose();
		assert(!p.suppose && !a.slot.possible[a.value] && b.slot.possible[b.value]);
		assert(host.session.revision == 1 && boardState(p) == boardState(guest.puzzle));
		assert(p.supposeResult);
		assert(!guest.puzzle.supposeResult, "unrelated player saw a rejection result");
		p.requestTileAction(b.slot, b.slot.value, "place");
		assert(!p.supposeResult && p.supposeControls.hidden);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("branch batches tolerate intervening moves but validate the entire request", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "remove");
		let pending;
		guest.session.connectHost(message => { if (message.type == "branch-action") pending = message; });
		await p.acceptSuppose();
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		assert(pending.version < host.session.branchForPlayer("guest").version && host.session.revision == 1);
		host.session.receive("guest", pending);
		assert(p.suppose && !guest.session.pendingSuppose, "stale Apply was not retained for review");
		guest.session.connectHost(message => host.session.receive("guest", message));
		await p.acceptSuppose();
		assert(host.session.revision == 2 && !b.slot.possible[b.value]);
		assert(boardState(p) == boardState(host.puzzle));
		const before = boardState(p);
		for (const moves of [[null], [{ type: "place", row: 99, column: 0, value: 0 }],
			[{ type: "suppose-apply", moves: [], clues: [] }]]) {
			host.session.receive("guest", { type: "command", gameId: host.session.gameId,
				commandId: "bad-" + JSON.stringify(moves), expectedRevision: 2,
				action: { type: "suppose-apply", moves, clues: [] } });
			assert(host.session.revision == 2 && boardState(host.puzzle) == before);
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("branch application retains and locks the exploration until its own acknowledgment", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const branch = p.suppose;
		const commands = [];
		guest.session.connectHost(message => commands.push(message));
		await p.acceptSuppose();
		assert(p.suppose === branch && branch.pending);
		await p.acceptSuppose();
		p.requestTileAction(b.slot, b.value, "remove");
		p.moveSuppose(-1);
		p.rejectSuppose();
		p.leaveSuppose();
		assert(commands.length == 1 && branch.position == 1 && branch.history.length == 2);
		assert(p.supposeControls.querySelector(".suppose-accept").disabled);
		const move = wrongMove(host.puzzle, 2);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(p.suppose === branch && branch.pending, "another player's commit cleared the branch");
		host.session.receive("guest", commands[0]);
		assert(p.suppose && !guest.session.pendingSuppose, "stale Apply did not unlock the saved branch");
		guest.session.connectHost(message => host.session.receive("guest", message));
		await p.acceptSuppose();
		assert(!p.suppose && !guest.session.pendingSuppose && !a.slot.possible[a.value]);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("a host proof rejects normal moves and retains a rejected branch for retry", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		let a = wrongMove(p);
		/* The applicability gate only needs the presence of a proof. */
		host.puzzle.proof = {};
		p.requestTileAction(a.slot, a.value, "remove");
		assert(host.session.revision == 0 && guest.session.lastRejection);
		a = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const branch = p.suppose;
		await p.acceptSuppose();
		assert(p.suppose === branch && !branch.pending && !guest.session.pendingSuppose);
		assert(branch.history.length == 2 && branch.position == 1);
		assert(!p.supposeControls.querySelector(".suppose-accept").disabled);
		host.puzzle.proof = null;
		await p.acceptSuppose();
		assert(!p.suppose && host.session.revision == 1);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		host.puzzle.proof = null;
		stopAll(host, guest);
	}
});

Deno.test("resync preserves nested explorations and recovers a missed branch acknowledgment", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const root = p.suppose;
		p.enterSuppose();
		const nested = p.suppose;
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.suppose === nested && nested.parent === root);
		await p.acceptSuppose();
		host.session.peers.set("guest", () => {});
		await p.acceptSuppose();
		assert(p.suppose === root && root.pending && host.session.revision == 1);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!p.suppose && !guest.session.pendingSuppose);
		assert(boardState(p) == boardState(host.puzzle));
		p.enterSuppose();
		host.session.start(0x12345678);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!p.suppose, "replacement game retained an obsolete branch");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("private suppositions clear outgoing hover but still receive other players' highlights", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const target = { row: 0, column: 1, value: 2 };
		for (const [explorer, other] of [[host, guest], [guest, host]]) {
			explorer.session.requestHover(target);
			assert(other.session.hovers.has(explorer.session.playerId));
			explorer.puzzle.enterSuppose();
			assert(!other.session.hovers.has(explorer.session.playerId), "entering kept a shared highlight");
			explorer.session.requestHover(target);
			explorer.session.requestHover({ clue: explorer.puzzle.clues.findIndex(clue => clue.displayType) });
			assert(!other.session.hoverForPlayer(explorer.session.playerId), "private hover escaped");
			other.session.requestHover(target);
			assert(explorer.session.hovers.has(other.session.playerId), "incoming highlight was suppressed");
			explorer.puzzle.leaveSuppose();
			explorer.session.requestHover(target);
			assert(other.session.hovers.has(explorer.session.playerId), "hover did not resume");
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("branch participants share hover highlights without leaking to other views", function() {
	for (const controllerIsHost of [true, false]) {
		const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
		const watcher = makeSession("guest", "bob"), outsider = makeSession("guest", "carol");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.start(0x12345678);
			for (const game of [guest, watcher, outsider]) network.addGuest(game.session);
			const owner = controllerIsHost ? host : guest, other = controllerIsHost ? guest : host;
			const target = { row: 0, column: 1, value: 2 };
			owner.puzzle.enterSuppose();
			const branchId = owner.session.branchForPlayer().id;
			watcher.session.joinSuppose(branchId);
			other.session.joinSuppose(branchId);
			outsider.puzzle.enterSuppose();
			for (const sender of [owner, watcher, other]) {
				sender.session.requestHover(target);
				for (const receiver of [owner, watcher, other])
					assert(receiver.session.hoverForPlayer(sender.session.playerId)?.value === 2,
					       "branch participant missed a tile highlight");
				assert(!outsider.session.hovers.has(sender.session.playerId), "branch hover was sent to an outsider");
			}
			const clue = owner.puzzle.clues.findIndex(clue => clue.displayType);
			watcher.session.requestHover({ clue });
			assert(owner.session.hoverForPlayer("bob")?.clue === clue);
			const move = wrongMove(owner.puzzle);
			owner.puzzle.requestTileAction(move.slot, move.value, "remove");
			assert(owner.session.hoverForPlayer("bob")?.clue === clue, "branch update cleared watcher hover");
			watcher.puzzle.leaveSuppose();
			assert(!owner.session.hoverForPlayer("bob"), "departed watcher kept a branch highlight");
			assert(!watcher.session.hoverForPlayer(owner.session.playerId), "leaving exposed branch highlights");
			watcher.session.requestHover(target);
			assert(owner.session.hoverForPlayer("bob")?.value === 2, "shared-board pointing no longer reaches suppositions");
			host.session.receive("bob", { type: "hover", gameId: host.session.gameId, branchId, target: { clue } });
			assert(owner.session.hoverForPlayer("bob")?.value === 2, "stale branch hover was accepted");
			owner.puzzle.leaveSuppose();
			other.puzzle.leaveSuppose();
			for (const game of [host, guest, watcher, outsider]) {
				assert(!game.session.hoverForPlayer(owner.session.playerId), "closing branch retained owner hover");
				assert(!game.session.hoverForPlayer(other.session.playerId), "closing branch retained watcher hover");
			}
		} finally {
			stopAll(host, guest, watcher, outsider);
		}
	}
});

Deno.test("shared conflicts offer a rewind that preserves earlier deductions and discards the suffix", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "place");
		p.requestTileAction(c.slot, c.value, "remove");
		const state = p.suppose;
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
		const row = p.rows.indexOf(b.slot.row), column = b.slot.row.slots.indexOf(b.slot);
		p.sounds.length = 0;
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], b.value, "remove");
		assert(state.sharedConflicts[row]);
		const description = p.supposeControls.querySelector(".suppose-assumption");
		const title = p.supposeControls.querySelector(".proof-position");
		assert(description.textContent.startsWith("Discard "), "later deduction lost its description");
		assert(title.textContent.endsWith(" · Conflict"));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 1);
		p.moveSuppose(-1);
		assert(description.textContent.startsWith("Another player discarded "));
		p.moveSuppose(1);
		p.reconcileSuppose();
		assert(description.textContent.startsWith("Discard "));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 1,
			"history navigation or repeated reconciliation replayed the alert");
		assert(state.sharedConflictMessages[row + ":" + b.value + ":" + column].startsWith("Another player discarded "));
		assert(state.sharedConflictMessages[row + ":" + b.value + ":" + column].endsWith("from column " + (column + 1) + "; you had placed it there."));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict-discarded"));
		assert(!p.supposeControls.querySelector(".suppose-rewind").hidden);
		assert(p.supposeRewindTarget().position == 1);
		assert(p.supposeControls.querySelector(".suppose-accept").hidden);
		assert(p.supposeControls.querySelector(".suppose-reject").hidden);
		assert(p.supposeButton.disabled);
		const before = JSON.stringify(state);
		const next = wrongMove(p, 3);
		p.requestTileAction(next.slot, next.value, "remove");
		const clue = p.clues.find(clue => clue.active && clue.display);
		p.requestClueAction(clue, false);
		p.enterSuppose();
		await p.acceptSuppose();
		p.rejectSuppose();
		assert(p.suppose === state && JSON.stringify(state) == before,
			"conflicted exploration accepted an edit, nested branch, apply, or reject");
		assert(host.session.revision == 1, "conflicted exploration sent a shared move");
		state.pending = true;
		p.rewindSupposeConflict();
		assert(state.position == 3 && state.history.length == 4);
		state.pending = false;
		p.paused = true;
		p.rewindSupposeConflict();
		assert(state.position == 3 && state.history.length == 4);
		p.paused = false;
		p.moveSuppose(-2);
		assert(!title.textContent.includes("Conflict"));
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
		p.moveSuppose(2);
		p.rewindSupposeConflict();
		await waitForConflictRewind(p, timers);
		assert(p.suppose === state && state.position == 1 && state.history.length == 2);
		assert(!state.sharedConflicts.some(Boolean));
		assert(!b.slot.row.elem.classList.contains("pencil-conflict"));
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(!b.slot.possible[b.value], "rewind undid a shared move");
		assert(!p.supposeControls.querySelector(".suppose-accept").hidden);
		assert(!p.supposeControls.querySelector(".suppose-reject").hidden);
		assert(!p.supposeButton.disabled);
		p.moveSuppose(1);
		assert(state.position == 1, "discarded suffix remained accessible");
		assert(host.session.revision == 1 && boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("conflict rewind can return from a nested branch to its enclosing supposition", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		const root = p.suppose;
		p.enterSuppose();
		p.requestTileAction(b.slot, b.value, "remove");
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.supposeRewindTarget().state === root);
		p.rewindSupposeConflict();
		assert(p.suppose.parent === root && p.suppose.position === 0, "nested steps were skipped");
		await waitForConflictRewind(p, timers);
		assert(p.suppose === root && !root.assumption && root.position == 0 && root.history.length == 1);
		assert(!root.sharedConflicts.some(Boolean));
		assert(!p.rows[row].slots[column].possible[a.value]);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("private row contradictions are not attributed to unrelated shared moves", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		/* Make an intrinsically contradictory row, as tentative deductions can. */
		const branch = host.session.branchForPlayer("guest");
		const model = host.puzzle.supposeModel(branch.state);
		model.suppose.domains[0][0] = 0;
		model.saveSupposeStep();
		host.session.saveBranchState(branch, model);
		host.session.branchesChanged();
		const a = wrongMove(host.puzzle, 1);
		host.puzzle.requestTileAction(a.slot, a.value, "remove");
		assert(p.rows[0].elem.classList.contains("pencil-conflict"));
		assert(!p.suppose.sharedConflicts.some(Boolean));
		assert(!p.supposeRewindTarget());
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("conflicting shared placements stay visible and later moves survive backing out", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(host.puzzle, 1);
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.slot.value, "remove");
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.slot.value, "place");
		assert(a.slot.single && !a.slot.singleElem.hidden);
		assert(a.slot.singleElem.classList.contains("suppose-conflict"));
		assert(p.suppose.sharedConflictMessages[row + ":" + a.slot.value + ":" + column].startsWith("Another player placed "));
		assert(p.suppose.sharedConflictMessages[row + ":" + a.slot.value + ":" + column].endsWith("in column " + (column + 1) + "; you had discarded it there."));
		assert(!a.slot.singleElem.classList.contains("suppose-conflict-discarded"));
		assert(!a.slot.elem.classList.contains("suppose-placed"), "shared placement rendered as tentative");
		host.puzzle.requestTileAction(b.slot, b.value, "remove");
		assert(boardState(p) == boardState(host.puzzle), "conflict stopped later shared moves");
		assert(a.slot.singleElem.classList.contains("suppose-conflict"), "later update erased the marker");
		guest.session.receiveSync(host.session.syncMessage());
		const slot = p.rows[row].slots[column];
		assert(slot.singleElem.classList.contains("suppose-conflict"), "resync lost the conflicting tile");
		p.leaveSuppose();
		assert(slot.single && !slot.singleElem.hidden);
		assert(!slot.singleElem.classList.contains("suppose-conflict"));
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared placements keep displayed symbols correct across suppose navigation and resync", function() {
	for (const ownerIsHost of [false, true]) for (const family of [0, 3])
	for (const arriveRewound of [false, true]) {
		const symbols = Logos.symbolsForDate(new Date(2026, 9, 31));
		const host = makeSession("host", "host", symbols);
		const guest = makeSession("guest", "alice", symbols);
		const watcher = makeSession("guest", "bob", symbols);
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			network.addGuest(watcher.session);
			const owner = ownerIsHost ? host : guest, other = ownerIsHost ? guest : host;
			const p = owner.puzzle, move = wrongMove(p, family);
			const row = p.rows.indexOf(move.slot.row), column = move.slot.row.slots.indexOf(move.slot);
			assert(row === family, "fixture missed the requested symbol family");
			p.enterSuppose();
			p.requestTileAction(move.slot, move.value, "place");
			const later = wrongMove(p, 1);
			p.requestTileAction(later.slot, later.value, "remove");
			watcher.session.joinSuppose(owner.session.branchForPlayer().id);
			const check = () => {
				assert(JSON.stringify(p.supposeSnapshot()) === JSON.stringify(watcher.puzzle.supposeSnapshot()));
				for (const game of [owner, watcher])
					for (const [r, row] of game.puzzle.rows.entries())
						for (const [c, slot] of row.slots.entries()) {
							const value = slot.single ? slot.value :
								game.puzzle.suppose.domains[r].findIndex(bits => bits === (1 << c));
							assert(slot.singleElem.hidden === (value < 0), "wrong tile visibility");
							if (value < 0) continue;
							const symbol = slot.symbols[value];
							if (typeof symbol === "string")
								assert(slot.singleElem.textContent === symbol, "stale text symbol");
							else {
								const image = slot.singleElem.children[0];
								assert(image.src === symbol.src && image.alt === symbol.label, "stale image symbol");
							}
						}
			};
			check();
			if (arriveRewound) { p.moveSuppose(-2); check(); }
			const real = other.puzzle.rows[row].slots[column];
			other.puzzle.requestTileAction(real, real.value, "place");
			assert(move.slot.single, "shared placement was not applied");
			check();
			for (const offset of [-2, 1, 1, -1, -1, 2]) {
				p.moveSuppose(offset);
				check();
			}
			for (const game of [guest, watcher]) {
				game.session.receiveSync(host.session.syncMessage());
				check();
			}
			p.moveSuppose(-2);
			check();
			p.moveSuppose(2);
			check();
		} finally {
			stopAll(host, guest, watcher);
		}
	}
});

Deno.test("later shared moves reveal additional conflicts in an already conflicting row", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p);
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		let b;
		for (const [c, slot] of a.slot.row.slots.entries())
			for (const [v, bits] of p.suppose.domains[row].entries())
				if (c != column && !slot.single && v != slot.value && (bits & (1 << c)) && bits != (1 << c))
					b ||= { slot, value: v, column: c };
		assert(b, "no independent second guess in the same row");
		p.requestTileAction(b.slot, b.value, "place");
		assert(p.suppose.position == 2);
		p.sounds.length = 0;
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[b.column], b.value, "remove");
		assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"), "second conflict was lost");
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 2);
		const description = p.supposeControls.querySelector(".suppose-assumption");
		assert(description.textContent.includes("from column " + (b.column + 1)));
		p.moveSuppose(-1);
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(description.textContent.includes("from column " + (column + 1)));
		p.moveSuppose(1);
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.rows[row].slots[b.column].possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 2, "resync repeated the alerts");
		p.rewindSupposeConflict();
		await waitForConflictRewind(p, timers);
		assert(p.suppose.position == 0 && p.suppose.history.length == 1);
		assert(!p.hasSupposeConflict() && !Object.keys(p.suppose.sharedConflictMessages).length);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared placement conflicts only with its supposed discard, not untouched candidates", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const row = p.rows.findIndex(row => row.slots.every(slot =>
			!slot.single && slot.possible[row.slots[3].value]));
		assert(row >= 0, "no row with all six candidates available");
		const slots = p.rows[row].slots, symbol = slots[3].value;
		p.enterSuppose();
		p.requestTileAction(slots[2], symbol, "remove");
		p.requestTileAction(slots[3], symbol, "remove");
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[3], symbol, "place");
		assert(p.suppose.conflictTiles[row][symbol] == (1 << 3));
		assert(slots[3].singleElem.classList.contains("suppose-conflict"));
		for (const column of [0, 1, 2, 4, 5])
			assert(!slots[column].possibilityElems[symbol].classList.contains("suppose-conflict"),
				"non-conflicting candidate was highlighted in column " + (column + 1));
		assert(Object.keys(p.suppose.sharedConflictMessages).length == 1);
		assert(p.supposeRewindTarget().position == 1);
		p.rewindSupposeConflict();
		assert(!p.hasSupposeConflict() && slots[3].single);
		assert(!slots[2].possible[symbol], "rewind lost an agreed discard");
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared placement hides conflict markers at superseded tentative placements", function() {
	for (const discardFirst of [false, true]) {
		const host = makeSession("host", "host");
		const guest = makeSession("guest", "guest");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			const p = guest.puzzle, a = wrongMove(p);
			const row = p.rows.indexOf(a.slot.row);
			const wrongColumn = a.slot.row.slots.indexOf(a.slot);
			const realColumn = a.slot.row.slots.findIndex(slot => slot.value == a.value);
			p.enterSuppose();
			p.requestTileAction(a.slot, a.value, "place");
			if (discardFirst) {
				host.puzzle.requestTileAction(host.puzzle.rows[row].slots[wrongColumn], a.value, "remove");
				assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
			}
			host.puzzle.requestTileAction(host.puzzle.rows[row].slots[realColumn], a.value, "place");
			assert(p.rows[row].slots[realColumn].singleElem.classList.contains("suppose-conflict"));
			const description = p.supposeControls.querySelector(".suppose-assumption").textContent;
			assert(description.startsWith("You placed "));
			assert(description.endsWith("in column " + (wrongColumn + 1) +
				"; another player placed it in column " + (realColumn + 1) + "."));
			for (const [column, slot] of p.rows[row].slots.entries())
				if (column != realColumn)
					assert(!slot.possibilityElems[a.value].classList.contains("suppose-conflict"),
						"superseded placement retained a visible conflict marker");
			assert(p.suppose.conflictTiles[row][a.value] & (1 << wrongColumn),
				"display filtering erased the earlier conflict evidence");
			p.rewindSupposeConflict();
			assert(!p.hasSupposeConflict() && p.rows[row].slots[realColumn].single);
		} finally {
			stopAll(host, guest);
		}
	}
});

Deno.test("suppose activity logs outer transitions and survives resync and late joins", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const actions = game => (game.session.recentActions.get("alice") || []).map(a => a.type);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		guest.puzzle.enterSuppose();
		guest.puzzle.acceptSuppose();
		guest.session.requestSync();
		assert(guest.puzzle.suppose, "resync lost the branch");
		network.addGuest(late.session);
		for (const game of [host, guest, late])
			assert(JSON.stringify(actions(game)) === '["suppose-enter"]',
			       "private moves, nesting or resync added log entries");
		guest.puzzle.leaveSuppose();
		for (const game of [host, guest, late])
			assert(JSON.stringify(actions(game)) === '["suppose-enter","suppose-leave"]');
		assert(host.session.revision === 0, "presence changed the board revision");
		host.session.receive("alice", { type: "suppose", gameId: host.session.gameId, active: false });
		host.session.receive("alice", { type: "suppose", gameId: host.session.gameId - 1, active: true });
		host.session.receive("unknown", { type: "suppose", gameId: host.session.gameId, active: true });
		assert(actions(host).length === 2, "duplicate or stale presence was logged");
		host.puzzle.enterSuppose();
		host.puzzle.leaveSuppose();
		for (const game of [host, guest, late])
			assert(game.session.recentActions.get("host").slice(-2).map(a => a.type).join() ===
			       "suppose-enter,suppose-leave");
		guest.puzzle.enterSuppose();
		host.session.start(42);
		assert(!host.session.branches.size && !actions(guest).length,
		       "new game retained old suppose activity");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("accepted suppose applications log departure before moves for every player", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const other = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		network.addGuest(other.session);
		for (const player of [host, guest]) {
			player.puzzle.enterSuppose();
			const move = wrongMove(player.puzzle);
			player.puzzle.requestTileAction(move.slot, move.value, "remove");
			await player.puzzle.acceptSuppose();
			for (const game of [host, guest, other])
				assert(game.session.recentActions.get(player.session.playerId).slice(-3)
				       .map(a => a.type).join() === "suppose-enter,suppose-leave,remove",
				       "branch exit was missing, duplicated or followed the replay");
		}
	} finally {
		stopAll(host, guest, other);
	}
});

Deno.test("rejected suppose applications do not log departure", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		host.puzzle.proof = {};
		await guest.puzzle.acceptSuppose();
		host.puzzle.proof = null;
		assert(guest.puzzle.suppose && !guest.puzzle.suppose.pending);
		for (const game of [host, guest])
			assert(game.session.recentActions.get("alice").map(a => a.type).join() === "suppose-enter");
		guest.puzzle.leaveSuppose();
		assert(host.session.recentActions.get("alice").at(-1).type === "suppose-leave");
	} finally {
		host.puzzle.proof = null;
		stopAll(host, guest);
	}
});

Deno.test("host-paced suppose replay pauses between moves and resumes for every player", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const wait = async ms => timers.tick(ms);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const moves = [wrongMove(p, 0), wrongMove(p, 1), wrongMove(p, 2)];
		p.enterSuppose();
		for (const move of moves)
			p.requestTileAction(move.slot, move.value, "remove");
		await p.acceptSuppose();
		assert(!p.suppose && !guest.session.pendingSuppose, "acceptance did not close the branch");
		assert(host.session.revision === 1 && guest.session.replay);
		assert(!moves[0].slot.possible[moves[0].value] && moves[1].slot.possible[moves[1].value]);
		await wait(100);
		assert(host.session.revision === 1, "the second move had no delay");
		guest.puzzle.togglePause();
		assert(host.puzzle.paused && guest.puzzle.paused);
		const paused = boardState(host.puzzle);
		network.addGuest(late.session);
		assert(late.session.replay && late.puzzle.paused, "late join lost replay or pause state");
		guest.session.requestSync();
		for (const game of [host, guest]) {
			game.puzzle.toggleAbout();
			game.puzzle.toggleAbout();
			assert(game.puzzle.paused, "closing a dialog resumed a shared pause");
		}
		await wait(400);
		for (const game of [host, guest, late])
			assert(boardState(game.puzzle) === paused && game.session.revision === 1,
			       "replay advanced while paused");
		late.puzzle.togglePause();
		assert(!host.puzzle.paused && !guest.puzzle.paused && !late.puzzle.paused);
		for (let i = 0; i < 20 && host.session.replay; i++) await wait(100);
		assert(!host.session.replay && host.session.revision === 3, "replay did not finish after resume");
		for (const game of [host, guest, late]) {
			assert(!game.session.replay && boardState(game.puzzle) === boardState(host.puzzle));
			assert(game.session.recentActions.get("alice").map(a => a.type).join() ===
			       "suppose-enter,suppose-leave,remove,pause,remove,remove");
		}
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("suppose replay blocks shared edits but permits pointing and private exploration", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		await p.acceptSuppose();
		const move = wrongMove(host.puzzle, 3);
		assert(host.session.requestTileAction(move.slot, move.value, "remove") === false);
		assert(guest.session.requestAction({ type: "hint", stage: 1 }) === false);
		host.session.receive("alice", { type: "command", gameId: host.session.gameId,
			commandId: "during-replay", expectedRevision: host.session.revision,
			action: { type: "remove", row: 3, column: move.slot.row.slots.indexOf(move.slot), value: move.value } });
		assert(host.session.revision === 1 && host.session.replay, "incoming command interrupted replay");
		host.session.requestHover({ type: "tile", row: 3, column: 0, value: 0 });
		assert(guest.session.hovers.has("host"), "pointing was blocked");
		host.puzzle.enterSuppose();
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(host.puzzle.suppose.position === 1);
		await host.puzzle.acceptSuppose();
		host.puzzle.rejectSuppose();
		assert(host.puzzle.suppose && host.session.revision === 1, "private Apply or Reject escaped the replay lock");
		host.session.advanceSupposeReplay();
		assert(!host.session.replay && host.session.revision === 2);
		assert(host.puzzle.suppose, "another player's replay closed private exploration");
		host.puzzle.leaveSuppose();
		assert(host.session.requestTileAction(move.slot, move.value, "remove"));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("replay acceptance survives missed messages and duplicate requests without restarting", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		let command;
		guest.session.connectHost(message => {
			if (message.type === "branch-action") command = message;
			host.session.receive("alice", message);
		});
		host.session.peers.set("alice", () => {});
		await p.acceptSuppose();
		assert(p.suppose.pending && host.session.revision === 1);
		host.session.peers.set("alice", message => guest.session.receive("host", message));
		guest.session.requestSync();
		assert(!p.suppose && guest.session.replay, "resync failed to recover acceptance");
		host.session.receive("alice", command);
		assert(host.session.revision === 1 && guest.session.replay, "duplicate restarted replay");
		host.session.advanceSupposeReplay();
		host.session.receive("alice", command);
		assert(host.session.revision === 2 && !guest.session.replay, "completed replay restarted");
		assert(boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("new games and leaving multiplayer cancel scheduled replay moves", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		for (const end of ["new-game", "leave"]) {
			guest.puzzle.enterSuppose();
			for (const row of [0, 1]) {
				const move = wrongMove(guest.puzzle, row);
				guest.puzzle.requestTileAction(move.slot, move.value, "remove");
			}
			await guest.puzzle.acceptSuppose();
			assert(host.session.replay && host.session.replayTimer !== null);
			if (end === "new-game") host.session.start(0x12345678);
			else host.session.leave();
			assert(!host.session.replay && host.session.replayTimer === null);
			const before = boardState(host.puzzle);
			await timers.tick(350);
			assert(boardState(host.puzzle) === before, "cancelled replay changed the board");
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("host and guest dialogs do not pause a shared replay", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(guest.puzzle, row);
			guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		}
		await guest.puzzle.acceptSuppose();
		host.puzzle.toggleAbout();
		guest.puzzle.toggleAbout();
		assert(!host.puzzle.paused && !guest.puzzle.paused && host.session.revision === 1);
		await timers.tick(350);
		assert(!host.session.replay && host.session.revision === 2,
		       "a dialog suspended the replay");
		host.puzzle.toggleAbout();
		guest.puzzle.toggleAbout();
		assert(!host.puzzle.paused && !guest.puzzle.paused);
		assert(boardState(host.puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("a mistake during paced replay stops later moves and clue dismissals, also in Zen", async function() {
	for (const zen of [false, true]) {
		const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.rules.practiceMode = zen;
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			const p = guest.puzzle;
			p.enterSuppose();
			const a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
			p.requestTileAction(a.slot, a.value, "remove");
			p.requestTileAction(b.slot, b.value, "place");
			p.requestTileAction(c.slot, c.value, "remove");
			const clue = p.clues.find(clue => clue.display && clue.active);
			p.requestClueAction(clue, false);
			await p.acceptSuppose();
			assert(host.session.replay && host.session.revision === 1);
			host.session.advanceSupposeReplay();
			assert(!host.session.replay && !guest.session.replay && host.session.revision === 2);
			assert(c.slot.possible[c.value], "replay continued after the mistake");
			assert(!host.session.history.some(commit => commit.action.type === "clue"),
			       "replay dismissed clues after the mistake");
			assert(p.losses === 1 && host.puzzle.losses === 1);
			assert(boardState(p) === boardState(host.puzzle));
		} finally {
			stopAll(host, guest);
		}
	}
});

Deno.test("an entirely redundant branch still acknowledges acceptance across resync", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		let command;
		guest.session.connectHost(message => {
			if (message.type === "branch-action") command = message;
		});
		await guest.puzzle.acceptSuppose();
		const action = { type: "remove", row: 0, column: move.slot.row.slots.indexOf(move.slot), value: move.value };
		host.session.requestAction(action);
		host.session.receive("alice", command);
		assert(guest.puzzle.suppose && !guest.session.pendingSuppose);
		await guest.puzzle.acceptSuppose();
		host.session.peers.set("alice", () => {});
		host.session.receive("alice", command);
		assert(host.session.revision === 1 && !host.session.replay && guest.puzzle.suppose.pending);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!guest.puzzle.suppose && !guest.session.pendingSuppose && !guest.session.replay);
		assert(boardState(host.puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("animated conflict rewind stops on pause and manual navigation", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const wait = async ms => timers.tick(ms);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, first = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(first.slot, first.value, "place");
		for (const row of [1, 2, 3]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		host.puzzle.requestTileAction(host.puzzle.rows[0].slots[first.slot.row.slots.indexOf(first.slot)],
			first.value, "remove");
		assert(p.suppose.position === 4 && p.supposeRewindTarget().position === 0);
		p.rewindSupposeConflict();
		assert(p.suppose.position === 3 && p.suppose.history.length === 4);
		await wait(100);
		assert(p.suppose.position === 3, "rewind had no delay");
		p.togglePause();
		assert(p.paused && p.supposeRewindTimer === null);
		await wait(350);
		assert(p.suppose.position === 3, "rewind continued while paused");
		p.togglePause();
		await wait(350);
		assert(p.suppose.position === 3, "rewind resumed without another click");
		p.rewindSupposeConflict();
		assert(p.suppose.position === 2 && p.suppose.history.length === 3);
		p.moveSuppose(-1);
		assert(p.suppose.position === 1 && p.supposeRewindTimer === null);
		await wait(350);
		assert(p.suppose.position === 1, "animation overrode manual navigation");
		p.rewindSupposeConflict();
		assert(p.suppose.position === 0 && p.suppose.history.length === 1);
		assert(!p.hasSupposeConflict() && p.supposeRewindTimer === null);
		assert(host.session.revision === 1 && boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("animated conflict rewind follows newly exposed earlier conflicts", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "place");
		p.requestTileAction(c.slot, c.value, "remove");
		const discard = move => host.puzzle.requestTileAction(
			host.puzzle.rows[p.rows.indexOf(move.slot.row)].slots[move.slot.row.slots.indexOf(move.slot)],
			move.value, "remove");
		discard(b);
		assert(p.supposeRewindTarget().position === 1);
		p.rewindSupposeConflict();
		assert(p.suppose.position === 2);
		discard(a);
		assert(p.supposeRewindTarget().position === 0);
		await waitForConflictRewind(p, timers);
		assert(p.suppose.position === 0 && p.suppose.history.length === 1);
		assert(!p.hasSupposeConflict() && host.session.revision === 2);
		assert(boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("leaving cancels branch rewind while resync follows the host animation", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		for (const exit of ["resync", "leave", "new-game"]) {
			const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1);
			p.enterSuppose();
			p.requestTileAction(a.slot, a.value, "place");
			p.requestTileAction(b.slot, b.value, "remove");
			host.puzzle.requestTileAction(host.puzzle.rows[0].slots[a.slot.row.slots.indexOf(a.slot)],
				a.value, "remove");
			p.rewindSupposeConflict();
			assert(p.suppose.position === 1 && guest.session.branchForPlayer().rewinding);
			if (exit === "resync") guest.session.requestSync();
			else if (exit === "leave") p.leaveSuppose();
			else host.session.start(0x12345678);
			assert(p.supposeRewindTimer === null);
			const state = p.suppose;
			await timers.tick(350);
			assert(p.suppose === state && (!state || state.position === (exit === "resync" ? 0 : 1)));
			p.leaveSuppose();
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("suppose redraws stay local while clue changes reach watchers", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		assert(guest.session.joinSuppose(host.session.branchForPlayer().id));
		const snapshot = host.puzzle.supposeSnapshot;
		let snapshots = 0;
		host.puzzle.supposeSnapshot = function() {
			snapshots++;
			return snapshot.call(this);
		};
		host.puzzle.renderSuppose();
		host.puzzle.restorePlayDisplay();
		host.session.updateBranchView();
		assert(snapshots === 0, "redrawing serialized branch state");

		const clue = host.puzzle.clues.find(clue => clue.active);
		const index = host.puzzle.clues.indexOf(clue);
		host.puzzle.toggleSupposeClue(clue);
		assert(guest.puzzle.suppose.dismissed.includes(index), "watcher missed clue dismissal");
		host.puzzle.toggleSupposeClue(clue);
		assert(!guest.puzzle.suppose.dismissed.includes(index), "watcher missed clue restoration");
		assert(snapshots === 0, "branch commands serialized the displayed client state");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("the host orders concurrent branch moves and rejects stale navigation and resolution", async function() {
	const host = makeSession("host", "host"), alice = makeSession("guest", "alice");
	const bob = makeSession("guest", "bob"), outsider = makeSession("guest", "outside");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		for (const game of [alice, bob, outsider]) network.addGuest(game.session);
		alice.puzzle.enterSuppose();
		const id = alice.session.branchForPlayer().id;
		bob.session.joinSuppose(id);
		const commands = [];
		for (const game of [alice, bob]) game.session.connectHost(message => {
			if (message.type === "branch-action") commands.push([game.session.playerId, message]);
		});
		const a = wrongMove(alice.puzzle, 0), b = wrongMove(bob.puzzle, 1);
		alice.puzzle.requestTileAction(a.slot, a.value, "remove");
		bob.puzzle.requestTileAction(b.slot, b.value, "remove");
		assert(commands.length === 2 && commands[0][1].version === commands[1][1].version);
		for (const [actor, command] of commands.splice(0)) {
			host.session.receive(actor, command);
			host.session.receive(actor, command);
		}
		assert(alice.puzzle.suppose.position === 2 && bob.puzzle.suppose.position === 2,
		       "independent concurrent moves were lost or duplicated");
		assert(host.session.revision === 0 && !host.puzzle.suppose);
		alice.puzzle.moveSuppose(-1);
		const clue = bob.puzzle.clues.find(c => c.active);
		bob.puzzle.toggleSupposeClue(clue);
		const oldNavigation = commands.shift(), clueEdit = commands.shift();
		host.session.receive(...clueEdit);
		host.session.receive(...oldNavigation);
		assert(alice.puzzle.suppose.position === 2, "stale navigation moved the shared cursor");
		bob.puzzle.toggleSupposeClue(clue);
		host.session.receive(...commands.shift());

		await alice.puzzle.acceptSuppose();
		bob.puzzle.enterSuppose();
		const apply = commands.shift(), nest = commands.shift();
		host.session.receive(...nest);
		host.session.receive(...apply);
		assert(alice.puzzle.suppose.parent && !alice.session.pendingSuppose && host.session.revision === 0,
		       "stale Apply resolved a different position");
		await bob.puzzle.acceptSuppose();
		host.session.receive(...commands.shift());
		assert(!alice.puzzle.suppose.parent);

		bob.puzzle.moveSuppose(-1);
		await alice.puzzle.acceptSuppose();
		const navigate = commands.shift(), oldApply = commands.shift();
		host.session.receive(...navigate);
		host.session.receive(...oldApply);
		assert(alice.puzzle.suppose.position === 1 && !alice.session.pendingSuppose);
		const before = JSON.stringify(host.session.branches.get(id));
		host.session.receive("outside", { ...oldApply[1], commandId: "forged" });
		assert(JSON.stringify(host.session.branches.get(id)) === before, "outsider edited a branch");

		await alice.puzzle.acceptSuppose();
		bob.puzzle.rejectSuppose();
		const winner = commands.shift(), loser = commands.shift();
		host.session.receive(...winner);
		host.session.receive(...loser);
		host.session.receive(...winner);
		assert(!alice.puzzle.suppose && !bob.puzzle.suppose && !host.session.branches.size);
		assert(host.session.revision === 1 && !host.session.replay,
		       "competing resolution applied more than one outcome");
	} finally { stopAll(host, alice, bob, outsider); }
});

Deno.test("Back out abandons a nested branch while leaving the group preserves it", async function() {
	const host = makeSession("host", "host"), alice = makeSession("guest", "alice");
	const bob = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(alice.session);
		network.addGuest(bob.session);
		alice.puzzle.enterSuppose();
		const id = alice.session.branchForPlayer().id;
		bob.session.joinSuppose(id);
		const a = wrongMove(alice.puzzle);
		alice.puzzle.requestTileAction(a.slot, a.value, "remove");
		bob.puzzle.enterSuppose();
		const abandoned = wrongMove(bob.puzzle, 2);
		bob.puzzle.requestTileAction(abandoned.slot, abandoned.value, "remove");
		alice.puzzle.leaveSuppose();
		assert(alice.puzzle.suppose && !bob.puzzle.suppose.parent && bob.puzzle.suppose.position === 1,
		       "Back out did not return the group to the enclosing branch");
		assert(bob.session.branchForPlayer().participants.length === 2);
		const column = abandoned.slot.row.slots.indexOf(abandoned.slot);
		assert(bob.puzzle.suppose.domains[2][abandoned.value] & (1 << column),
		       "Back out retained the abandoned deductions");
		assert(!alice.puzzle.supposeControls.querySelector(".suppose-exit").hidden);
		bob.puzzle.enterSuppose();
		const b = wrongMove(bob.puzzle, 1);
		bob.puzzle.requestTileAction(b.slot, b.value, "place");
		alice.puzzle.leaveSuppose(true);
		assert(!alice.puzzle.suppose && bob.puzzle.suppose.parent && bob.puzzle.suppose.position === 1);
		assert(bob.puzzle.supposeControls.querySelector(".proof-position").textContent === "· Step 1.1");
		assert(bob.puzzle.supposeControls.querySelector(".suppose-watchers").hidden);
		assert(bob.puzzle.supposeControls.querySelector(".suppose-exit").hidden);
		alice.session.joinSuppose(id);
		assert(bob.puzzle.supposeControls.querySelector(".proof-position").textContent === "· Step 1.1");
		assert(!bob.puzzle.supposeControls.querySelector(".suppose-exit").hidden);
		alice.puzzle.leaveSuppose(true);
		bob.puzzle.rejectSuppose();
		assert(!bob.puzzle.suppose.parent && bob.puzzle.suppose.position === 2);
		assert(host.session.revision === 0, "nested rejection affected the shared board");
		await bob.puzzle.acceptSuppose();
		host.session.advanceSupposeReplay();
		assert(host.session.revision === 2 && !host.session.branches.size);
	} finally { stopAll(host, alice, bob); }
});

Deno.test("equal participants share moves, navigation, nesting and resolution", async function() {
	for (const creatorIsHost of [true, false]) {
		const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
		const third = makeSession("guest", "bob");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			network.addGuest(third.session);
			const creator = creatorIsHost ? host : guest, peer = creatorIsHost ? guest : host;
			creator.puzzle.enterSuppose();
			const id = creator.session.branchForPlayer().id;
			assert(peer.session.joinSuppose(id));
			assert(third.session.joinSuppose(third.session.branchForPlayer(peer.session.playerId).id));
			for (const game of [host, guest, third]) {
				game.puzzle.renderSuppose();
				const entries = game.puzzle.supposeControls.querySelector(".suppose-watchers").querySelector(".suppose-watcher-names").children;
				const others = game.session.branchForPlayer().participants.filter(id => id !== game.session.playerId);
				assert(entries.length === others.length, "mini-roster included the local player or missed a participant");
				for (const [index, id] of others.entries()) {
					const player = game.session.players.find(player => player.id === id);
					assert(entries[index].querySelector(".suppose-participant-name").textContent === player.name);
					assert(entries[index].querySelector(".suppose-participant-color").style["background-color"] ===
					       globalThis.LogosFriends.playerColor(player), "mini-roster color differs from cursor color");
				}
			}
			const same = () => {
				const expected = JSON.stringify(creator.puzzle.supposeModel().serialize());
				for (const game of [peer, third])
					assert(JSON.stringify(game.puzzle.supposeModel().serialize()) === expected);
			};
			const a = wrongMove(peer.puzzle, 0), b = wrongMove(third.puzzle, 1);
			peer.puzzle.requestTileAction(a.slot, a.value, "remove");
			same();
			third.puzzle.enterSuppose();
			third.puzzle.requestTileAction(b.slot, b.value, "remove");
			same();
			for (const game of [host, guest, third]) {
				assert(game.puzzle.supposeControls.querySelector(".proof-position").textContent === "· Step 1.1");
				assert(!game.puzzle.supposeControls.querySelector(".suppose-accept").hidden);
				assert(!game.puzzle.supposeControls.querySelector(".proof-previous").disabled);
			}
			peer.puzzle.moveSuppose(-1);
			same();
			creator.puzzle.moveSuppose(1);
			same();
			await third.puzzle.acceptSuppose();
			same();
			assert(!peer.puzzle.suppose.parent && peer.puzzle.suppose.position === 2);
			creator.puzzle.leaveSuppose();
			assert(!creator.puzzle.suppose && peer.puzzle.suppose && third.puzzle.suppose);
			assert(peer.session.branchForPlayer().participants.length === 2);
			await peer.puzzle.acceptSuppose();
			assert(!third.puzzle.suppose && !host.session.branches.size);
			host.session.advanceSupposeReplay();
			assert(host.session.revision === 2 && boardState(host.puzzle) === boardState(third.puzzle));
		} finally { stopAll(host, guest, third); }
	}
});

Deno.test("watching requires the shared board and survives resync and late joins", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		const move = wrongMove(host.puzzle);
		host.puzzle.requestTileAction(move.slot, move.value, "place");
		const branchId = host.session.branchForPlayer().id;
		guest.puzzle.enterSuppose();
		assert(!guest.session.joinSuppose(branchId), "watching replaced a private branch");
		guest.puzzle.leaveSuppose();
		host.puzzle.togglePause();
		assert(!guest.session.joinSuppose(branchId));
		host.puzzle.togglePause();
		assert(guest.session.joinSuppose(branchId));
		guest.session.requestSync();
		assert(guest.session.viewingBranch === branchId && guest.puzzle.suppose.position === 1);
		network.addGuest(late.session);
		assert(late.session.branchForPlayer("alice").id === branchId);
		assert(late.session.joinSuppose(branchId));
		host.session.setPlayerName("Renamed");
		assert(guest.puzzle.supposeControls.querySelector(".suppose-watchers").querySelector(".suppose-watcher-names").querySelectorAll(".suppose-participant-name")
		       .some(name => name.textContent === "Renamed"), "mini-roster missed a name change");
		assert(guest.puzzle.supposeControls.querySelector(".proof-position").textContent.startsWith("· Step"));
		const before = JSON.stringify(host.session.branches.get(branchId).snapshot);
		host.session.receive("alice", { type: "branch-update", gameId: host.session.gameId,
			branchId, snapshot: guest.puzzle.supposeSnapshot() });
		assert(JSON.stringify(host.session.branches.get(branchId).snapshot) === before);
		const action = { type: "remove", row: 0, column: move.slot.row.slots.indexOf(move.slot), value: move.value };
		host.session.receive("alice", { type: "command", gameId: host.session.gameId,
			commandId: "watcher-edit", expectedRevision: 0, action });
		assert(host.session.revision === 0 && !!guest.session.branchForPlayer(), "watcher sent a shared edit");
		host.puzzle.leaveSuppose();
		guest.puzzle.leaveSuppose();
		late.puzzle.leaveSuppose();
		assert(!guest.puzzle.suppose && !late.puzzle.suppose && !host.session.branches.size);
		assert(!guest.session.joinSuppose(branchId), "historical fork remained joinable");
		host.session.receive("alice", { type: "branch-join", gameId: host.session.gameId, branchId });
		assert(!host.session.branches.size, "stale request resurrected a branch");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("resync refreshes watched state and roster together after missed updates", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		guest.session.joinSuppose(host.session.branchForPlayer().id);
		host.session.peers.set("alice", () => {});
		const move = wrongMove(host.puzzle);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		host.puzzle.enterSuppose();
		host.session.setPlayerName("Renamed");
		host.puzzle.togglePause();
		const expected = JSON.stringify(host.puzzle.supposeSnapshot());
		let refreshes = 0;
		guest.session.onPlayersChanged = function() {
			refreshes++;
			assert(guest.puzzle.paused, "roster refreshed before the shared pause was restored");
			assert(JSON.stringify(guest.puzzle.supposeSnapshot()) === expected,
			       "roster refreshed with an obsolete watched position");
			assert(guest.puzzle.supposeControls.querySelector(".proof-position").textContent ===
			       "· Nested");
		};
		guest.session.receiveSync(host.session.syncMessage());
		assert(refreshes === 1, "resync refreshed the roster more than once");
	} finally {
		guest.session.onPlayersChanged = () => {};
		stopAll(host, guest);
	}
});

Deno.test("watchers follow shared conflicts and every animated rewind step", async function() {
	using timers = mock.timers;
	timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p, 3), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "remove");
		host.session.joinSuppose(guest.session.branchForPlayer().id);
		/* A shared command already in flight can still contradict the branch. */
		host.session.commitAction("host", "conflict", {
			type: "remove", row: 3, column: a.slot.row.slots.indexOf(a.slot), value: a.value });
		assert(host.puzzle.hasSupposeConflict() && p.hasSupposeConflict());
		assert(JSON.stringify(host.puzzle.supposeSnapshot()) === JSON.stringify(p.supposeSnapshot()),
		       "watcher displayed a different conflict position");
		p.rewindSupposeConflict();
		assert(p.suppose.position === 1 && host.puzzle.suppose.position === 1);
		assert(JSON.stringify(host.puzzle.supposeSnapshot()) === JSON.stringify(p.supposeSnapshot()),
		       "watcher lost the conflict explanation when rewinding");
		await waitForConflictRewind(p, timers);
		assert(host.puzzle.suppose.position === 0 && !host.puzzle.hasSupposeConflict());
		assert(boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("applying a watched branch releases watchers before paced shared replay", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const third = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		network.addGuest(third.session);
		guest.puzzle.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(guest.puzzle, row);
			guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		}
		const branchId = guest.session.branchForPlayer().id;
		third.session.joinSuppose(branchId);
		host.puzzle.proof = {};
		await guest.puzzle.acceptSuppose();
		host.puzzle.proof = null;
		assert(guest.puzzle.suppose && !!third.session.branchForPlayer(), "rejected Apply closed the watched branch");
		await guest.puzzle.acceptSuppose();
		for (const game of [guest, third])
			assert(!game.puzzle.suppose && !game.session.viewingBranch && game.session.replay);
		assert(host.session.revision === 1 && !host.session.branches.size);
		host.session.advanceSupposeReplay();
		assert(host.session.revision === 2 && !third.session.replay);
		assert(third.session.recentActions.get("bob").map(action => action.type).join() === "suppose-enter,suppose-leave");
	} finally {
		host.puzzle.proof = null;
		stopAll(host, guest, third);
	}
});

Deno.test("watched branch membership closes on rejection, disconnect and replacement games", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const third = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		network.addGuest(third.session);
		for (const ending of ["reject", "new-game", "disconnect"]) {
			guest.puzzle.enterSuppose();
			const move = wrongMove(guest.puzzle);
			guest.puzzle.requestTileAction(move.slot, move.value, "place");
			third.session.joinSuppose(guest.session.branchForPlayer().id);
			if (ending === "reject") guest.puzzle.rejectSuppose();
			else if (ending === "new-game") host.session.start(0x12345678);
			else {
				host.session.removePeer("alice");
				assert(third.puzzle.suppose && third.session.branchForPlayer().participants.length === 1,
				       "creator departure closed the shared branch");
				third.puzzle.leaveSuppose();
			}
			assert(!third.puzzle.suppose && !third.session.viewingBranch && !host.session.branches.size);
		}
	} finally {
		stopAll(host, guest, third);
	}
});

Deno.test("pending watch requests block private entry until the host replies", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		const branchId = host.session.branchForPlayer().id;
		let request;
		guest.session.connectHost(message => { if (message.type === "branch-join") request = message; });
		assert(guest.session.joinSuppose(branchId));
		const move = wrongMove(host.puzzle);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(guest.session.joinRequest === branchId, "an unrelated branch update acknowledged the join");
		guest.puzzle.enterSuppose();
		assert(!guest.puzzle.suppose, "private entry raced with joining");
		host.puzzle.leaveSuppose();
		host.session.receive("alice", request);
		assert(!guest.session.joinRequest && !guest.puzzle.suppose);
		guest.puzzle.enterSuppose();
		assert(guest.puzzle.suppose, "rejected join left private entry locked");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("moves made before branch registration reach watchers and stale updates cannot resurrect branches", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const outbound = [];
		guest.session.connectHost(message => outbound.push(message));
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(!host.session.branchForPlayer("alice"));
		let update;
		while (outbound.length) {
			const message = outbound.shift();
			if (message.type === "branch-action") update = message;
			host.session.receive("alice", message);
		}
		const branchId = host.session.branchForPlayer("alice").id;
		assert(update && host.session.branches.get(branchId).snapshot.position === 1);
		host.session.joinSuppose(branchId);
		assert(host.puzzle.suppose.position === 1);
		guest.puzzle.leaveSuppose();
		while (outbound.length) host.session.receive("alice", outbound.shift());
		assert(host.puzzle.suppose, "creator departure closed the branch");
		host.puzzle.leaveSuppose();
		assert(!host.puzzle.suppose && !host.session.branches.size);
		host.session.receive("alice", update);
		assert(!host.session.branches.size, "stale update resurrected a branch");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("active fork entries survive later shared activity", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		const branchId = host.session.branchForPlayer().id;
		for (let i = 0; i < 16; i++) host.puzzle.togglePause();
		for (const game of [host, guest]) {
			const actions = game.session.recentActions.get("host");
			assert(actions.length === 12 && actions[0].type === "suppose-enter" &&
			       actions[0].branchId === branchId);
		}
		assert(guest.session.joinSuppose(branchId));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("client snapshots cannot overwrite host-owned branch history", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const branchId = guest.session.branchForPlayer().id;
		const version = host.session.branches.get(branchId).version;
		for (const invalid of [
			{ domains: [] }, { conflictDomains: [[1]] }, { sharedConflictMessages: [] },
			{ message: "\ue00099:99\ue001" }, { previousConflicts: { bad: 42 } },
		]) {
			host.session.receive("alice", { type: "branch-update", gameId: host.session.gameId, branchId,
				snapshot: { ...guest.puzzle.supposeSnapshot(), ...invalid } });
			assert(host.session.branches.get(branchId).version === version);
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("a delayed leave acknowledgment does not reopen the watched view", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.puzzle.enterSuppose();
		guest.session.joinSuppose(host.session.branchForPlayer().id);
		const requests = [];
		guest.session.connectHost(message => requests.push(message));
		guest.puzzle.leaveSuppose();
		assert(!guest.puzzle.suppose);
		const move = wrongMove(host.puzzle);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(!guest.puzzle.suppose, "a late snapshot reopened the watched view");
		for (const message of requests) host.session.receive("alice", message);
		assert(!guest.session.viewingBranch && !guest.session.leavingBranch);
		guest.puzzle.enterSuppose();
		assert(guest.puzzle.suppose, "leaving kept private entry locked");
	} finally {
		stopAll(host, guest);
	}
});
