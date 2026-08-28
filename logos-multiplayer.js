/*
 * Transport-independent coordination for a host-authoritative Logos game.
 *
 * A transport calls receive() for incoming messages. The session itself only
 * needs functions which send messages to a named peer, which keeps WebRTC and
 * its offer/answer ceremony out of the game protocol.
 */

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
	if (action.type != "place" && action.type != "remove")
		return false;
	var slot = slotForAction(puzzle, action);
	return !!slot && !puzzle.gameOver && !puzzle.paused && !puzzle.proof &&
		action.value >= 0 && action.value < slot.possible.length &&
		!slot.single && slot.possible[action.value];
}

function applyAction(puzzle, action, playerAction) {
	var slot = slotForAction(puzzle, action);
	if (!slot)
		throw new Error("invalid multiplayer action coordinates");
	puzzle.applyTileAction(slot, action.value, action.type, playerAction);
}

class MultiplayerSession {
	constructor(puzzle, options) {
		options = options || {};
		this.puzzle = puzzle;
		this.role = options.role;
		this.playerId = options.playerId || this.role;
		this.revision = 0;
		this.nextCommand = 1;
		this.seed = null;
		this.rules = {
			practiceMode: !!options.practiceMode,
			continueAfterLoss: !!options.continueAfterLoss,
		};
		this.startedAt = null;
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
	}

	start(seed) {
		if (this.role != "host")
			throw new Error("only the host can start a game");
		this.applyRoomRules();
		if (!this.puzzle.newGame(seed))
			return false;
		this.applyRoomRules();
		this.seed = this.puzzle.seed;
		this.startedAt = this.puzzle.timerStarted || Date.now();
		this.revision = 0;
		this.history = [];
		this.committedCommands.clear();
		this.puzzle.scoreEligible = false;
		this.ready = true;
		this.broadcast(this.syncMessage());
		return true;
	}

	addPeer(playerId, sender) {
		if (this.role != "host")
			throw new Error("only the host can add peers");
		this.peers.set(playerId, sender);
		if (this.ready)
			sender(this.syncMessage());
	}

	removePeer(playerId) {
		this.peers.delete(playerId);
	}

	connectHost(sender) {
		if (this.role != "guest")
			throw new Error("only a guest connects to a host");
		this.hostSender = sender;
	}

	requestTileAction(slot, value, type) {
		/* Tentative marks remain private to each player's board. */
		if (type == "pencil-select" || type == "pencil-remove")
			return this.puzzle.applyTileAction(slot, value, type);
		if (!this.ready)
			return false;

		var action = actionFromSlot(this.puzzle, slot, value, type);
		var command = {
			type: "command",
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
		else if (this.role == "host" && message.type == "sync-request")
			this.sendTo(from, this.syncMessage());
		else if (this.role == "guest" && message.type == "sync")
			this.receiveSync(message);
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
		if (message.expectedRevision != this.revision ||
		    !applicableAction(this.puzzle, message.action)) {
			this.reject(from, message.commandId, "stale-or-inapplicable");
			return false;
		}

		applyAction(this.puzzle, message.action, true);
		var commit = {
			type: "commit",
			revision: ++this.revision,
			commandId: message.commandId,
			actor: from,
			committedAt: Date.now(),
			action: copyMessage(message.action),
		};
		this.history.push(commit);
		this.committedCommands.set(commandKey, commit);
		this.broadcast(commit);
		return true;
	}

	receiveCommit(message) {
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
		applyAction(this.puzzle, message.action,
			message.actor == this.playerId);
		this.revision = message.revision;
		this.history.push(copyMessage(message));
	}

	receiveSync(message) {
		if (!Number.isInteger(message.seed) || !Array.isArray(message.history) ||
		    !message.rules)
			return;
		var session = this;
		this.rules = {
			practiceMode: !!message.rules.practiceMode,
			continueAfterLoss: !!message.rules.continueAfterLoss,
		};
		this.applyRoomRules();
		if (!this.puzzle.newGame(message.seed))
			return;
		this.applyRoomRules();
		this.puzzle.scoreEligible = false;
		this.puzzle.withEffectsSuppressed(function() {
			for (var i = 0; i < message.history.length; i++)
				applyAction(session.puzzle,
					message.history[i].action, false);
		});
		this.seed = message.seed;
		this.startedAt = message.startedAt;
		this.revision = message.revision;
		this.history = copyMessage(message.history);
		this.ready = true;
		this.synchronizeTimer();
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
			seed: this.seed,
			rules: copyMessage(this.rules),
			startedAt: this.startedAt,
			revision: this.revision,
			history: copyMessage(this.history),
		};
	}

	applyRoomRules() {
		this.puzzle.practiceModePreference = this.rules.practiceMode;
		this.puzzle.practiceMode = this.rules.practiceMode;
		this.puzzle.continueAfterLoss = this.rules.continueAfterLoss;
	}

	synchronizeTimer() {
		if (this.rules.practiceMode || !Number.isFinite(this.startedAt))
			return;
		var end = Date.now();
		if (this.puzzle.gameOver && this.history.length) {
			var committedAt =
				this.history[this.history.length - 1].committedAt;
			if (Number.isFinite(committedAt))
				end = committedAt;
		}
		this.puzzle.stopTimer();
		this.puzzle.timerElapsed = Math.max(0, end - this.startedAt);
		this.puzzle.updateTimer(this.puzzle.timerElapsed);
		if (!this.puzzle.gameOver)
			this.puzzle.startTimer();
	}

	leave() {
		if (this.puzzle.actionController == this)
			this.puzzle.setActionController(null);
		this.puzzle.practiceModePreference = this.localRules.practiceMode;
		this.puzzle.continueAfterLoss =
			this.localRules.continueAfterLoss;
		this.ready = false;
		this.peers.clear();
		this.hostSender = null;
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
		});
	}
}

export {
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
	actionFromSlot,
	applicableAction,
};
