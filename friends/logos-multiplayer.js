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
		this.watchingBranch = null;
		this.watchLeaving = false;
		this.watchRequest = null;
		this.branchSnapshot = null;
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
		this.branches.clear();
		this.watchingBranch = this.watchRequest = this.branchSnapshot = null;
		this.watchLeaving = false;
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

	branchForPlayer(id = this.playerId) {
		return [...this.branches.values()].find(branch => branch.participants.includes(id));
	}

	supposeChanged(active) {
		if (!this.ready || this.seed === null || this.updatingBranches) return;
		if (!active && this.watchingBranch) this.watchLeaving = true;
		const message = { type: "suppose", gameId: this.gameId, active };
		if (active) {
			message.branchId = this.playerId + ":" + this.nextBranch++;
			message.snapshot = this.puzzle.supposeSnapshot();
			this.branchSnapshot = JSON.stringify([message.branchId, message.snapshot]);
		}
		this.sendBranchRequest(message);
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
			if (branch || typeof message.branchId != "string" ||
			    this.branches.has(message.branchId) || !this.validBranchSnapshot(message.snapshot))
				return;
			this.branches.set(message.branchId, { id: message.branchId, controller: from,
				participants: [from], snapshot: copyMessage(message.snapshot), version: 1 });
			this.recordSupposeActivity(from, true, message.branchId);
		} else {
			if (!branch) return;
			const leaving = branch.controller == from ? branch.participants.slice() : [from];
			if (branch.controller == from) this.branches.delete(branch.id);
			else branch.participants = branch.participants.filter(id => id != from);
			for (const id of leaving) this.recordSupposeActivity(id, false, branch.id);
		}
		this.branchesChanged();
	}

	validBranchSnapshot(snapshot) {
		const rowDomains = (row, r) => Array.isArray(row) && row.length == this.puzzle.rows[r]?.slots.length &&
			row.every(bits => Number.isInteger(bits) && bits >= 0 && bits < (1 << row.length));
		const domains = rows => Array.isArray(rows) && rows.length == this.puzzle.rows.length &&
			rows.every(rowDomains);
		const text = value => typeof value == "string" && value.length <= 2048 &&
			[...value.matchAll(/\ue000(\d+):(\d+)\ue001/g)].every(([, r, symbol]) =>
				!!this.puzzle.rows[r]?.slots[0].symbols[symbol]);
		const messages = value => value && typeof value == "object" && !Array.isArray(value) &&
			Object.keys(value).length <= 256 && Object.values(value).every(text);
		return snapshot && domains(snapshot.base) && domains(snapshot.domains) &&
			Array.isArray(snapshot.dismissed) && snapshot.dismissed.length <= this.puzzle.clues.length &&
			snapshot.dismissed.every(i => Number.isInteger(i) && !!this.puzzle.clues[i]) &&
			Array.isArray(snapshot.sharedConflicts) && snapshot.sharedConflicts.length <= this.puzzle.rows.length &&
			snapshot.sharedConflicts.every(value => value == null || typeof value == "boolean") &&
			messages(snapshot.sharedConflictMessages) && messages(snapshot.previousConflicts) &&
			Array.isArray(snapshot.conflictDomains) && snapshot.conflictDomains.length <= this.puzzle.rows.length &&
			snapshot.conflictDomains.every((row, r) => row == null || rowDomains(row, r)) &&
			domains(snapshot.conflictTiles) && (snapshot.message == null || text(snapshot.message)) &&
			typeof snapshot.prefix == "string" && snapshot.prefix.length <= 256 &&
			Number.isInteger(snapshot.position) && snapshot.position >= 0 && snapshot.position <= 4096 &&
			typeof snapshot.label == "string" && snapshot.label.length <= 256 &&
			typeof snapshot.nested == "boolean";
	}

	publishSuppose() {
		if (!this.ready || this.updatingBranches || this.watchingBranch ||
		    !this.puzzle.suppose) return;
		const branch = this.branchForPlayer();
		if (!branch || branch.controller != this.playerId) return;
		const snapshot = this.puzzle.supposeSnapshot();
		const serialized = JSON.stringify([branch.id, snapshot]);
		if (serialized === this.branchSnapshot) return;
		this.branchSnapshot = serialized;
		this.sendBranchRequest({ type: "branch-update", gameId: this.gameId,
			branchId: branch.id, snapshot });
	}

	receiveBranchUpdate(from, message) {
		const branch = this.branches.get(message.branchId);
		if (!this.ready || message.gameId !== this.gameId || !branch ||
		    branch.controller != from || !this.validBranchSnapshot(message.snapshot)) return;
		branch.snapshot = copyMessage(message.snapshot);
		branch.version++;
		this.branchesChanged();
	}

	canWatch(branchId) {
		const branch = this.branches.get(branchId);
		return !!(this.ready && branch && !this.branchForPlayer() && !this.watchRequest &&
			!this.puzzle.suppose && !this.puzzle.proof && !this.puzzle.gameOver &&
			!this.puzzle.paused && !this.replay);
	}

	watchSuppose(branchId) {
		if (!this.canWatch(branchId)) return false;
		this.watchRequest = branchId;
		this.puzzle.updateSupposeControls();
		this.sendBranchRequest({ type: "branch-watch", gameId: this.gameId, branchId });
		return true;
	}

	receiveWatch(from, message) {
		const branch = this.branches.get(message.branchId);
		if (this.ready && message.gameId === this.gameId && branch && !this.branchForPlayer(from) &&
		    this.players.some(player => player.id == from) && !this.puzzle.gameOver &&
		    !this.puzzle.paused && !this.replay) {
			branch.participants.push(from);
			this.recordSupposeActivity(from, true, branch.id);
		}
		this.branchesChanged();
		const result = { type: "watch-result", gameId: this.gameId, branchId: message.branchId };
		if (from == this.playerId) this.receiveWatchResult(result);
		else this.sendTo(from, result);
	}

	receiveWatchResult(message) {
		if (message.gameId !== this.gameId || message.branchId !== this.watchRequest) return;
		this.watchRequest = null;
		this.puzzle.updateSupposeControls();
		this.onPlayersChanged(copyMessage(this.players));
	}

	branchesChanged() {
		const branches = copyMessage([...this.branches.values()]);
		this.refreshBranchView();
		this.broadcast({ type: "branches", gameId: this.gameId, branches });
	}

	receiveBranches(branches) {
		if (!Array.isArray(branches)) return;
		this.branches = new Map(branches.map(branch => [branch.id, copyMessage(branch)]));
		this.refreshBranchView();
		/* Flush edits made while the host was registering our branch. */
		this.publishSuppose();
	}

	/* A resync installs several related pieces of state before refreshing
	 * the watched position and roster together. */
	refreshBranchView() {
		if (this.updatingBranches) return;
		this.updateBranchView();
		this.onPlayersChanged(copyMessage(this.players));
	}

	updateBranchView() {
		if (this.updatingBranches) return;
		this.updatingBranches = true;
		try {
			const branch = this.branchForPlayer();
			if (branch && branch.controller != this.playerId) {
				if (this.watchLeaving) return;
				const changed = this.watchingBranch != branch.id || this.watchedVersion != branch.version ||
					!this.puzzle.suppose;
				this.watchingBranch = branch.id;
				this.watchRequest = null;
				if (changed) {
					this.watchedVersion = branch.version;
					const state = { ...copyMessage(branch.snapshot), parent: null, history: [], watched: true };
					state.displayed = this.puzzle.suppose?.displayed;
					this.puzzle.clearHint();
					this.puzzle.closeSlotTray();
					this.puzzle.restoreSuppose(state);
					this.requestHover(null);
				}
			} else if (this.watchingBranch) {
				this.puzzle.leaveSuppose(true);
				this.watchingBranch = null;
				this.watchLeaving = false;
			}
			if (this.puzzle.suppose) this.puzzle.renderSuppose();
			else this.puzzle.updateSupposeControls();
		} finally {
			this.updatingBranches = false;
		}
	}

	requestHover(target) {
		if (!this.ready || this.seed === null || this.puzzle.suppose && target !== null) return;
		const message = { type: "hover", gameId: this.gameId, target };
		if (this.role == "host") this.receiveHover(this.playerId, message);
		else if (this.hostSender) this.hostSender(message);
	}

	receiveHover(from, message) {
		if (!this.ready || this.seed === null || message.gameId !== this.gameId) return;
		const id = this.role == "host" ? from : message.playerId;
		if (!this.players.some(player => player.id == id && player.state == "connected")) return;
		const target = message.target;
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
		this.onHoverChanged();
		if (this.role == "host")
			this.broadcast({ type: "hover", gameId: this.gameId, playerId: id,
				target: this.hovers.get(id) || null });
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
		if (!this.ready || this.seed === null || this.pendingSuppose || this.replay || this.watchingBranch || this.watchRequest ||
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
		if (this.role == "host" && message.type == "branch-watch")
			this.receiveWatch(from, message);
		else if (this.role == "host" && message.type == "branch-update")
			this.receiveBranchUpdate(from, message);
		else if (this.role == "guest" && message.type == "watch-result")
			this.receiveWatchResult(message);
		else if (this.role == "guest" && message.type == "branches" && message.gameId === this.gameId)
			this.receiveBranches(message.branches);
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
		    this.branchForPlayer(from)?.controller != from && !!this.branchForPlayer(from) ||
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
		this.publishSuppose();
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
		/* Acceptance closes the private branch before anybody sees its moves. */
		this.receiveSuppose(actor, { gameId: this.gameId, active: false });
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
		this.publishSuppose();
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
		var supposition = sameGame ? this.puzzle.suppose : null;
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
		/* Local history survives resync; watched positions come from the
		 * host's branch snapshot in the final refresh below. */
		if (supposition && !supposition.watched && !this.puzzle.gameOver)
			this.puzzle.restoreSuppose(supposition);
		if (this.pendingSuppose && [...message.history, ...(message.acceptedSupposes || [])].some(commit =>
		    commit.commandId === this.pendingSuppose.commandId && commit.actor === this.playerId))
			this.finishSuppose(this.pendingSuppose.commandId, true);
		this.setReplay(message.replay || null);
		this.receiveClock(message.clock);
		this.receivePlayers(message.players);
		this.updatingBranches = false;
		this.watchedVersion = null;
		this.watchRequest = null;
		this.refreshBranchView();
		this.publishSuppose();
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
		this.branches.clear();
		this.watchingBranch = this.watchRequest = this.branchSnapshot = null;
		this.watchLeaving = false;
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
