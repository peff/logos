/*
 * Transport-independent coordination for a host-authoritative Logos game.
 *
 * A transport calls receive() for incoming messages. The session itself only
 * needs functions which send messages to a named peer, which keeps WebRTC and
 * its offer/answer ceremony out of the game protocol.
 */

(function() {

function copyMessage(message) {
	return JSON.parse(JSON.stringify(message));
}

function actionFromSlot(puzzle, slot, value, type) {
	var row = puzzle.rows.indexOf(slot.row);
	var column = row < 0 ? -1 : slot.row.slots.indexOf(slot);
	return { type: type, row: row, column: column, value: value };
}

function slotForAction(puzzle, action) {
	if (!action || !Number.isInteger(action.row) ||
	    !Number.isInteger(action.column) ||
	    !Number.isInteger(action.value))
		return null;
	var row = puzzle.rows[action.row];
	if (!row)
		return null;
	return row.slots[action.column] || null;
}

function applicableAction(puzzle, action) {
	if (!action)
		return false;
	if (action.type == "clue")
		return Number.isInteger(action.clue) &&
			typeof action.active == "boolean" &&
			!!puzzle.clues[action.clue]?.display;
	if (action.type != "place" && action.type != "remove")
		return false;
	var slot = slotForAction(puzzle, action);
	return !!slot && !puzzle.gameOver && !puzzle.paused && !puzzle.proof &&
		action.value >= 0 && action.value < slot.possible.length &&
		!slot.single && slot.possible[action.value];
}

function applyAction(puzzle, action, playerAction) {
	if (action.type == "clue")
		return puzzle.applyClueAction(puzzle.clues[action.clue],
			action.active);
	var slot = slotForAction(puzzle, action);
	if (!slot)
		throw new Error("invalid multiplayer action coordinates");
	puzzle.applyTileAction(slot, action.value, action.type, {
		playerAction,
	});
}

class MultiplayerSession {
	constructor(puzzle, options) {
		options = options || {};
		this.puzzle = puzzle;
		this.role = options.role;
		this.playerId = options.playerId || this.role;
		this.playerName = options.playerName || this.playerId;
		this.onPlayersChanged = options.onPlayersChanged || function() {};
		this.players = this.role == "host" ? [{
			id: this.playerId, name: this.playerName, role: "host", state: "connected",
		}] : [];
		this.revision = 0;
		this.nextCommand = 1;
		this.seed = null;
		this.gameId = 0;
		this.rules = {
			practiceMode: options.practiceMode === undefined ?
				!!puzzle.practiceModePreference : !!options.practiceMode,
			continueAfterLoss: options.continueAfterLoss === undefined ?
				!!puzzle.continueAfterLoss : !!options.continueAfterLoss,
		};
		this.startedAt = null;
		this.clock = null;
		this.updatingTimer = false;
		this.lastClockBroadcast = null;
		this.history = [];
		this.committedCommands = new Map();
		this.peers = new Map();
		this.hostSender = null;
		this.ready = false;
		this.lastRejection = null;
		this.localRules = {
			practiceMode: puzzle.practiceModePreference,
			continueAfterLoss: puzzle.continueAfterLoss,
		};

		if (this.role != "host" && this.role != "guest")
			throw new Error("a multiplayer session must be host or guest");
		puzzle.setActionController(this);
		puzzle.showMultiplayerLobby();
		this.ready = this.role == "host";
	}

	start(seed) {
		if (this.role != "host")
			throw new Error("only the host can start a game");
		var wasReady = this.ready;
		this.ready = false;
		this.applyRoomRules();
		if (!this.puzzle.newGame(seed)) {
			this.ready = wasReady;
			return false;
		}
		this.applyRoomRules();
		this.seed = this.puzzle.seed;
		this.gameId++;
		this.startedAt = this.puzzle.timerStarted || Date.now();
		this.revision = 0;
		this.history = [];
		this.committedCommands.clear();
		this.puzzle.scoreEligible = false;
		this.ready = true;
		this.broadcast(this.syncMessage());
		this.onPlayersChanged(copyMessage(this.players));
		return true;
	}

	requestNewGame() {
		if (!this.ready)
			return false;
		if (this.role == "host")
			return this.startRandomGame();
		if (!this.hostSender)
			return false;
		this.hostSender({ type: "new-game", gameId: this.gameId });
		return true;
	}

	startRandomGame() {
		/* No selected difficulties means contemplation in single-player. */
		if (!this.puzzle.randomDifficulties.length) {
			this.puzzle.say("Choose a difficulty in Options before starting a shared game.");
			return false;
		}
		var seed = this.puzzle.randomPuzzleSeed();
		return seed !== null && this.start(seed);
	}

	receiveNewGame(from, message) {
		if (!this.ready || !this.peers.has(from))
			return;
		/* Coalesce requests made for the same game, including the lobby. */
		if (message.gameId !== this.gameId || !this.startRandomGame())
			this.sendTo(from, this.syncMessage());
	}

	addPeer(playerId, sender, playerName) {
		if (this.role != "host")
			throw new Error("only the host can add peers");
		this.peers.set(playerId, sender);
		this.players = this.players.filter(player => player.id != playerId);
		this.players.push({
			id: playerId, name: playerName || playerId, role: "guest", state: "connected",
		});
		if (this.ready)
			sender(this.syncMessage());
		this.playersChanged();
	}

	removePeer(playerId) {
		if (!this.peers.delete(playerId))
			return;
		this.players = this.players.filter(player => player.id != playerId);
		this.playersChanged();
	}

	setPlayerName(name) {
		this.playerName = name;
		if (this.role == "host") {
			this.players[0].name = name;
			this.playersChanged();
		}
	}

	setPeerState(playerId, state) {
		var player = this.players.find(player => player.id == playerId);
		if (this.role != "host" || !player || player.state == state)
			return;
		player.state = state;
		this.playersChanged();
	}

	playersChanged() {
		this.onPlayersChanged(copyMessage(this.players));
		if (this.role == "host")
			this.broadcast({ type: "players", players: copyMessage(this.players) });
	}

	receivePlayers(players) {
		if (!Array.isArray(players) || players.some(player =>
		    !player || typeof player.id != "string" || typeof player.name != "string" ||
		    !["host", "guest"].includes(player.role) ||
		    !["connected", "interrupted"].includes(player.state)))
			return;
		this.players = copyMessage(players);
		this.onPlayersChanged(copyMessage(this.players));
	}

	connectHost(sender) {
		if (this.role != "guest")
			throw new Error("only a guest connects to a host");
		this.hostSender = sender;
	}

	requestPause(paused) {
		if (this.role != "guest" || !this.ready || !this.hostSender)
			return false;
		this.hostSender({ type: "pause", seed: this.seed, paused });
		return true;
	}

	receivePause(from, message) {
		if (!this.ready || !this.peers.has(from) || message.seed != this.seed ||
		    typeof message.paused != "boolean")
			return;
		/* Explicit states make simultaneous or duplicate requests harmless. */
		if (this.puzzle.manualPaused != message.paused)
			this.puzzle.togglePause();
		this.sendTo(from, { type: "clock", clock: this.clockState() });
	}

	requestTileAction(slot, value, type) {
		if (this.role == "guest" && this.clock?.paused)
			return false;
		/* Tentative marks remain private to each player's board. */
		if (type == "pencil-select" || type == "pencil-remove")
			return this.puzzle.applyTileAction(slot, value, type);
		return this.requestAction(actionFromSlot(this.puzzle, slot, value, type));
	}

	requestClueAction(clue, active) {
		return this.requestAction({
			type: "clue", clue: this.puzzle.clues.indexOf(clue), active,
		});
	}

	requestAction(action) {
		if (!this.ready || this.seed === null)
			return false;
		var command = {
			type: "command",
			gameId: this.gameId,
			commandId: this.playerId + ":" + this.nextCommand++,
			expectedRevision: this.revision,
			action: action,
		};
		if (this.role == "host")
			return this.receiveCommand(this.playerId, command);
		if (!this.hostSender)
			return false;
		this.hostSender(copyMessage(command));
		return true;
	}

	receive(from, message) {
		if (!message || typeof message.type != "string")
			return;
		if (this.role == "host" && message.type == "command")
			this.receiveCommand(from, message);
		else if (this.role == "host" && message.type == "new-game")
			this.receiveNewGame(from, message);
		else if (this.role == "host" && message.type == "pause")
			this.receivePause(from, message);
		else if (this.role == "host" && message.type == "sync-request")
			this.sendTo(from, this.syncMessage());
		else if (this.role == "guest" && message.type == "sync")
			this.receiveSync(message);
		else if (this.role == "guest" && message.type == "players")
			this.receivePlayers(message.players);
		else if (this.role == "guest" && message.type == "clock")
			this.receiveClock(message.clock);
		else if (this.role == "guest" && message.type == "commit")
			this.receiveCommit(message);
		else if (this.role == "guest" && message.type == "reject")
			this.receiveRejection(message);
	}

	receiveCommand(from, message) {
		if (!this.ready)
			return false;
		if (typeof message.commandId != "string") {
			this.reject(from, null, "malformed-command");
			return false;
		}
		var commandKey = from + "\0" + message.commandId;
		if (this.committedCommands.has(commandKey)) {
			this.sendTo(from,
				this.committedCommands.get(commandKey));
			return true;
		}
		if (message.gameId !== this.gameId ||
		    message.expectedRevision != this.revision ||
		    !applicableAction(this.puzzle, message.action)) {
			this.reject(from, message.commandId, "stale-or-inapplicable");
			return false;
		}

		this.updatingTimer = true;
		try {
			applyAction(this.puzzle, message.action, true);
		} finally {
			this.updatingTimer = false;
		}
		var commit = {
			type: "commit",
			gameId: this.gameId,
			revision: ++this.revision,
			commandId: message.commandId,
			actor: from,
			committedAt: Date.now(),
			action: copyMessage(message.action),
			clock: this.clockState(),
		};
		this.history.push(commit);
		this.committedCommands.set(commandKey, commit);
		this.broadcast(commit);
		return true;
	}

	receiveCommit(message) {
		if (message.gameId !== this.gameId) {
			this.requestSync();
			return;
		}
		if (message.revision <= this.revision)
			return;
		if (!this.ready || message.revision != this.revision + 1) {
			this.requestSync();
			return;
		}
		if (!applicableAction(this.puzzle, message.action)) {
			this.requestSync();
			return;
		}
		this.updatingTimer = true;
		try {
			applyAction(this.puzzle, message.action,
				message.actor == this.playerId);
		} finally {
			this.updatingTimer = false;
		}
		this.receiveClock(message.clock);
		this.revision = message.revision;
		this.history.push(copyMessage(message));
	}

	receiveSync(message) {
		if ((message.seed !== null && !Number.isInteger(message.seed)) ||
		    !Number.isInteger(message.gameId) || !Array.isArray(message.history) ||
		    !message.rules)
			return;
		var session = this;
		this.ready = false;
		this.rules = {
			practiceMode: !!message.rules.practiceMode,
			continueAfterLoss: !!message.rules.continueAfterLoss,
		};
		this.applyRoomRules();
		if (message.seed === null)
			this.puzzle.showMultiplayerLobby();
		else if (!this.puzzle.newGame(message.seed))
			return;
		this.applyRoomRules();
		this.puzzle.scoreEligible = false;
		this.puzzle.withEffectsSuppressed(function() {
			for (var i = 0; i < message.history.length; i++) {
				applyAction(session.puzzle,
					message.history[i].action, false);
			}
		});
		this.seed = message.seed;
		this.gameId = message.gameId;
		this.startedAt = message.startedAt;
		this.revision = message.revision;
		this.history = copyMessage(message.history);
		this.ready = true;
		this.receiveClock(message.clock);
		this.receivePlayers(message.players);
	}

	receiveRejection(message) {
		this.lastRejection = copyMessage(message);
		if (message.sync)
			this.receiveSync(message.sync);
	}

	reject(playerId, commandId, reason) {
		var message = {
			type: "reject",
			commandId: commandId,
			reason: reason,
			sync: this.syncMessage(),
		};
		if (playerId == this.playerId)
			this.lastRejection = message;
		else if (this.peers.has(playerId))
			this.peers.get(playerId)(copyMessage(message));
	}

	requestSync() {
		if (this.hostSender)
			this.hostSender({ type: "sync-request" });
	}

	syncMessage() {
		return {
			type: "sync",
			gameId: this.gameId,
			seed: this.seed,
			rules: copyMessage(this.rules),
			startedAt: this.startedAt,
			revision: this.revision,
			history: copyMessage(this.history),
			players: copyMessage(this.players),
			clock: this.clockState(),
		};
	}

	applyRoomRules() {
		this.puzzle.practiceModePreference = this.rules.practiceMode;
		this.puzzle.practiceMode = this.rules.practiceMode;
		this.puzzle.continueAfterLoss = this.rules.continueAfterLoss;
	}

	clockState() {
		var puzzle = this.puzzle;
		return {
			elapsed: puzzle.timerTimeout === null ? puzzle.timerElapsed :
				Date.now() - puzzle.timerStarted,
			running: puzzle.timerTimeout !== null,
			paused: puzzle.paused && !puzzle.gameOver && !puzzle.practiceMode,
		};
	}

	timerChanged() {
		if (this.role == "host" && this.ready && !this.updatingTimer) {
			this.lastClockBroadcast = Date.now();
			this.broadcast({ type: "clock", clock: this.clockState() });
		}
	}

	timerTick() {
		/* Reuse the running clock's timer; stopped games need no heartbeat. */
		if (this.role != "host" || !this.ready || !this.peers.size ||
		    this.puzzle.timerTimeout === null)
			return;
		if (this.lastClockBroadcast === null ||
		    Date.now() - this.lastClockBroadcast >= 10000)
			this.timerChanged();
	}

	receiveClock(clock) {
		if (!clock || !Number.isFinite(clock.elapsed) || clock.elapsed < 0 ||
		    typeof clock.running != "boolean" || typeof clock.paused != "boolean")
			return;
		this.clock = { ...clock, receivedAt: Date.now() };
		this.restoreHostTimer();
	}

	/* Local menus and visibility changes cannot pause a guest's clock. */
	restoreHostTimer() {
		if (this.role != "guest" || !this.ready || !this.clock || this.updatingTimer)
			return false;
		var puzzle = this.puzzle;
		this.updatingTimer = true;
		try {
			puzzle.stopTimer();
			puzzle.timerElapsed = this.clock.elapsed + (this.clock.running ?
				Math.max(0, Date.now() - this.clock.receivedAt) : 0);
			puzzle.manualPaused = this.clock.paused;
			puzzle.paused = this.clock.paused;
			if (this.clock.running)
				puzzle.startTimer();
			puzzle.updatePauseControl();
		} finally {
			this.updatingTimer = false;
		}
		return true;
	}

	leave() {
		if (this.puzzle.actionController == this)
			this.puzzle.setActionController(null);
		this.puzzle.practiceModePreference = this.localRules.practiceMode;
		this.puzzle.continueAfterLoss =
			this.localRules.continueAfterLoss;
		this.ready = false;
		this.peers.clear();
		this.players = [];
		this.onPlayersChanged([]);
		this.hostSender = null;
		this.puzzle.updatePauseControl();
	}

	broadcast(message) {
		for (var sender of this.peers.values())
			sender(copyMessage(message));
	}

	sendTo(playerId, message) {
		if (playerId != this.playerId && this.peers.has(playerId))
			this.peers.get(playerId)(copyMessage(message));
	}
}

/* A synchronous transport for tests and same-page development. */
class InMemoryMultiplayerNetwork {
	constructor(host) {
		if (host.role != "host")
			throw new Error("an in-memory network requires a host session");
		this.host = host;
	}

	addGuest(guest) {
		if (guest.role != "guest")
			throw new Error("only guest sessions can join a network");
		var host = this.host;
		guest.connectHost(function(message) {
			host.receive(guest.playerId, message);
		});
		host.addPeer(guest.playerId, function(message) {
			guest.receive(host.playerId, message);
		}, guest.playerName);
	}
}

Object.assign(globalThis.LogosFriends ||= {}, {
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
	actionFromSlot,
	applicableAction,
});

})();
