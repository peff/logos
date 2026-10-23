/*
 * Transport-independent coordination for a host-authoritative Logos game.
 *
 * A transport calls receive() for incoming messages. The session itself only
 * needs functions which send messages to a named peer, which keeps WebRTC and
 * its offer/answer ceremony out of the game protocol.
 */

(function() {

function normalizePlayerName(name, fallback) {
	name = String(name || "")
		.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
		.trim().replace(/\s+/g, " ");
	name = Array.from(name).slice(0, 32).join("");
	return name || fallback;
}

const playerColors = ["#2374b8", "#a84391", "#25866a", "#6754b3", "#ac4242", "#36858e", "#827028"];
function playerColor(player = {}) {
	const color = Number.isInteger(player.color) ? player.color : 0;
	return playerColors[color] || `hsl(${color * 137.508 % 360} 55% 40%)`;
}

function isChalkAction(action) {
	return action?.type == "chalk" || action?.type == "chalk-clue" || action?.type == "chalk-clear";
}

var recentActionLimit = 12;

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

function validSupposeMoves(puzzle, action) {
	return Array.isArray(action.moves) && action.moves.length <= 4096 &&
		action.moves.every(move => {
			var slot = slotForAction(puzzle, move);
			return slot && ["place", "remove"].includes(move.type) &&
				move.value >= 0 && move.value < slot.possible.length;
		}) && Array.isArray(action.clues) && action.clues.length <= puzzle.clues.length &&
		action.clues.every(index => Number.isInteger(index) && !!puzzle.clues[index]?.display);
}

function applicableAction(puzzle, action) {
	if (!action)
		return false;
	if (action.type == "suppose-apply")
		return !puzzle.gameOver && !puzzle.paused && !puzzle.proof && validSupposeMoves(puzzle, action);
	if (action.type == "hint")
		return puzzle.seed !== undefined && !puzzle.gameOver && !puzzle.paused &&
			Number.isInteger(action.stage) && action.stage >= 1 && action.stage <= 3;
	if (action.type == "reveal-clue")
		return puzzle.extreme && !puzzle.gameOver && !puzzle.paused &&
			Number.isInteger(action.clue) && !!puzzle.originalClues[action.clue] &&
			!puzzle.clues.includes(puzzle.originalClues[action.clue]);
	if (action.type == "clue")
		return Number.isInteger(action.clue) &&
			typeof action.active == "boolean" &&
			!!puzzle.clues[action.clue]?.display;
	if (action.type == "chalk-clue")
		return !puzzle.gameOver && !puzzle.paused && !puzzle.proof &&
			Number.isInteger(action.clue) && typeof action.marked == "boolean" &&
			!!puzzle.clues[action.clue]?.display && !!puzzle.clues[action.clue].active;
	if (action.type == "chalk-clear")
		return !puzzle.gameOver && !puzzle.paused && !puzzle.proof;
	if (action.type == "chalk" &&
	    !["select", "remove", "erase"].includes(action.mark))
		return false;
	if (action.type != "chalk" && action.type != "place" && action.type != "remove")
		return false;
	var slot = slotForAction(puzzle, action);
	return !!slot && !puzzle.gameOver && !puzzle.paused && !puzzle.proof &&
		action.value >= 0 && action.value < slot.possible.length &&
		!slot.single && slot.possible[action.value];
}

function applyAction(puzzle, action, playerAction, actor, actorColor) {
	try {
		return applySharedAction(puzzle, action, playerAction, actor, actorColor);
	} finally {
		puzzle.reconcileSuppose();
	}
}

function applySharedAction(puzzle, action, playerAction, actor, actorColor) {
	if (action.type == "suppose-apply") {
		const applied = [];
		for (const move of action.moves) {
			const slot = slotForAction(puzzle, move);
			if (slot.single || !slot.possible[move.value])
				continue;
			applySharedAction(puzzle, move, playerAction, actor, actorColor);
			applied.push(move);
			if ((slot.value == move.value) == (move.type == "remove") || puzzle.gameOver) {
				action.clues = [];
				break;
			}
		}
		action.moves = applied;
		for (const index of action.clues)
			puzzle.applyClueAction(puzzle.clues[index], false);
		return;
	}
	if (action.type == "chalk-clear") {
		puzzle.clearPencilMarks();
		if (puzzle.expandedSlot)
			puzzle.renderSlotTray();
		return;
	}
	if (action.type == "chalk-clue")
		return puzzle.setChalkClue(puzzle.clues[action.clue], action.marked, actor, actorColor);
	if (action.type == "chalk")
		return puzzle.setPencilMark(slotForAction(puzzle, action), action.value,
			action.mark, actor, actorColor);
	if (action.type == "hint") {
		puzzle.practiceMode = true;
		puzzle.scoreEligible = false;
		puzzle.stopTimer();
		puzzle.updatePauseControl();
		if (playerAction)
			puzzle.hint(action.stage, true);
		return;
	}
	if (action.type == "reveal-clue")
		return puzzle.revealExtremeClue(action.clue);
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
		this.onHoverChanged = options.onHoverChanged || function() {};
		this.hovers = new Map();
		this.nextColor = 1;
		this.players = this.role == "host" ? [{
			id: this.playerId, name: this.playerName, role: "host", state: "connected", color: 0,
		}] : [];
		this.revision = 0;
		this.nextCommand = 1;
		this.seed = null;
		this.gameId = 0;
		this.runId = null;
		this.result = null;
		this.gamePlayers = new Map();
		this.participatingRunId = null;
		this.savedResults = new Set();
		this.rules = {
			practiceMode: options.practiceMode === undefined ?
				!!puzzle.practiceModePreference : !!options.practiceMode,
			continueAfterLoss: options.continueAfterLoss === undefined ?
				!!puzzle.continueAfterLoss : !!options.continueAfterLoss,
		};
		this.clock = null;
		this.updatingTimer = false;
		this.lastClockBroadcast = null;
		this.replay = null;
		this.replayTimer = null;
		this.acceptedSupposes = [];
		this.history = [];
		this.initialPosition = null;
		this.recentActions = new Map();
		this.branches = new Map();
		this.nextBranch = 1;
		this.viewingBranch = null;
		this.leavingBranch = false;
		this.joinRequest = null;
		this.branchCommands = new Map();
		this.branchRewinds = new Map();
		this.startingBranch = null;
		this.queuedBranchActions = [];
		this.updatingBranches = false;
		this.lastPaused = false;
		this.pauseActor = null;
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
		if (this.role == "host" && puzzle.seed !== undefined && !puzzle.gameOver &&
		    puzzle.pendingSeed === undefined)
			this.adoptGame();
		else
			puzzle.showMultiplayerLobby();
		this.ready = this.role == "host";
	}

	adoptGame() {
		var puzzle = this.puzzle;
		puzzle.closeProof();
		puzzle.clearPracticeMistake();
		this.seed = puzzle.seed;
		this.gameId++;
		this.runId = crypto.randomUUID();
		this.participatingRunId = this.runId;
		this.gamePlayers = new Map(this.players.map(player => [player.id, player.name]));
		for (const mark of puzzle.pencilMarks) {
			mark.actor = this.playerId;
			mark.color = playerColor(this.players[0]);
		}
		for (const clue of puzzle.clues)
			if (clue.chalkMark) {
				clue.chalkMark = { actor: this.playerId, color: playerColor(this.players[0]) };
				puzzle.setChalkClue(clue, true);
			}
		for (const row of puzzle.rows)
			puzzle.renderPencilMarks(row);
		this.initialPosition = {
			rows: puzzle.rows.map(row => row.slots.map(slot => ({
				single: slot.single, possible: slot.possible.slice(),
			}))),
			clues: puzzle.clues.map(clue => !!clue.active),
			revealedClues: puzzle.revealedClues.slice(),
			chalk: puzzle.pencilMarks.map(mark => ({
				...actionFromSlot(puzzle, mark.slot, mark.value, "chalk"),
				mark: mark.discard ? "remove" : "select",
				actor: mark.actor, color: mark.color,
			})).concat(puzzle.clues.flatMap((clue, index) => clue.chalkMark ? [{
				type: "chalk-clue", clue: index, marked: true,
				actor: this.playerId, color: playerColor(this.players[0]),
			}] : [])),
			practiceMode: puzzle.practiceMode,
			continuedFromLoss: puzzle.continuedFromLoss,
			nextMilestone: puzzle.nextMilestone,
		};
		puzzle.scoreEligible = false;
		/* Keep the solo menu's pause until hosting setup is closed. Later
		 * multiplayer dialogs do not set resumeAfterModal.
		 */
		if (!puzzle.resumeAfterModal)
			puzzle.paused = puzzle.manualPaused;
		this.lastPaused = puzzle.manualPaused;
		if (!puzzle.paused && !puzzle.practiceMode && puzzle.timerTimeout === null)
			puzzle.startTimer();
		puzzle.updatePauseControl();
	}

	restoreInitialPosition(position) {
		if (!position)
			return;
		var puzzle = this.puzzle;
		for (var index of position.revealedClues || [])
			puzzle.revealExtremeClue(index, false);
		for (var [row, slots] of position.rows.entries()) {
			for (var [column, state] of slots.entries()) {
				var slot = puzzle.rows[row].slots[column];
				slot.possible = state.possible.slice();
				if (state.single)
					slot.displaySingle();
				else {
					slot.displayPossible();
					slot.clearPencilDisplay();
				}
			}
		}
		for (var [index, active] of position.clues.entries())
			if (puzzle.clues[index].display)
				puzzle.applyClueAction(puzzle.clues[index], active);
		for (const mark of position.chalk || [])
			applyAction(puzzle, mark, false, mark.actor, mark.color);
		puzzle.practiceMode = position.practiceMode;
		puzzle.continuedFromLoss = position.continuedFromLoss;
		puzzle.nextMilestone = position.nextMilestone;
		if (position.continuedFromLoss)
			puzzle.timer.classList.add("lost");
	}

	start(seed, actor = this.playerId, extreme = false) {
		if (this.role != "host")
			throw new Error("only the host can start a game");
		var wasReady = this.ready;
		this.ready = false;
		this.applyRoomRules();
		if (!this.puzzle.newGame(seed, false, false, extreme)) {
			this.ready = wasReady;
			return false;
		}
		this.setReplay(null);
		this.acceptedSupposes = [];
		this.pendingSuppose = null;
		this.applyRoomRules();
		this.seed = this.puzzle.seed;
		this.gameId++;
		this.runId = crypto.randomUUID();
		this.participatingRunId = this.runId;
		this.result = null;
		this.gamePlayers = new Map(this.players.map(player => [player.id, player.name]));
		this.revision = 0;
		this.history = [];
		this.initialPosition = null;
		this.recentActions.clear();
		for (const id of this.branchRewinds.keys()) this.cancelBranchRewind(id);
		this.branchCommands.clear();
		this.startingBranch = null;
		this.queuedBranchActions = [];
		this.branches.clear();
		this.viewingBranch = this.joinRequest = null;
		this.leavingBranch = false;
		this.hovers.clear();
		this.onHoverChanged();
		this.lastPaused = false;
		this.committedCommands.clear();
		this.puzzle.scoreEligible = false;
		this.ready = true;
		this.recordActivity(actor, { type: "new-game" });
		this.broadcast(this.syncMessage());
		return true;
	}

	requestNewGame(seed, extreme = false) {
		if (!this.ready || this.role == "guest" && !this.hostSender)
			return false;
		if (seed === undefined) {
			/* No selected difficulties means contemplation in single-player. */
			if (!this.puzzle.randomDifficulties.length) {
				this.puzzle.say("Choose a difficulty in Options before starting a shared game.");
				return false;
			}
			seed = this.puzzle.randomPuzzleSeed();
		}
		if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
			return false;
		if (this.role == "host")
			return this.start(seed, this.playerId, extreme);
		this.hostSender({ type: "new-game", gameId: this.gameId, seed, extreme });
		return true;
	}

	receiveNewGame(from, message) {
		if (!this.ready || !this.peers.has(from))
			return;
		/* Coalesce requests made for the same game, including the lobby. */
		if (message.gameId !== this.gameId || !Number.isInteger(message.seed) ||
		    message.seed < 0 || message.seed > 0xffffffff || !this.start(message.seed, from, message.extreme))
			this.sendTo(from, this.syncMessage());
	}

	addPeer(playerId, sender, playerName) {
		if (this.role != "host")
			throw new Error("only the host can add peers");
		this.peers.set(playerId, sender);
		this.players = this.players.filter(player => player.id != playerId);
		this.players.push({
			id: playerId, name: playerName || playerId, role: "guest", state: "connected",
			color: this.nextColor++,
		});
		if (this.seed !== null && !this.result)
			this.gamePlayers.set(playerId, playerName || playerId);
		if (this.ready)
			sender(this.syncMessage());
		this.playersChanged();
	}

	removePeer(playerId) {
		if (!this.peers.delete(playerId))
			return;
		this.receiveSuppose(playerId, { gameId: this.gameId, active: false });
		this.players = this.players.filter(player => player.id != playerId);
		this.recentActions.delete(playerId);
		this.hovers.delete(playerId);
		this.onHoverChanged();
		this.playersChanged();
	}

	setPlayerName(name) {
		this.playerName = normalizePlayerName(name, this.playerName);
		if (this.role == "host") {
			this.renamePlayer(this.playerId, this.playerName);
		} else {
			this.pendingName = this.playerName;
			this.sendPlayerName();
		}
	}

	sendPlayerName() {
		if (!this.ready || !this.hostSender || !this.pendingName) return;
		const name = this.pendingName;
		this.pendingName = null;
		this.hostSender({ type: "name", name });
	}

	renamePlayer(id, name) {
		const player = this.players.find(player => player.id == id);
		if (!player || typeof name != "string") return;
		player.name = normalizePlayerName(name, player.name);
		if (this.seed !== null && !this.result)
			this.gamePlayers.set(id, player.name);
		this.playersChanged();
		this.branchesChanged();
	}

	setPeerState(playerId, state) {
		var player = this.players.find(player => player.id == playerId);
		if (this.role != "host" || !player || player.state == state)
			return;
		player.state = state;
		if (state != "connected") {
			this.hovers.delete(playerId);
			this.onHoverChanged();
		}
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
		for (const id of this.hovers.keys())
			if (!players.some(player => player.id == id && player.state == "connected"))
				this.hovers.delete(id);
		this.onHoverChanged();
		for (var id of this.recentActions.keys())
			if (!players.some(player => player.id == id))
				this.recentActions.delete(id);
		this.refreshBranchView();
	}

	colorForPlayer(id) {
		return playerColor(this.players.find(player => player.id == id));
	}

	branchForPlayer(id = this.playerId) {
		return [...this.branches.values()].find(branch => branch.participants.includes(id));
	}

	supposeChanged(active) {
		if (!this.ready || this.seed === null || this.updatingBranches) return;
		if (!active && this.viewingBranch) this.leavingBranch = true;
		const message = { type: "suppose", gameId: this.gameId, active };
		if (active) {
			message.branchId = this.playerId + ":" + this.nextBranch++;
			this.startingBranch = message.branchId;
		}
		this.sendBranchRequest(message);
		if (this.role == "host") this.startingBranch = null;
	}

	sendBranchRequest(message) {
		if (this.role == "host") this.receive(this.playerId, message);
		else if (this.hostSender) this.hostSender(message);
	}

	recordSupposeActivity(actor, active, branchId) {
		const activity = { type: "suppose-activity", gameId: this.gameId, actor,
			action: { type: active ? "suppose-enter" : "suppose-leave", branchId } };
		this.recordActivity(actor, activity.action);
		this.broadcast(activity);
	}

	receiveSuppose(from, message) {
		if (!this.ready || message.gameId !== this.gameId ||
		    typeof message.active != "boolean" ||
		    !this.players.some(player => player.id == from))
			return;
		const branch = this.branchForPlayer(from);
		if (message.active) {
			if (branch || this.seed === null || this.puzzle.gameOver ||
			    typeof message.branchId != "string" || message.branchId.length > 256 ||
			    this.branches.has(message.branchId)) {
				if (from != this.playerId) this.sendTo(from, this.syncMessage());
				return;
			}
			const model = this.puzzle.supposeModel(null);
			model.enter();
			this.branches.set(message.branchId, { id: message.branchId,
				participants: [from], snapshot: model.snapshot(), state: model.serialize(),
				version: 1, generation: 0 });
			this.recordSupposeActivity(from, true, message.branchId);
		} else {
			if (!branch) return;
			branch.participants = branch.participants.filter(id => id != from);
			if (!branch.participants.length) {
				this.cancelBranchRewind(branch.id);
				this.branches.delete(branch.id);
			}
			this.recordSupposeActivity(from, false, branch.id);
		}
		this.branchesChanged();
	}

	/* Shared moves reconcile every branch, including ones the host is not
	 * viewing. Clients receive the resulting history from the host. */
	reconcileBranches() {
		if (this.role != "host" || !this.ready) return;
		let changed = false;
		for (const branch of this.branches.values()) {
			const model = this.puzzle.supposeModel(branch.state);
			const before = JSON.stringify(model.serialize());
			model.reconcile();
			if (JSON.stringify(model.serialize()) === before) continue;
			this.saveBranchState(branch, model);
			changed = true;
		}
		if (changed) this.branchesChanged();
	}

	saveBranchState(branch, model) {
		branch.state = model.serialize();
		branch.snapshot = model.snapshot();
		branch.version++;
	}

	closeBranch(branch) {
		this.cancelBranchRewind(branch.id);
		this.branches.delete(branch.id);
		for (const id of branch.participants) this.recordSupposeActivity(id, false, branch.id);
		this.branchesChanged();
	}

	requestBranchAction(action) {
		if (!this.ready || this.joinRequest || this.leavingBranch || this.pendingSuppose) return false;
		const branch = this.branchForPlayer();
		if (!branch) {
			if (this.startingBranch) this.queuedBranchActions.push(action);
			return !!this.startingBranch;
		}
		const command = { type: "branch-action", gameId: this.gameId, branchId: branch.id,
			commandId: this.playerId + ":" + this.nextCommand++,
			version: branch.version, generation: branch.generation, action };
		if (["apply", "reject"].includes(action.type)) {
			this.pendingSuppose = { commandId: command.commandId, state: this.puzzle.suppose, command };
			this.puzzle.suppose.pending = true;
			this.puzzle.renderSuppose();
		}
		if (["place", "remove"].includes(action.type))
			command.action = { ...action, autoDismissClues: this.puzzle.autoDismissClues };
		if (action.type == "leave") {
			this.leavingBranch = true;
			this.updatingBranches = true;
			try { this.puzzle.leaveSuppose(true); }
			finally { this.updatingBranches = false; }
		}
		this.sendBranchRequest(command);
		return true;
	}

	receiveBranchResult(message) {
		if (message.gameId !== this.gameId) return;
		if (this.pendingSuppose?.commandId === message.commandId) {
			delete this.pendingSuppose.state.pending;
			this.pendingSuppose = null;
			if (this.puzzle.suppose) this.puzzle.renderSuppose();
		}
		if (!message.accepted) {
			this.leavingBranch = false;
			this.puzzle.say(message.reason == "changed" ?
				"The supposition changed before that action arrived. Review the current step and try again." :
				"That action is not available now. The supposition is saved.");
		}
	}

	receiveBranchAction(from, message) {
		if (!this.ready || message.gameId !== this.gameId ||
		    !this.players.some(player => player.id == from) ||
		    typeof message.commandId != "string" || message.commandId.length > 256) return;
		const key = from + "\0" + message.commandId;
		const reply = result => {
			if (from == this.playerId) this.receiveBranchResult(result);
			else this.sendTo(from, result);
		};
		if (this.branchCommands.has(key)) {
			reply(this.branchCommands.get(key));
			return;
		}
		const branch = this.branches.get(message.branchId), action = message.action;
		const result = { type: "branch-result", gameId: this.gameId,
			commandId: message.commandId, accepted: false, reason: "unavailable" };
		let valid = branch?.participants.includes(from) && action && typeof action.type == "string";
		const incremental = ["place", "remove", "clue"].includes(action?.type);
		if (valid && action.type != "leave" &&
		    (message.generation !== branch.generation || !Number.isInteger(message.version) ||
		     message.version < 1 || message.version > branch.version ||
		     !incremental && message.version !== branch.version)) {
			valid = false;
			result.reason = "changed";
		}
		/* Remember before executing: an in-memory transport can re-enter us
		 * while broadcasting the resulting state. */
		this.branchCommands.set(key, result);
		if (valid && action.type == "leave") {
			result.accepted = true;
			this.receiveSuppose(from, { gameId: this.gameId, active: false });
		} else if (valid && (action.type == "back-out" || !this.puzzle.paused && !this.puzzle.gameOver)) {
			const model = this.puzzle.supposeModel(branch.state), state = model.suppose;
			const conflict = state.sharedConflicts.some(Boolean);
			let steps = 0, depth = 0;
			for (let level = state; level; level = level.parent) {
				steps += level.history.length;
				depth++;
			}
			const fork = state.position < state.history.length - 1;
			const slot = slotForAction(this.puzzle, action);
			let changed = false, rewind = false;
			if (incremental && !conflict && !branch.rewinding && steps < 4096) {
				if (["place", "remove"].includes(action.type) && slot && !slot.single &&
				    action.value >= 0 && action.value < slot.possible.length) {
					if (typeof action.autoDismissClues == "boolean") model.autoDismissClues = action.autoDismissClues;
					model.applySupposeAction(slot, action.value, action.type);
					result.accepted = true;
					changed = !!model.sound;
				} else if (action.type == "clue" && Number.isInteger(action.clue) &&
				           this.puzzle.clues[action.clue]?.active && typeof action.dismissed == "boolean") {
					result.accepted = true;
					if (state.dismissed.includes(action.clue) !== action.dismissed) {
						model.toggleSupposeClue(this.puzzle.clues[action.clue]);
						changed = true;
					}
				}
			} else if (action.type == "back-out" && state.parent) {
				model.suppose = state.parent;
				changed = true;
			} else if (action.type == "navigate" && Number.isInteger(action.position) &&
			           action.position >= 0 && action.position < state.history.length) {
				model.moveSuppose(action.position - state.position);
				changed = true;
			} else if (action.type == "nest" && !conflict && state.assumption && steps < 4096 && depth < 64) {
				model.enter();
				changed = true;
			} else if (action.type == "rewind" && model.supposeRewindTarget()) {
				rewind = model.rewindStep();
				changed = true;
			} else if (["apply", "reject"].includes(action.type) && !conflict &&
			           (action.type != "reject" || state.assumption)) {
				if (state.parent) {
					if (action.type == "apply") model.keep();
					else {
						const a = state.assumption;
						model.suppose = state.parent;
						model.applySupposeAction(this.puzzle.rows[a.row].slots[a.column],
							a.symbol, a.discard ? "place" : "remove");
					}
					changed = true;
				} else {
					const a = state.assumption;
					const moves = action.type == "reject" ? [{ row: a.row, column: a.column,
						value: a.symbol, type: a.discard ? "place" : "remove" }] :
						state.history.slice(1, state.position + 1).map(({ move }) => ({
							row: move.row, column: move.column, value: move.symbol,
							type: move.discard ? "remove" : "place" }));
					const apply = { type: "suppose-apply", moves,
						clues: action.type == "reject" ? [] : state.dismissed.slice() };
					if (!this.replay && applicableAction(this.puzzle, apply)) {
						result.accepted = true;
						this.startSupposeReplay(from, { commandId: message.commandId, action: apply });
					}
				}
			}
			if (changed) {
				this.cancelBranchRewind(branch.id);
				if (!incremental || fork && action.type != "clue") branch.generation++;
				this.saveBranchState(branch, model);
				result.accepted = true;
				if (rewind) this.scheduleBranchRewind(branch);
				this.branchesChanged({ branchId: branch.id, sound: model.sound, actor: from, action });
			}
		}
		if (!result.accepted && from != this.playerId)
			this.sendTo(from, { type: "branches", gameId: this.gameId,
				branches: copyMessage([...this.branches.values()]) });
		reply(result);
	}

	cancelBranchRewind(id) {
		clearTimeout(this.branchRewinds.get(id));
		this.branchRewinds.delete(id);
		const branch = this.branches.get(id);
		if (branch) branch.rewinding = false;
	}

	scheduleBranchRewind(branch) {
		branch.rewinding = true;
		this.branchRewinds.set(branch.id, setTimeout(() => {
			this.cancelBranchRewind(branch.id);
			if (!this.branches.has(branch.id)) return;
			if (!this.puzzle.paused && !this.puzzle.gameOver) {
				const model = this.puzzle.supposeModel(branch.state);
				const more = model.rewindStep();
				this.saveBranchState(branch, model);
				if (more) this.scheduleBranchRewind(branch);
			}
			this.branchesChanged();
		}, 300));
	}

	canJoinSuppose(branchId) {
		const branch = this.branches.get(branchId);
		return !!(this.ready && branch && !this.branchForPlayer() && !this.joinRequest &&
			!this.puzzle.suppose && !this.puzzle.proof && !this.puzzle.gameOver &&
			!this.puzzle.paused && !this.replay);
	}

	joinSuppose(branchId) {
		if (!this.canJoinSuppose(branchId)) return false;
		this.joinRequest = branchId;
		this.puzzle.updateSupposeControls();
		this.sendBranchRequest({ type: "branch-join", gameId: this.gameId, branchId });
		return true;
	}

	receiveJoin(from, message) {
		const branch = this.branches.get(message.branchId);
		if (this.ready && message.gameId === this.gameId && branch && !this.branchForPlayer(from) &&
		    this.players.some(player => player.id == from) && !this.puzzle.gameOver &&
		    !this.puzzle.paused && !this.replay) {
			branch.participants.push(from);
			this.recordSupposeActivity(from, true, branch.id);
		}
		this.branchesChanged();
		const result = { type: "join-result", gameId: this.gameId, branchId: message.branchId };
		if (from == this.playerId) this.receiveJoinResult(result);
		else this.sendTo(from, result);
	}

	receiveJoinResult(message) {
		if (message.gameId !== this.gameId || message.branchId !== this.joinRequest) return;
		this.joinRequest = null;
		this.puzzle.updateSupposeControls();
		this.onPlayersChanged(copyMessage(this.players));
	}

	recordBranchEvent(event) {
		if (!event || this.branchForPlayer()?.id !== event.branchId) return;
		if (event.sound) this.puzzle.playSound(event.sound);
		this.puzzle.recordMoveEvent("suppose-shared", { actor: event.actor, action: event.action });
	}

	branchesChanged(event = null) {
		const branches = copyMessage([...this.branches.values()]);
		this.refreshBranchView();
		this.broadcast({ type: "branches", gameId: this.gameId, branches, event });
		this.recordBranchEvent(event);
	}

	receiveBranches(branches, event = null) {
		if (!Array.isArray(branches)) return;
		this.branches = new Map(branches.map(branch => [branch.id, copyMessage(branch)]));
		this.refreshBranchView();
		this.recordBranchEvent(event);
		this.flushBranchActions();
	}

	flushBranchActions() {
		if (this.startingBranch && this.branchForPlayer()?.id === this.startingBranch) {
			this.startingBranch = null;
			const actions = this.queuedBranchActions.splice(0);
			for (const action of actions) this.requestBranchAction(action);
		}
	}

	/* A resync installs several related pieces of state before refreshing
	 * the branch position and roster together. */
	refreshBranchView() {
		if (this.updatingBranches) return;
		for (const [id, target] of this.hovers) {
			if ((target.branchId || null) !== (this.branchForPlayer(id)?.id || null))
				this.hovers.delete(id);
		}
		this.updateBranchView();
		this.onHoverChanged();
		this.onPlayersChanged(copyMessage(this.players));
	}

	updateBranchView() {
		if (this.updatingBranches) return;
		this.updatingBranches = true;
		try {
			const branch = this.branchForPlayer();
			if (branch) {
				if (this.leavingBranch) return;
				const changed = this.viewingBranch != branch.id || this.branchVersion != branch.version ||
					!this.puzzle.suppose;
				this.viewingBranch = branch.id;
				this.joinRequest = null;
				if (changed) {
					this.branchVersion = branch.version;
					const previous = this.puzzle.suppose || this.restoringSuppose;
					const existing = new Map();
					for (let state = previous; state; state = state.parent) existing.set(state.prefix, state);
					const restore = incoming => {
						if (!incoming) return null;
						const parent = restore(incoming.parent);
						const state = existing.get(incoming.prefix) || {};
						return Object.assign(state, incoming, { parent });
					};
					const state = restore(copyMessage(branch.state));
					if (this.pendingSuppose) {
						delete this.pendingSuppose.state.pending;
						state.pending = true;
						this.pendingSuppose.state = state;
					}
					state.displayed = this.puzzle.suppose?.displayed;
					this.puzzle.clearHint();
					this.puzzle.closeSlotTray();
					this.puzzle.restoreSuppose(state);
				}
			} else if (this.viewingBranch) {
				this.puzzle.leaveSuppose(true);
				this.viewingBranch = null;
				this.leavingBranch = false;
				if (this.pendingSuppose) delete this.pendingSuppose.state.pending;
				this.pendingSuppose = null;
			}
			if (this.puzzle.suppose) this.puzzle.renderSuppose();
			else this.puzzle.updateSupposeControls();
		} finally {
			this.updatingBranches = false;
		}
	}

	hoverForPlayer(id) {
		const target = this.hovers.get(id);
		if (target?.branchId && (!this.puzzle.suppose ||
		    target.branchId !== this.branchForPlayer()?.id)) return null;
		return target;
	}

	requestHover(target) {
		if (!this.ready || this.seed === null) return;
		const branchId = this.branchForPlayer()?.id || null;
		/* Do not send targets from a view whose membership is still pending. */
		if (target !== null && !!this.puzzle.suppose !== !!branchId) return;
		const message = { type: "hover", gameId: this.gameId, branchId, target };
		if (this.role == "host") this.receiveHover(this.playerId, message);
		else if (this.hostSender) this.hostSender(message);
	}

	receiveHover(from, message) {
		if (!this.ready || this.seed === null || message.gameId !== this.gameId) return;
		const id = this.role == "host" ? from : message.playerId;
		if (!this.players.some(player => player.id == id && player.state == "connected")) return;
		const target = message.target;
		const branchId = message.branchId || null;
		if (target !== null && branchId !== (this.branchForPlayer(id)?.id || null)) return;
		if (target && Object.hasOwn(target, "clue")) {
			if (!Number.isInteger(target.clue) || !this.puzzle.clues[target.clue]?.displayType) return;
			this.hovers.set(id, { clue: target.clue });
		} else if (target !== null) {
			if (!target || !Number.isInteger(target.row) || !Number.isInteger(target.column)) return;
			const slot = this.puzzle.rows[target.row]?.slots[target.column];
			if (!slot || target.value !== null &&
			    (!Number.isInteger(target.value) || target.value < 0 || target.value >= slot.possible.length)) return;
			this.hovers.set(id, { row: target.row, column: target.column, value: target.value });
		} else {
			this.hovers.delete(id);
		}
		if (target !== null && branchId) this.hovers.get(id).branchId = branchId;
		this.onHoverChanged();
		if (this.role == "host") {
			for (const peerId of this.peers.keys()) {
				const visible = !branchId || this.branchForPlayer(peerId)?.id === branchId;
				this.sendTo(peerId, { type: "hover", gameId: this.gameId, playerId: id,
					branchId, target: visible ? this.hovers.get(id) || null : null });
			}
		}
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
		if (this.puzzle.manualPaused != message.paused) {
			this.pauseActor = from;
			try {
				this.puzzle.togglePause();
			} finally {
				this.pauseActor = null;
			}
		}
		this.sendTo(from, { type: "clock", gameId: this.gameId, clock: this.clockState() });
	}

	requestTileAction(slot, value, type) {
		if (this.role == "guest" && this.clock?.paused)
			return false;
		if (type == "pencil-select" || type == "pencil-remove") {
			const discard = type == "pencil-remove";
			const existing = this.puzzle.pencilMarks.find(mark =>
				mark.slot == slot && mark.value == value);
			return this.requestAction({
				...actionFromSlot(this.puzzle, slot, value, "chalk"),
				mark: existing?.discard === discard ? "erase" :
					discard ? "remove" : "select",
			});
		}
		return this.requestAction(actionFromSlot(this.puzzle, slot, value, type));
	}

	requestClueAction(clue, active) {
		return this.requestAction({
			type: "clue", clue: this.puzzle.clues.indexOf(clue), active,
		});
	}

	requestAction(action) {
		if (!this.ready || this.seed === null || this.pendingSuppose || this.replay || this.viewingBranch || this.joinRequest ||
		    this.role == "guest" && !this.hostSender)
			return false;
		var command = {
			type: "command",
			gameId: this.gameId,
			commandId: this.playerId + ":" + this.nextCommand++,
			expectedRevision: this.revision,
			action: action,
		};
		if (action.type == "suppose-apply" && this.puzzle.suppose) {
			this.pendingSuppose = { commandId: command.commandId, state: this.puzzle.suppose };
			this.puzzle.suppose.pending = true;
			this.puzzle.renderSuppose();
		}
		if (this.role == "host") {
			const accepted = this.receiveCommand(this.playerId, command);
			this.finishSuppose(command.commandId, accepted);
			return accepted;
		}
		this.hostSender(copyMessage(command));
		return true;
	}

	finishSuppose(commandId, accepted) {
		const pending = this.pendingSuppose;
		if (!pending || pending.commandId !== commandId)
			return;
		this.pendingSuppose = null;
		delete pending.state.pending;
		if (this.puzzle.suppose === pending.state) {
			if (accepted)
				this.puzzle.leaveSuppose(true);
			else {
				this.puzzle.renderSuppose();
				this.puzzle.say("The host could not apply these moves. Your supposition is saved; try again when the shared game is ready.");
			}
		}
	}

	receive(from, message) {
		if (!message || typeof message.type != "string")
			return;
		if (this.role == "host" && message.type == "branch-join")
			this.receiveJoin(from, message);
		else if (this.role == "host" && message.type == "branch-action")
			this.receiveBranchAction(from, message);
		else if (this.role == "guest" && message.type == "branch-result")
			this.receiveBranchResult(message);
		else if (this.role == "guest" && message.type == "join-result")
			this.receiveJoinResult(message);
		else if (this.role == "guest" && message.type == "branches" && message.gameId === this.gameId)
			this.receiveBranches(message.branches, message.event);
		else if (this.role == "host" && message.type == "suppose")
			this.receiveSuppose(from, message);
		else if (this.role == "guest" && message.type == "suppose-activity" &&
		         message.gameId === this.gameId &&
		         ["suppose-enter", "suppose-leave"].includes(message.action?.type))
			this.recordActivity(message.actor, message.action);
		else if (message.type == "hover")
			this.receiveHover(from, message);
		else if (this.role == "host" && message.type == "command")
			this.receiveCommand(from, message);
		else if (this.role == "host" && message.type == "new-game")
			this.receiveNewGame(from, message);
		else if (this.role == "host" && message.type == "pause")
			this.receivePause(from, message);
		else if (this.role == "host" && message.type == "name" && this.peers.has(from))
			this.renamePlayer(from, message.name);
		else if (this.role == "host" && message.type == "sync-request")
			this.sendTo(from, this.syncMessage());
		else if (this.role == "guest" && message.type == "sync")
			this.receiveSync(message);
		else if (this.role == "guest" && message.type == "players")
			this.receivePlayers(message.players);
		else if (this.role == "guest" && message.type == "clock" &&
		         message.gameId === this.gameId)
			this.receiveClock(message.clock, message.activity);
		else if (this.role == "guest" && message.type == "replay" && message.gameId === this.gameId) {
			if (message.replay)
				this.acceptSupposeReplay(message.replay);
			this.setReplay(message.replay);
		} else if (this.role == "guest" && message.type == "commit")
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
				this.committedCommands.get(commandKey).type == "replay" ?
					this.syncMessage() : this.committedCommands.get(commandKey));
			return true;
		}
		/* Chalk expresses intent, so independent concurrent edits can be ordered
		 * even when their senders have not seen the latest revision yet.
		 * Branch application also tolerates intervening moves: it rechecks
		 * each move against the live board and skips resolved tiles.
		 */
		const revisionOK = (isChalkAction(message.action) || message.action?.type == "suppose-apply") ?
			Number.isInteger(message.expectedRevision) && message.expectedRevision >= 0 &&
			message.expectedRevision <= this.revision : message.expectedRevision == this.revision;
		if (message.gameId !== this.gameId || this.replay ||
		    !!this.branchForPlayer(from) ||
		    !revisionOK ||
		    !applicableAction(this.puzzle, message.action)) {
			this.reject(from, message.commandId, "stale-or-inapplicable");
			return false;
		}

		if (message.action.type == "suppose-apply")
			return this.startSupposeReplay(from, message);
		this.commitAction(from, message.commandId, message.action);
		return true;
	}

	commitAction(from, commandId, action, remember = true) {
		const actorColor = playerColor(this.players.find(player => player.id == from));
		this.updatingTimer = true;
		try {
			applyAction(this.puzzle, action,
				action.type != "hint" || from == this.playerId, from, actorColor);
		} finally {
			this.updatingTimer = false;
		}
		var commit = {
			type: "commit",
			gameId: this.gameId,
			revision: ++this.revision,
			commandId: commandId,
			actor: from,
			/* Preserve chalk colors even after their author leaves the roster. */
			actorColor,
			committedAt: Date.now(),
			action: copyMessage(action),
			clock: this.clockState(),
			result: copyMessage(this.result),
		};
		this.history.push(commit);
		if (remember)
			this.committedCommands.set(from + "\0" + commandId, commit);
		this.recordMove(commit);
		this.broadcast(commit);
		this.reconcileBranches();
		this.saveResult();
		return commit;
	}

	setReplay(replay) {
		clearTimeout(this.replayTimer);
		this.replayTimer = null;
		this.replay = replay;
		this.puzzle.explainButton.disabled = !!replay || !!this.puzzle.suppose ||
			this.puzzle.gameOver && !this.puzzle.pendingProof;
		if (this.puzzle.suppose)
			this.puzzle.renderSuppose();
	}

	acceptSupposeReplay(replay) {
		if (replay.actor === this.playerId)
			this.finishSuppose(replay.commandId, true);
	}

	replayState() {
		return this.replay ? { actor: this.replay.actor, commandId: this.replay.commandId } : null;
	}

	startSupposeReplay(actor, command) {
		const replay = { actor, commandId: command.commandId,
			moves: copyMessage(command.action.moves), clues: command.action.clues.slice() };
		const accepted = { actor, commandId: command.commandId };
		this.acceptedSupposes.push(accepted);
		this.setReplay(replay);
		/* Acceptance closes the branch before anybody sees its moves. */
		const branch = this.branchForPlayer(actor);
		if (branch) this.closeBranch(branch);
		const message = { type: "replay", gameId: this.gameId, replay: accepted };
		this.committedCommands.set(actor + "\0" + command.commandId, message);
		this.acceptSupposeReplay(accepted);
		this.broadcast(message);
		this.advanceSupposeReplay();
		return true;
	}

	advanceSupposeReplay() {
		const replay = this.replay;
		if (!replay || this.role != "host") return;
		clearTimeout(this.replayTimer);
		const later = () => {
			this.replayTimer = setTimeout(() => this.advanceSupposeReplay(), 300);
		};
		if (this.puzzle.paused) {
			later();
			return;
		}
		while (!this.puzzle.gameOver && replay.moves.length) {
			const move = replay.moves.shift();
			const slot = slotForAction(this.puzzle, move);
			if (slot.single || !slot.possible[move.value]) continue;
			this.commitAction(replay.actor, replay.commandId, move, false);
			if ((slot.value === move.value) === (move.type === "remove")) {
				replay.clues = [];
				break;
			}
			if (!this.puzzle.gameOver && replay.moves.length) {
				later();
				return;
			}
		}
		if (!this.puzzle.gameOver)
			for (const clue of replay.clues)
				this.commitAction(replay.actor, replay.commandId, { type: "clue", clue, active: false }, false);
		this.setReplay(null);
		this.broadcast({ type: "replay", gameId: this.gameId, replay: null });
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
				message.actor == this.playerId, message.actor, message.actorColor);
		} finally {
			this.updatingTimer = false;
		}
		if (message.actor === this.playerId)
			this.finishSuppose(message.commandId, true);
		this.receiveClock(message.clock);
		this.revision = message.revision;
		this.history.push(copyMessage(message));
		this.recordMove(message);
		this.result = copyMessage(message.result || null);
		this.saveResult();
	}

	receiveSync(message) {
		if ((message.seed !== null && !Number.isInteger(message.seed)) ||
		    !Number.isInteger(message.gameId) || !Array.isArray(message.history) ||
		    !message.rules ||
		    (message.extreme !== undefined && typeof message.extreme !== "boolean") ||
		    (message.seed === null && message.extreme))
			return;
		var sameGame = message.gameId === this.gameId && message.seed === this.seed;
		this.restoringSuppose = sameGame ? this.puzzle.suppose : null;

		if (!sameGame)
			this.pendingSuppose = null;
		var session = this;
		var wasReady = this.ready;
		var oldRules = this.rules;
		this.ready = false;
		this.rules = {
			practiceMode: !!message.rules.practiceMode,
			continueAfterLoss: !!message.rules.continueAfterLoss,
		};
		this.applyRoomRules();
		/* A resync of the same game must not change its seasonal artwork. */
		var symbols = message.gameId === this.gameId && message.seed === this.seed ?
			this.puzzle.symbols : null;
		if (message.seed === null)
			this.puzzle.showMultiplayerLobby();
		else if (!this.puzzle.newGame(message.seed, false, false, message.extreme)) {
			this.ready = wasReady;
			this.rules = oldRules;
			this.applyRoomRules();
			return;
		}
		if (symbols)
			this.puzzle.setSymbols(symbols);
		this.applyRoomRules();
		this.puzzle.scoreEligible = false;
		this.puzzle.withEffectsSuppressed(function() {
			session.restoreInitialPosition(message.initialPosition);
			for (var i = 0; i < message.history.length; i++) {
				applyAction(session.puzzle,
					message.history[i].action, false,
					message.history[i].actor, message.history[i].actorColor);
			}
		});
		this.seed = message.seed;
		this.gameId = message.gameId;
		this.runId = message.runId;
		this.result = copyMessage(message.result || null);
		if (this.seed !== null && !this.result)
			this.participatingRunId = this.runId;
		this.revision = message.revision;
		this.history = copyMessage(message.history);
		this.initialPosition = copyMessage(message.initialPosition || null);
		this.recentActions.clear();
		this.hovers.clear();
		this.onHoverChanged();
		for (var entry of message.recentActions || [])
			if (Array.isArray(entry) && typeof entry[0] == "string" && Array.isArray(entry[1]))
				this.recentActions.set(entry[0], copyMessage(entry[1].slice(-recentActionLimit)));
		this.branches = new Map((message.branches || []).map(branch => [branch.id, copyMessage(branch)]));
		this.updatingBranches = true;
		this.ready = true;
		if (this.pendingSuppose && [...message.history, ...(message.acceptedSupposes || [])].some(commit =>
		    commit.commandId === this.pendingSuppose.commandId && commit.actor === this.playerId))
			this.finishSuppose(this.pendingSuppose.commandId, true);
		this.setReplay(message.replay || null);
		this.receiveClock(message.clock);
		this.receivePlayers(message.players);
		this.updatingBranches = false;
		this.branchVersion = null;
		this.joinRequest = null;
		this.refreshBranchView();
		this.restoringSuppose = null;
		this.flushBranchActions();
		if (!this.branchForPlayer()) {
			this.startingBranch = null;
			this.queuedBranchActions = [];
		}
		if (this.pendingSuppose?.command && this.branchForPlayer())
			this.sendBranchRequest(this.pendingSuppose.command);
		this.sendPlayerName();
		this.saveResult();
	}

	receiveRejection(message) {
		this.lastRejection = copyMessage(message);
		if (message.sync)
			this.receiveSync(message.sync);
		this.finishSuppose(message.commandId, false);
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
			runId: this.runId,
			result: copyMessage(this.result),
			gameId: this.gameId,
			seed: this.seed,
			extreme: !!this.puzzle.extreme,
			rules: copyMessage(this.rules),
			revision: this.revision,
			history: copyMessage(this.history),
			branches: copyMessage([...this.branches.values()]),
			replay: this.replayState(),
			acceptedSupposes: copyMessage(this.acceptedSupposes),
			initialPosition: copyMessage(this.initialPosition),
			recentActions: copyMessage([...this.recentActions]),
			players: copyMessage(this.players),
			clock: this.clockState(),
		};
	}

	finishRun(outcome) {
		if (this.role != "host" || !this.ready || this.result || this.puzzle.practiceMode)
			return;
		this.result = {
			...this.puzzle.runRecord(outcome),
			elapsed: this.clockState().elapsed,
			multiplayer: true,
			multiplayerId: this.runId,
			players: [...this.gamePlayers.values()],
		};
	}

	saveResult() {
		var run = this.result;
		if (!run || run.multiplayerId !== this.participatingRunId ||
		    this.savedResults.has(run.multiplayerId))
			return;
		this.savedResults.add(run.multiplayerId);
		this.puzzle.recordOutcome(run.outcome, copyMessage(run)).then(saved => {
			if (!saved)
				this.savedResults.delete(run.multiplayerId);
		});
	}

	applyRoomRules() {
		this.puzzle.practiceModePreference = this.rules.practiceMode;
		this.puzzle.practiceMode = this.rules.practiceMode;
		this.puzzle.continueAfterLoss = this.rules.continueAfterLoss;
	}

	recordMove(commit) {
		var action = commit.action;
		if (action.type == "suppose-apply") {
			for (const move of action.moves)
				this.recordMove({ ...commit, action: move });
			return;
		}
		if (action.type == "hint" || action.type == "reveal-clue") {
			this.recordActivity(commit.actor, action);
			return;
		}
		if (action.type != "place" && action.type != "remove")
			return;
		var slot = slotForAction(this.puzzle, action);
		this.recordActivity(commit.actor, {
			...action,
			mistake: action.type == "place" ? slot.value != action.value :
				slot.value == action.value,
		});
	}

	recordActivity(actor, action) {
		if (!this.players.some(player => player.id == actor))
			return;
		var actions = this.recentActions.get(actor) || [];
		actions.push(copyMessage(action));
		var recent = actions.slice(-recentActionLimit);
		const branch = this.branchForPlayer(actor);
		const entry = actions.findLast(action => action.type == "suppose-enter" && action.branchId == branch?.id);
		if (branch && entry && !recent.includes(entry))
			recent = [entry, ...recent.slice(1)];
		this.recentActions.set(actor, recent);
		this.onPlayersChanged(copyMessage(this.players));
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
			var message = { type: "clock", gameId: this.gameId, clock: this.clockState() };
			if (this.puzzle.manualPaused != this.lastPaused) {
				this.lastPaused = this.puzzle.manualPaused;
				message.activity = {
					actor: this.pauseActor || this.playerId,
					action: { type: this.lastPaused ? "pause" : "resume" },
				};
				this.recordActivity(message.activity.actor, message.activity.action);
			}
			this.broadcast(message);
			if (this.puzzle.paused && this.branchRewinds.size) {
				for (const id of this.branchRewinds.keys()) this.cancelBranchRewind(id);
				this.branchesChanged();
			}
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

	receiveClock(clock, activity) {
		if (!clock || !Number.isFinite(clock.elapsed) || clock.elapsed < 0 ||
		    typeof clock.running != "boolean" || typeof clock.paused != "boolean")
			return;
		this.clock = { ...clock, receivedAt: Date.now() };
		this.restoreHostTimer();
		if (activity && ["pause", "resume"].includes(activity.action?.type))
			this.recordActivity(activity.actor, activity.action);
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
		this.setReplay(null);
		this.pendingSuppose = null;
		if (this.puzzle.actionController == this)
			this.puzzle.setActionController(null);
		this.puzzle.practiceModePreference = this.localRules.practiceMode;
		this.puzzle.continueAfterLoss =
			this.localRules.continueAfterLoss;
		this.ready = false;
		this.peers.clear();
		this.players = [];
		this.recentActions.clear();
		for (const id of this.branchRewinds.keys()) this.cancelBranchRewind(id);
		this.branchCommands.clear();
		this.startingBranch = null;
		this.queuedBranchActions = [];
		this.branches.clear();
		this.viewingBranch = this.joinRequest = null;
		this.leavingBranch = false;
		this.hovers.clear();
		this.onHoverChanged();
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
	normalizePlayerName,
	playerColor,
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
	actionFromSlot,
	applicableAction,
});

})();
