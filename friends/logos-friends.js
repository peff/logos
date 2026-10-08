(function() {

var {
	MultiplayerSession,
	WebRTCGuestTransport,
	WebRTCHostTransport,
	normalizePlayerName,
} = globalThis.LogosFriends;

var friendsButton = document.querySelector("#friends-button");
var friendsBadgeCaption = friendsButton.querySelector(".friends-badge-caption");
var friendsMenu = document.querySelector("#friends-menu");
var status = friendsMenu.querySelector(".friends-status");
var rejoinButton = friendsMenu.querySelector("#friends-rejoin");
var invitationNeedsAttention = false;
var leaveButton = friendsMenu.querySelector("#friends-leave");
var newGameButton = document.querySelector("#new-game-button");
var nameInput = friendsMenu.querySelector("#friends-player-name");
var roster = document.querySelector("#friends-roster");
var rosterPlayers = document.querySelector("#friends-roster-players");
var rosterStatus = document.querySelector("#friends-roster-status");
var rosterConnection = "connecting";
var session = null;
var transport = null;
var historyHighlight = null;
var room = null;
var roomInput = friendsMenu.querySelector("#friends-room-name");
var roomEditor = friendsMenu.querySelector(".friends-room-editor");
var roomNameDisplay = friendsMenu.querySelector("#friends-room-name-display");
var roomJoin = friendsMenu.querySelector("#friends-join-room");
var roomRandom = friendsMenu.querySelector("#friends-random-room");
var roomSharing = friendsMenu.querySelector(".friends-room-sharing");
var roomRenew = friendsMenu.querySelector("#friends-renew-room");
var roomLink = "";

/* Hover targets use puzzle coordinates, never screen pixels. */
const hoverColors = ["#2374b8", "#a84391", "#25866a", "#c26920", "#6754b3", "#ac4242", "#36858e", "#827028"];
function playerColor(player) {
	const color = Number.isInteger(player.color) ? player.color : 0;
	return hoverColors[color] || `hsl(${color * 137.508 % 360} 55% 40%)`;
}
const hoverElements = new Set();
let hoverTarget = null;
let sentHover = null;
let hoverTimer = null;
let hoverGame = null;
let hoverSession = null;
const board = document.querySelector("#board");
const hoverAreas = [board, document.querySelector("#hclues"), document.querySelector("#vclues")];

function renderSharedHover() {
	for (const elem of hoverElements) {
		delete elem.dataset.sharedHover;
		elem.style.removeProperty("--shared-hover-rings");
	}
	hoverElements.clear();
	const targets = new Map();
	for (const player of session?.players || []) {
		if (player.id == session.playerId) continue;
		const target = session.hovers.get(player.id);
		if (!target) continue;
		let elem;
		if (Object.hasOwn(target, "clue")) {
			elem = puzzle.clues[target.clue]?.display;
		} else {
			const slot = puzzle.rows[target.row]?.slots[target.column];
			if (!slot) continue;
			elem = target.value !== null && !slot.single && slot.possible[target.value] ?
				slot.possibilityElems[target.value] : slot.elem;
		}
		if (!elem) continue;
		if (!targets.has(elem)) targets.set(elem, []);
		targets.get(elem).push(playerColor(player));
	}
	for (const [elem, colors] of targets) {
		elem.dataset.sharedHover = "true";
		elem.style.setProperty("--shared-hover-rings", colors.map((color, i) =>
			`inset 0 0 0 ${(i + 1) * 0.1}rem ${color}`).join(", "));
		hoverElements.add(elem);
	}
}

function hoverAt(elem) {
	if (!session?.ready || session.seed === null || !elem || !hoverAreas.some(area => area.contains(elem)) ||
	    !friendsMenu.hidden || document.querySelector(".modal:not([hidden])")) return null;
	const clue = puzzle.clues.findIndex(clue => clue.display?.contains(elem));
	if (clue >= 0) return { clue };
	for (const [row, line] of puzzle.rows.entries()) {
		for (const [column, slot] of line.slots.entries()) {
			if (!slot.elem.contains(elem)) continue;
			const value = slot.single ? -1 : slot.possibilityElems.findIndex(cell => cell.contains(elem));
			return { row, column, value: value < 0 ? null : value };
		}
	}
	return null;
}

function queueHover(target) {
	hoverTarget = target;
	if (hoverTimer !== null) return;
	/* Combine the leave/enter pair without adding a dwell delay. */
	hoverTimer = setTimeout(() => {
		hoverTimer = null;
		if (JSON.stringify(hoverTarget) == JSON.stringify(sentHover)) return;
		sentHover = hoverTarget;
		session?.requestHover(hoverTarget);
	}, 0);
}
function clearLocalHover() { queueHover(null); }
for (const area of hoverAreas) {
	area.addEventListener("pointerover", event => {
		if (event.pointerType == "mouse") queueHover(hoverAt(event.target));
	});
	area.addEventListener("pointerout", event => {
		if (event.pointerType == "mouse") queueHover(hoverAt(event.relatedTarget));
	});
	area.addEventListener("pointercancel", clearLocalHover);
}
/* Local clue reordering changes display elements, but not clue identities. */
const clueObserver = new MutationObserver(renderSharedHover);
for (const area of hoverAreas.slice(1))
	clueObserver.observe(area, { childList: true, subtree: true });
window.addEventListener("blur", clearLocalHover);
document.addEventListener("visibilitychange", () => {
	if (document.hidden) clearLocalHover();
});
const modalObserver = new MutationObserver(() => {
	if (document.querySelector(".modal:not([hidden])")) clearLocalHover();
});
for (const modal of document.querySelectorAll(".modal"))
	modalObserver.observe(modal, { attributes: true, attributeFilter: ["hidden"] });

function clearHistoryHighlight() {
	if (!historyHighlight)
		return;
	var highlight = historyHighlight;
	historyHighlight = null;
	for (var slot of highlight.slots)
		slot.classList.remove("history-highlight");
	highlight.event.classList.remove("history-held");
	if (highlight.event.hasPointerCapture(highlight.pointerId))
		highlight.event.releasePointerCapture(highlight.pointerId);
}

function highlightHistory(event, actions, pointerId) {
	clearHistoryHighlight();
	var slots = actions.map(action => puzzle.rows[action.row].slots[action.column].elem);
	historyHighlight = { event, slots, pointerId };
	for (var slot of slots)
		slot.classList.add("history-highlight");
	event.classList.add("history-held");
}

for (var type of ["pointerup", "pointercancel", "lostpointercapture"])
	window.addEventListener(type, function(ev) {
		if (historyHighlight?.pointerId === ev.pointerId)
			clearHistoryHighlight();
	}, true);
window.addEventListener("blur", clearHistoryHighlight);
document.addEventListener("visibilitychange", clearHistoryHighlight);
rosterPlayers.addEventListener("scroll", clearHistoryHighlight, true);

try {
	nameInput.value = localStorage.getItem("multiplayerPlayerName") || "";
} catch (e) {
	/* Multiplayer still works when browser-local storage is unavailable. */
}

function randomHex(bytes) {
	var data = new Uint8Array(bytes);
	crypto.getRandomValues(data);
	return Array.from(data, function(value) {
		return value.toString(16).padStart(2, "0");
	}).join("").toUpperCase();
}

function playerId() {
	return crypto.randomUUID ? crypto.randomUUID() : randomHex(16);
}

function setGameControlsDisabled(disabled) {
	document.querySelector("#practice-mode").disabled = disabled;
	document.querySelector("#continue-after-loss").disabled = disabled;
}

function beginSession(role) {
	if (transport)
		transport.close();
	session = new MultiplayerSession(window.puzzle, {
		role,
		playerId: playerId(),
		playerName: playerName(role),
		onPlayersChanged: renderPlayers,
		onHoverChanged: renderSharedHover,
	});
	rosterConnection = role == "host" ? "connected" : "connecting";
	roster.hidden = false;
	document.body.classList.add("multiplayer");
	renderPlayers(session.players);
	leaveButton.hidden = false;
	leaveButton.textContent = role == "host" ?
		"End multiplayer" : "Leave multiplayer";
	setGameControlsDisabled(true);
	newGameButton.onclick = function() {
		if (rosterConnection == "closed")
			window.puzzle.newGame();
		else
			session.requestNewGame();
	};
}

function renderRecentAction(actions) {
	var action = actions[actions.length - 1];
	var event = document.createElement("span");
	event.className = "friends-roster-event";
	var icon = document.createElement("span");
	icon.className = "friends-roster-action";
	icon.dataset.action = action.type;
	var description;
	if (action.type == "place" || action.type == "remove") {
		var row = puzzle.rows[action.row];
		var symbol = row.slots[action.column].symbols[action.value];
		icon.classList.add("proof-tile", row.familyClass);
		icon.textContent = symbol;
		icon.dataset.mistake = !!action.mistake;
		description = (action.mistake ? "Mistake: " : "") +
			(action.type == "place" ? "Placed " : "Discarded ") +
			symbol + (actions.length > 1 ? " in columns " : " in column ") +
			actions.map(action => action.column + 1).join(", ");
	} else if (action.type == "hint") {
		icon.textContent = "∵";
		description = actions.length == 1 ? "Asked for a hint" :
			"Asked for a hint " + actions.length + " times";
	} else if (action.type == "new-game") {
		icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
			'<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">' +
			'<path d="M14 3H4v18h15v-8"/>' +
			'<path d="m9 15 2-5 8-8 3 3-8 8-5 2Z" fill="currentColor" stroke="none"/>' +
			'</g></svg>';
		description = "Started a new game";
	} else {
		var columns = document.querySelector("#timer .pause-columns").cloneNode(true);
		columns.removeAttribute("class");
		icon.append(columns);
		description = action.type == "pause" ? "Paused the game" : "Resumed the game";
	}
	icon.title = description;
	icon.setAttribute("role", "img");
	icon.setAttribute("aria-label", description);
	event.append(icon);
	if (actions.length > 1) {
		var count = document.createElement("span");
		count.className = "friends-roster-count";
		count.textContent = actions.length;
		count.setAttribute("aria-hidden", "true");
		event.append(count);
	}
	event.title = description;
	if (action.type == "place" || action.type == "remove") {
		event.classList.add("friends-roster-tile-event");
		event.addEventListener("pointerdown", function(ev) {
			if (ev.button != 0 || !ev.isPrimary)
				return;
			highlightHistory(event, actions, ev.pointerId);
			event.setPointerCapture(ev.pointerId);
		});
	}
	return event;
}

function renderPlayers(players) {
	if (hoverSession !== session || hoverGame !== session?.gameId) {
		clearTimeout(hoverTimer);
		hoverTimer = null;
		hoverTarget = sentHover = null;
		hoverSession = session;
		hoverGame = session?.gameId;
	}
	renderSharedHover();
	clearHistoryHighlight();
	newGameButton.disabled = !!session && !session.ready && rosterConnection != "closed";
	rosterPlayers.replaceChildren();
	var visiblePlayers = players;
	if (players.length > 4)
		visiblePlayers = players.filter(player => player.id != session?.playerId).slice(0, 4);
	rosterPlayers.dataset.columns = players.length > 2 ? "2" : "1";
	for (var player of visiblePlayers) {
		var entry = document.createElement("li");
		entry.dataset.state = player.state;
		entry.style.setProperty("--player-color", playerColor(player));
		var self = player.id == session?.playerId;
		entry.dataset.self = self;
		var description = player.name + (self ? " (you)" : "") +
			(player.state == "interrupted" ? " — connection interrupted" : "");
		entry.title = description;
		var identity = document.createElement("span");
		identity.className = "friends-roster-player";
		var name = document.createElement("span");
		name.className = "friends-roster-name";
		name.textContent = player.name;
		name.title = description;
		name.setAttribute("aria-label", description);
		identity.append(name);
		entry.append(identity);
		var history = document.createElement("span");
		history.className = "friends-roster-history";
		var groups = [];
		for (var action of session?.recentActions.get(player.id) || []) {
			var previous = groups.at(-1)?.at(-1);
			if (action.type == "hint" && previous?.type == "hint" ||
			    action.type == "remove" && previous?.type == "remove" &&
			    action.row == previous.row && action.value == previous.value &&
			    !action.mistake && !previous.mistake)
				groups.at(-1).push(action);
			else
				groups.push([action]);
		}
		for (var group of groups)
			history.prepend(renderRecentAction(group));
		entry.append(history);
		rosterPlayers.append(entry);
	}
	roster.dataset.state = rosterConnection;
	if (rosterConnection == "disconnected")
		rosterStatus.textContent = "Connection interrupted";
	else if (rosterConnection == "closed")
		rosterStatus.textContent = "Host disconnected";
	else if (invitationNeedsAttention)
		rosterStatus.textContent = "Reopen invitation";
	else if (!players.length)
		rosterStatus.textContent = "Connecting…";
	else if (players.length == 1)
		rosterStatus.textContent = "Invite friends";
	else if (session?.seed === null)
		rosterStatus.textContent = "Ready to start";
	else
		rosterStatus.textContent = "";
}

function playerName(role) {
	return normalizePlayerName(nameInput.value,
		role == "host" ? "Host" : "Guest");
}

function updateWebRTCHost(state) {
	if (state.unexpectedDeparture) room?.renew();
	friendsBadgeCaption.textContent = "Hosting";
	if (state.state == "connected" && !friendsMenu.hidden)
		toggleMenu();
	if (state.state == "failed")
		status.textContent = "A guest connection failed. They can try joining again.";
}

function updateWebRTCGuest(state) {
	if (state.terminal) room?.close();
	rejoinButton.hidden = !state.terminal;
	rejoinButton.disabled = false;
	rosterConnection = state.connected ? "connected" :
		state.state == "disconnected" ? "disconnected" :
		state.terminal || state.state == "closed" ? "closed" : "connecting";
	renderPlayers(session?.players || []);
	if (state.connected) {
		room?.connected();
		status.textContent = "Connected to the host.";
		friendsBadgeCaption.textContent = "Joined";
		if (!friendsMenu.hidden)
			toggleMenu();
	} else if (state.state == "disconnected") {
		status.textContent = "The connection to the host was interrupted.";
		friendsBadgeCaption.textContent = "Disconnected";
	} else if (state.state == "failed" || state.state == "closed") {
		status.textContent = "The host disconnected. Rejoin the room, or " +
			"end multiplayer to keep playing solo.";
		leaveButton.textContent = "End multiplayer";
		friendsBadgeCaption.textContent = "Disconnected";
	} else {
		status.textContent = "Connecting to the host…";
		friendsBadgeCaption.textContent = "Connecting";
	}
}

/* Seed starts and New Game share the same cleanup, including contemplation. */
window.puzzle.beforeNewGame = function() {
	if (session && rosterConnection == "closed")
		leave();
};

function setInvitationView(enabled) {
	roomInput.hidden = enabled;
	roomRandom.hidden = enabled;
	roomNameDisplay.hidden = !enabled;
	if (enabled) roomNameDisplay.textContent = roomInput.value;
}

function leave() {
	rejoinButton.hidden = true;
	invitationNeedsAttention = false;
	setInvitationView(false);
	if (room) {
		const previous = room;
		room = null;
		previous.close();
	}
	roomSharing.hidden = true;
	roomEditor.hidden = false;
	roomNameDisplay.hidden = true;
	roomInput.disabled = false;
	roomRandom.disabled = false;
	roomJoin.hidden = false;
	roomRandom.hidden = false;
	roomJoin.disabled = false;
	clearHistoryHighlight();
	if (transport)
		transport.close();
	transport = null;
	session = null;
	renderSharedHover();
	clearLocalHover();
	newGameButton.disabled = false;
	roster.hidden = true;
	document.body.classList.remove("multiplayer");
	rosterPlayers.replaceChildren();
	status.textContent = "Gather kindred minds in a shared room.";
	leaveButton.hidden = true;
	roomInput.setCustomValidity("");
	roomInput.value = "";
	friendsBadgeCaption.textContent = "with Friends";
	setGameControlsDisabled(false);
	newGameButton.onclick = function() { window.puzzle.newGame(); };
	if (!friendsMenu.hidden)
		toggleMenu();
}

function toggleMenu() {
	clearHistoryHighlight();
	if (!window.puzzle.options.hidden)
		window.puzzle.toggleOptions();
	window.puzzle.toggleModal(friendsMenu, friendsButton, "Close");
	document.querySelector("#friends-roster-button").setAttribute(
		"aria-expanded", !friendsMenu.hidden);
}

function showCopied(button) {
	var old = button.textContent;
	button.textContent = "Copied";
	setTimeout(function() { button.textContent = old; }, 1200);
}

function roomInvitationStatus(state) {
	if (!room) return;
	status.textContent = state.message;
	if (session?.role == "host" && ["open", "error"].includes(state.state)) {
		invitationNeedsAttention = state.state == "error";
		renderPlayers(session.players);
	}
	roomRenew.hidden = !(session?.role == "host" &&
		(state.state == "expired" || state.state == "error"));
	roomJoin.disabled = state.state == "connecting";
	if (state.state == "error" && !session) {
		setInvitationView(false);
		roomEditor.hidden = false;
		roomNameDisplay.hidden = true;
		roomJoin.disabled = false;
		roomInput.disabled = false;
		roomRandom.disabled = false;
		leaveButton.hidden = true;
	}
	if (state.state == "error" && session?.role == "guest" && !session.ready) {
		if (room.guestOnly) {
			transport?.close();
			updateWebRTCGuest({ state: "closed", terminal: true });
			status.textContent = "Could not rejoin: " + state.message +
				". Ask the host to reopen the invitation.";
			return;
		}
		/* Keep the error visible, but restore solo controls after a failed join. */
		const message = state.message;
		leave();
		if (friendsMenu.hidden) toggleMenu();
		status.textContent = message;
	}
	if (state.state == "expired" || state.state == "error") {
		if (session?.role == "host") {
			setInvitationView(false);
			roomEditor.hidden = false;
			roomNameDisplay.hidden = true;
			roomInput.disabled = false;
			roomRandom.disabled = false;
		}
	}
	if (state.state == "open") {
		roomNameDisplay.textContent = room.name;
		roomNameDisplay.hidden = false;
		roomEditor.hidden = true;
		roomSharing.hidden = false;
		roomJoin.hidden = true;
		roomRandom.hidden = true;
		roomInput.value = room.name;
		const url = new URL(location.href);
		url.search = "";
		url.hash = "room=" + room.name;
		roomLink = url.href;
	}
}

function joinRoom(requestedName = roomInput.value, random = false, guestOnly = false) {
	const { RoomSignaling, normalizeRoomName, validRoomName } = globalThis.LogosFriends;
	const name = normalizeRoomName(requestedName);
	if (!validRoomName(name)) {
		roomInput.setCustomValidity("Use letters, numbers, and spaces or hyphens (up to 64 characters).");
		roomInput.reportValidity();
		return;
	}
	roomInput.setCustomValidity("");
	const endpoint = document.querySelector('meta[name="logos-rooms-endpoint"]')?.content;
	if (!endpoint) {
		status.textContent = "Room connections are not configured in this copy of Logos.";
		return;
	}
	const existingHost = session?.role == "host";
	if (room) {
		const previous = room;
		room = null;
		previous.close();
	}
	roomInput.disabled = true;
	roomRandom.disabled = true;
	leaveButton.hidden = false;
	leaveButton.textContent = existingHost ? "End multiplayer" : "Cancel";
	roomRenew.hidden = true;
	room = new RoomSignaling({
		name, endpoint, hostOnly: existingHost || random, guestOnly,
		randomName: random ? globalThis.LogosFriends.generateRoomName : null,
		onRole(role) {
			if (existingHost) return transport;
			beginSession(role);
			const update = role == "host" ? updateWebRTCHost : updateWebRTCGuest;
			const Transport = role == "host" ? WebRTCHostTransport : WebRTCGuestTransport;
			const next = new Transport(session, {
				playerName: playerName(role),
				onChange(state) {
					if (transport === next) update(state);
				},
			});
			transport = next;
			return transport;
		},
		onState: roomInvitationStatus,
	});
	room.start();
}

roomInput.value = "";
roomInput.addEventListener("input", () => roomInput.setCustomValidity(""));
roomInput.addEventListener("keydown", event => {
	if (event.key == "Enter") {
		event.preventDefault();
		if (!roomJoin.hidden && !roomJoin.disabled) joinRoom();
	}
});
roomRandom.addEventListener("click", () => {
	joinRoom(globalThis.LogosFriends.generateRoomName(), true);
});
roomJoin.addEventListener("click", () => joinRoom());
roomRenew.addEventListener("click", function() {
	if (room?.role == "host" && roomInput.value == room.name) room.renew();
	else joinRoom();
});
rejoinButton.addEventListener("click", function() {
	rejoinButton.disabled = true;
	joinRoom(room.name, false, true);
});
friendsMenu.querySelector("#friends-copy-room").addEventListener("click", async function() {
	try {
		await navigator.clipboard.writeText(roomLink);
		showCopied(this);
	} catch (e) {
		window.prompt("Copy this invitation link:", roomLink);
	}
});
window.addEventListener("pagehide", () => room?.close());

function readRoomLink() {
	const name = new URLSearchParams(location.hash.slice(1)).get("room");
	if (name === null || session) return;
	roomInput.value = globalThis.LogosFriends.normalizeRoomName(name);
	setInvitationView(globalThis.LogosFriends.validRoomName(roomInput.value));
	if (friendsMenu.hidden) toggleMenu();
	if (normalizePlayerName(nameInput.value, "")) {
		joinRoom();
	} else {
		status.textContent = "Enter your name, then join the room.";
		nameInput.focus();
	}
}
readRoomLink();

friendsButton.addEventListener("click", toggleMenu);
document.querySelector("#friends-roster-button").addEventListener("click", toggleMenu);
friendsMenu.querySelector(".modal-close").addEventListener("click", toggleMenu);
friendsMenu.addEventListener("click", function(event) {
	if (event.target == friendsMenu)
		toggleMenu();
});
nameInput.addEventListener("change", function() {
	if (!session) return;
	const name = playerName(session.role);
	if (transport) transport.playerName = name;
	session.setPlayerName(name);
});
nameInput.addEventListener("input", function() {
	try {
		localStorage.setItem("multiplayerPlayerName", nameInput.value);
	} catch (e) {
		/* Keep the name for this page even if it cannot be persisted. */
	}
});
leaveButton.addEventListener("click", leave);

})();
