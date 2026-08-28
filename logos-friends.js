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
var invitationOutput = friendsMenu.querySelector("#friends-invitation-output");
var invitationInput = friendsMenu.querySelector("#friends-invitation-input");
var answerInput = friendsMenu.querySelector("#friends-answer-input");
var answerOutput = friendsMenu.querySelector("#friends-answer-output");
var session = null;
var transport = null;
var displayedInvitationId = null;

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
	setGameControlsDisabled(true);
	newGameButton.disabled = role != "host";
	newGameButton.onclick = role == "host" ? startSharedGame : null;
}

function updateWebRTCHost(state) {
	var players = state.connected + 1;
	if (state.connected)
		status.textContent = "Hosting a game with " + players + " players.";
	else if (state.state == "connecting")
		status.textContent = "Connecting to the guest...";
	else
		status.textContent = "Hosting; create an invitation for each guest.";
	friendsButton.value = "Friends (hosting)";
}

function updateWebRTCGuest(state) {
	if (state.connected) {
		status.textContent = "Connected to the host.";
		friendsButton.value = "Friends (joined)";
	} else if (state.state == "disconnected") {
		status.textContent = "The connection to the host closed.";
		friendsButton.value = "Friends (disconnected)";
	} else {
		status.textContent = "Send the answer to the host and wait for connection.";
		friendsButton.value = "Friends (connecting)";
	}
}

async function hostWebRTC() {
	beginSession("host");
	transport = new WebRTCHostTransport(session, {
		onChange: updateWebRTCHost,
	});
	status.textContent = "Finding connection routes...";
	await createInvitation();
}

async function createInvitation() {
	invitationOutput.value = "";
	displayedInvitationId = null;
	try {
		invitationOutput.value = await transport.createInvitation();
		displayedInvitationId = (await decodeSignal(
			invitationOutput.value, "offer")).connectionId;
		status.textContent = "Send this invitation to one guest.";
	} catch (e) {
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
		status.textContent = "Send this answer back to the host.";
	} catch (e) {
		status.textContent = e.message;
	}
}

async function acceptAnswer() {
	if (!answerInput.value.trim()) {
		answerInput.setCustomValidity("Paste the guest's answer.");
		answerInput.reportValidity();
		return;
	}
	answerInput.setCustomValidity("");
	try {
		var answer = await decodeSignal(answerInput.value, "answer");
		await transport.acceptAnswer(answerInput.value);
		answerInput.value = "";
		if (answer.connectionId == displayedInvitationId) {
			invitationOutput.value = "";
			displayedInvitationId = null;
		}
	} catch (e) {
		status.textContent = e.message;
	}
}

function leave() {
	if (transport)
		transport.close();
	transport = null;
	session = null;
	displayedInvitationId = null;
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
	var field = friendsMenu.querySelector(selector);
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
friendsMenu.querySelector("#friends-create-invitation").addEventListener(
	"click", createInvitation);
friendsMenu.querySelector("#friends-accept-answer").addEventListener(
	"click", acceptAnswer);
friendsMenu.querySelector("#friends-copy-invitation").addEventListener(
	"click", function() { copyField("#friends-invitation-output", this); });
friendsMenu.querySelector("#friends-copy-answer").addEventListener(
	"click", function() { copyField("#friends-answer-output", this); });
leaveButton.addEventListener("click", leave);
