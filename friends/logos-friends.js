(function() {

var {
	MultiplayerSession,
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	normalizePlayerName,
} = globalThis.LogosFriends;

var friendsButton = document.querySelector("#friends-button");
var friendsBadgeCaption = friendsButton.querySelector(".friends-badge-caption");
var friendsMenu = document.querySelector("#friends-menu");
var status = friendsMenu.querySelector(".friends-status");
var nameControls = friendsMenu.querySelector(".friends-name-controls");
var startControls = friendsMenu.querySelector(".friends-start");
var hostControls = friendsMenu.querySelector(".friends-host-controls");
var guestControls = friendsMenu.querySelector(".friends-guest-controls");
var leaveButton = friendsMenu.querySelector("#friends-leave");
var newGameButton = document.querySelector("#new-game-button");
var invitationInput = friendsMenu.querySelector("#friends-invitation-input");
var answerInput = friendsMenu.querySelector("#friends-answer-input");
var answerOutput = friendsMenu.querySelector("#friends-answer-output");
var nameInput = friendsMenu.querySelector("#friends-player-name");
var playerList = friendsMenu.querySelector(".friends-player-list");
var roster = document.querySelector("#friends-roster");
var rosterPlayers = document.querySelector("#friends-roster-players");
var rosterStatus = document.querySelector("#friends-roster-status");
var rosterConnection = "connecting";
var session = null;
var transport = null;
var guestEntries = new Map();
var nextGuest = 1;
var invitationPreview = 0;
var historyHighlight = null;

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
	document.querySelector("#start-game-button").disabled = disabled;
	document.querySelector("#game-seed").disabled = disabled;
	document.querySelector("#practice-mode").disabled = disabled;
	document.querySelector("#continue-after-loss").disabled = disabled;
}

function beginSession(role) {
	invitationPreview++;
	if (transport)
		transport.close();
	session = new MultiplayerSession(window.puzzle, {
		role,
		playerId: playerId(),
		playerName: playerName(role),
		onPlayersChanged: renderPlayers,
	});
	rosterConnection = role == "host" ? "connected" : "connecting";
	roster.hidden = false;
	document.body.classList.add("multiplayer");
	renderPlayers(session.players);
	startControls.hidden = true;
	nameControls.hidden = true;
	hostControls.hidden = role != "host";
	guestControls.hidden = role != "guest";
	leaveButton.hidden = false;
	leaveButton.textContent = role == "host" ?
		"End multiplayer" : "Leave multiplayer";
	setGameControlsDisabled(true);
	newGameButton.onclick = function() { session.requestNewGame(); };
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
	clearHistoryHighlight();
	newGameButton.disabled = !!session && !session.ready;
	rosterPlayers.replaceChildren();
	for (var player of players) {
		var entry = document.createElement("li");
		entry.dataset.state = player.state;
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
		rosterStatus.textContent = "Disconnected";
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

async function previewInvitation() {
	var preview = ++invitationPreview;
	var blob = invitationInput.value.trim();
	if (!blob) {
		status.textContent =
			"Host a game or paste an invitation from a friend.";
		return;
	}
	try {
		var invitation = await decodeSignal(blob, "offer");
		if (preview == invitationPreview)
			status.textContent = "Invitation from " +
				invitation.playerName + ".";
	} catch (e) {
		/* Report malformed invitations only when the player submits one. */
	}
}

function updateWebRTCHost(state) {
	var entry = guestEntries.get(state.connectionId);
	if (entry) {
		if (state.playerName)
			entry.querySelector(".friends-player-name").textContent =
				state.playerName;
		var entryStatus = entry.querySelector(".friends-player-status");
		if (state.state == "connecting") {
			entryStatus.textContent = "Connecting";
			entry.querySelector(".friends-player-invitation").hidden = true;
		} else if (state.state == "connected") {
			entryStatus.textContent = "Connected";
			entry.dataset.connected = "true";
			entry.querySelector(".friends-player-invitation").hidden = true;
		} else if (state.state == "disconnected") {
			entryStatus.textContent = "Interrupted";
			delete entry.dataset.connected;
		} else if (state.state == "failed" || state.state == "closed") {
			entryStatus.textContent = entry.dataset.connected ?
				"Disconnected" : "Failed";
			delete entry.dataset.connected;
			entry.querySelector(".friends-player-invitation").hidden = true;
		}
	}
	if (playerList.children.length &&
	    Array.from(playerList.children).every(function(guest) {
		return guest.dataset.connected;
	    }) && !friendsMenu.hidden)
		toggleMenu();
	var players = state.connected + 1;
	if (state.state == "failed")
		status.textContent = "A guest connection failed.";
	else if (state.state == "disconnected")
		status.textContent = "A guest connection was interrupted.";
	else if (state.connected)
		status.textContent = "Hosting a game with " + players + " players.";
	else if (state.state == "connecting")
		status.textContent = "Connecting to the guest...";
	else
		status.textContent = "Hosting a game.";
	friendsBadgeCaption.textContent = "Hosting";
}

function updateWebRTCGuest(state) {
	rosterConnection = state.connected ? "connected" :
		state.state == "disconnected" ? "disconnected" :
		state.terminal || state.state == "closed" ? "closed" : "connecting";
	renderPlayers(session?.players || []);
	if (state.connected) {
		status.textContent = "Connected to the host.";
		friendsBadgeCaption.textContent = "Joined";
		if (!friendsMenu.hidden)
			toggleMenu();
	} else if (state.state == "disconnected") {
		status.textContent = "The connection to the host was interrupted.";
		friendsBadgeCaption.textContent = "Disconnected";
	} else if (state.state == "failed" || state.state == "closed") {
		status.textContent = "The connection to the host closed. " +
			"Leave the game to return to single-player.";
		friendsBadgeCaption.textContent = "Disconnected";
	} else {
		status.textContent = "Send the response to the host and wait for connection.";
		friendsBadgeCaption.textContent = "Connecting";
	}
}

function hostWebRTC() {
	beginSession("host");
	var hostName = playerName("host");
	addHostEntry(hostName);
	transport = new WebRTCHostTransport(session, {
		playerName: hostName,
		onChange: updateWebRTCHost,
	});
	status.textContent = "Hosting a game.";
}

function addPlayerHeading(entry, playerName, playerStatus) {
	var heading = document.createElement("div");
	heading.className = "friends-player-heading";
	var name = document.createElement("span");
	name.className = "friends-player-name";
	name.textContent = playerName;
	var entryStatus = document.createElement("span");
	entryStatus.className = "friends-player-status";
	entryStatus.textContent = playerStatus;
	heading.append(name, entryStatus);
	entry.append(heading);
	return entryStatus;
}

function addHostEntry(name) {
	var entry = document.createElement("div");
	entry.className = "friends-player";
	entry.dataset.connected = "true";
	addPlayerHeading(entry, name, "Hosting");
	playerList.append(entry);
}

function addGuestEntry() {
	var entry = document.createElement("div");
	entry.className = "friends-player";
	var guestName = "Guest " + nextGuest++;
	var entryStatus = addPlayerHeading(entry, guestName, "Inviting");
	var invitation = document.createElement("div");
	invitation.className =
		"friends-player-invitation friends-signal-controls";
	var field = document.createElement("input");
	field.type = "text";
	field.readOnly = true;
	field.setAttribute("aria-label", "Invitation for " + guestName);
	var copy = document.createElement("button");
	copy.type = "button";
	copy.textContent = "Copy";
	copy.disabled = true;
	copy.addEventListener("click", function() {
		copyField(field, copy);
	});
	invitation.append(field, copy);
	entry.append(invitation);
	playerList.append(entry);
	playerList.classList.add("friends-has-guests");
	return { entry, field, copy, status: entryStatus };
}

async function createInvitation() {
	var guest = addGuestEntry();
	try {
		guest.field.value = await transport.createInvitation();
		var signal = await decodeSignal(guest.field.value, "offer");
		guestEntries.set(signal.connectionId, guest.entry);
		guest.copy.disabled = false;
	} catch (e) {
		guest.status.textContent = "Failed";
		guest.entry.querySelector(".friends-player-invitation").hidden = true;
		status.textContent = e.message;
	}
}

async function joinWebRTC() {
	if (!invitationInput.value.trim()) {
		invitationInput.setCustomValidity("Paste the host's invitation.");
		invitationInput.reportValidity();
		return;
	}
	invitationInput.setCustomValidity("");
	var invitation;
	try {
		invitation = await decodeSignal(invitationInput.value, "offer");
	} catch (e) {
		status.textContent = e.message;
		return;
	}
	beginSession("guest");
	transport = new WebRTCGuestTransport(session, {
		playerName: playerName("guest"),
		onChange: updateWebRTCGuest,
	});
	status.textContent = "Preparing a response for " +
		invitation.playerName + "...";
	try {
		answerOutput.value =
			await transport.acceptInvitation(invitationInput.value);
		status.textContent = "Send this response back to " +
			invitation.playerName + ".";
	} catch (e) {
		status.textContent = e.message;
	}
}

async function acceptAnswer() {
	if (!answerInput.value.trim()) {
		answerInput.setCustomValidity("Paste the guest's response.");
		answerInput.reportValidity();
		return;
	}
	answerInput.setCustomValidity("");
	try {
		await decodeSignal(answerInput.value, "answer");
		await transport.acceptAnswer(answerInput.value);
		answerInput.value = "";
	} catch (e) {
		status.textContent = e.message;
	}
}

function leave() {
	clearHistoryHighlight();
	if (transport)
		transport.close();
	transport = null;
	session = null;
	newGameButton.disabled = false;
	roster.hidden = true;
	document.body.classList.remove("multiplayer");
	rosterPlayers.replaceChildren();
	guestEntries.clear();
	playerList.replaceChildren();
	playerList.classList.remove("friends-has-guests");
	nextGuest = 1;
	status.textContent = "Host a game or paste an invitation from a friend.";
	startControls.hidden = false;
	nameControls.hidden = false;
	hostControls.hidden = true;
	guestControls.hidden = true;
	leaveButton.hidden = true;
	for (var field of friendsMenu.querySelectorAll("textarea, input[type=text]")) {
		if (field == nameInput)
			continue;
		field.value = "";
		field.setCustomValidity("");
	}
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

async function copyField(selector, button) {
	var field = typeof selector == "string" ?
		friendsMenu.querySelector(selector) : selector;
	var text = field.value || field.textContent;
	field.focus();
	field.select();
	field.setSelectionRange(0, text.length);
	try {
		if (document.execCommand("copy")) {
			showCopied(button);
			return;
		}
	} catch (e) {
		/* Try the modern API or a manual fallback below. */
	}
	try {
		await navigator.clipboard.writeText(text);
		showCopied(button);
	} catch (e) {
		window.prompt("Copy this connection message:", text);
	}
}

function showCopied(button) {
	var old = button.textContent;
	button.textContent = "Copied";
	setTimeout(function() { button.textContent = old; }, 1200);
}

friendsButton.addEventListener("click", toggleMenu);
document.querySelector("#friends-roster-button").addEventListener("click", toggleMenu);
friendsMenu.querySelector(".modal-close").addEventListener("click", toggleMenu);
friendsMenu.addEventListener("click", function(event) {
	if (event.target == friendsMenu)
		toggleMenu();
});
friendsMenu.querySelector("#friends-host").addEventListener("click", hostWebRTC);
friendsMenu.querySelector("#friends-join").addEventListener("click", joinWebRTC);
invitationInput.addEventListener("input", previewInvitation);
nameInput.addEventListener("input", function() {
	try {
		localStorage.setItem("multiplayerPlayerName", nameInput.value);
	} catch (e) {
		/* Keep the name for this page even if it cannot be persisted. */
	}
});
friendsMenu.querySelector("#friends-add-guest").addEventListener(
	"click", createInvitation);
friendsMenu.querySelector("#friends-accept-answer").addEventListener(
	"click", acceptAnswer);
friendsMenu.querySelector("#friends-copy-answer").addEventListener(
	"click", function() { copyField("#friends-answer-output", this); });
leaveButton.addEventListener("click", leave);

})();
