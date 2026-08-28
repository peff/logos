import { MultiplayerSession } from "./logos-multiplayer.js";
import {
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
} from "./logos-webrtc.js";

var friendsButton = document.querySelector("#friends-button");
var friendsMenu = document.querySelector("#friends-menu");
var status = friendsMenu.querySelector(".friends-status");
var startControls = friendsMenu.querySelector(".friends-start");
var hostControls = friendsMenu.querySelector(".friends-host-controls");
var guestControls = friendsMenu.querySelector(".friends-guest-controls");
var leaveButton = friendsMenu.querySelector("#friends-leave");
var newGameButton = document.querySelector("#new-game-button");
var invitationInput = friendsMenu.querySelector("#friends-invitation-input");
var answerInput = friendsMenu.querySelector("#friends-answer-input");
var answerOutput = friendsMenu.querySelector("#friends-answer-output");
var playerList = friendsMenu.querySelector(".friends-player-list");
var session = null;
var transport = null;
var guestEntries = new Map();
var nextGuest = 1;

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

function startSharedGame() {
	session.start(parseInt(randomHex(4), 16));
}

function beginSession(role) {
	if (transport)
		transport.close();
	session = new MultiplayerSession(window.puzzle, {
		role,
		playerId: playerId(),
	});
	if (role == "host")
		startSharedGame();
	startControls.hidden = true;
	hostControls.hidden = role != "host";
	guestControls.hidden = role != "guest";
	leaveButton.hidden = false;
	leaveButton.textContent = role == "host" ?
		"End multiplayer" : "Leave multiplayer";
	setGameControlsDisabled(true);
	newGameButton.disabled = role != "host";
	newGameButton.onclick = role == "host" ? startSharedGame : null;
}

function updateWebRTCHost(state) {
	var entry = guestEntries.get(state.connectionId);
	if (entry) {
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
	friendsButton.value = "Friends (hosting)";
}

function updateWebRTCGuest(state) {
	if (state.connected) {
		status.textContent = "Connected to the host.";
		friendsButton.value = "Friends (joined)";
		if (!friendsMenu.hidden)
			toggleMenu();
	} else if (state.state == "disconnected") {
		status.textContent = "The connection to the host was interrupted.";
		friendsButton.value = "Friends (disconnected)";
	} else if (state.state == "failed" || state.state == "closed") {
		status.textContent = "The connection to the host closed. " +
			"Leave the game to return to single-player.";
		friendsButton.value = "Friends (disconnected)";
	} else {
		status.textContent = "Send the response to the host and wait for connection.";
		friendsButton.value = "Friends (connecting)";
	}
}

function hostWebRTC() {
	beginSession("host");
	transport = new WebRTCHostTransport(session, {
		onChange: updateWebRTCHost,
	});
	status.textContent = "Hosting a game.";
}

function addGuestEntry() {
	var entry = document.createElement("div");
	entry.className = "friends-player";
	var heading = document.createElement("div");
	heading.className = "friends-player-heading";
	var name = document.createElement("span");
	name.textContent = "Guest " + nextGuest++;
	var entryStatus = document.createElement("span");
	entryStatus.className = "friends-player-status";
	entryStatus.textContent = "Inviting";
	heading.append(name, entryStatus);
	var invitation = document.createElement("div");
	invitation.className =
		"friends-player-invitation friends-signal-controls";
	var field = document.createElement("input");
	field.type = "text";
	field.readOnly = true;
	field.setAttribute("aria-label", "Invitation for " + name.textContent);
	var copy = document.createElement("button");
	copy.type = "button";
	copy.textContent = "Copy";
	copy.disabled = true;
	copy.addEventListener("click", function() {
		copyField(field, copy);
	});
	invitation.append(field, copy);
	entry.append(heading, invitation);
	playerList.append(entry);
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
	try {
		await decodeSignal(invitationInput.value, "offer");
	} catch (e) {
		status.textContent = e.message;
		return;
	}
	beginSession("guest");
	transport = new WebRTCGuestTransport(session, {
		onChange: updateWebRTCGuest,
	});
	status.textContent = "Finding connection routes...";
	try {
		answerOutput.value =
			await transport.acceptInvitation(invitationInput.value);
		status.textContent = "Send this response back to the host.";
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
	if (transport)
		transport.close();
	transport = null;
	session = null;
	guestEntries.clear();
	playerList.replaceChildren();
	nextGuest = 1;
	status.textContent = "Host a game or paste an invitation from a friend.";
	startControls.hidden = false;
	hostControls.hidden = true;
	guestControls.hidden = true;
	leaveButton.hidden = true;
	for (var field of friendsMenu.querySelectorAll("textarea, input[type=text]")) {
		field.value = "";
		field.setCustomValidity("");
	}
	friendsButton.value = "Play with friends";
	setGameControlsDisabled(false);
	newGameButton.disabled = false;
	newGameButton.onclick = function() { window.puzzle.newGame(); };
}

function toggleMenu() {
	if (!window.puzzle.options.hidden)
		window.puzzle.toggleOptions();
	window.puzzle.toggleModal(friendsMenu, friendsButton, "Close");
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
friendsMenu.querySelector(".modal-close").addEventListener("click", toggleMenu);
friendsMenu.addEventListener("click", function(event) {
	if (event.target == friendsMenu)
		toggleMenu();
});
friendsMenu.querySelector("#friends-host").addEventListener("click", hostWebRTC);
friendsMenu.querySelector("#friends-join").addEventListener("click", joinWebRTC);
friendsMenu.querySelector("#friends-add-guest").addEventListener(
	"click", createInvitation);
friendsMenu.querySelector("#friends-accept-answer").addEventListener(
	"click", acceptAnswer);
friendsMenu.querySelector("#friends-copy-answer").addEventListener(
	"click", function() { copyField("#friends-answer-output", this); });
leaveButton.addEventListener("click", leave);
window.addEventListener("pagehide", function() {
	if (transport)
		leave();
});
