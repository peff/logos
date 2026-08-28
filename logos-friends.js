import { MultiplayerSession } from "./logos-multiplayer.js";
import { BroadcastRoomTransport, normalizeRoomId } from "./logos-broadcast.js";

var friendsButton = document.querySelector("#friends-button");
var friendsMenu = document.querySelector("#friends-menu");
var status = friendsMenu.querySelector(".friends-status");
var roomDisplay = friendsMenu.querySelector(".friends-room-id");
var joinInput = friendsMenu.querySelector("#friends-room-input");
var hostButton = friendsMenu.querySelector("#friends-host");
var joinButton = friendsMenu.querySelector("#friends-join");
var leaveButton = friendsMenu.querySelector("#friends-leave");
var copyButton = friendsMenu.querySelector("#friends-copy-room");
var newGameButton = document.querySelector("#new-game-button");
var session = null;
var transport = null;

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

function updateRoom(state) {
	if (!session)
		return;
	var count = state.players.size;
	if (session.role == "host") {
		status.textContent = count == 1 ?
			"Hosting; waiting for another tab to join." :
			"Hosting a game with " + count + " players.";
		friendsButton.value = "Friends (hosting)";
	} else {
		status.textContent = state.connected ?
			"Connected to the host." : "Looking for the host...";
		friendsButton.value = state.connected ?
			"Friends (joined)" : "Friends (joining)";
	}
}

function begin(role, roomId) {
	if (transport)
		transport.close();
	var id = playerId();
	session = new MultiplayerSession(window.puzzle, {
		role: role,
		playerId: id,
	});
	if (role == "host")
		startSharedGame();
	transport = new BroadcastRoomTransport(session, {
		roomId: roomId,
		playerName: role == "host" ? "Host" : "Guest",
		onChange: updateRoom,
	});
	roomDisplay.textContent = roomId;
	roomDisplay.closest(".friends-room").hidden = false;
	hostButton.hidden = true;
	joinButton.hidden = true;
	joinInput.hidden = true;
	leaveButton.hidden = false;
	setGameControlsDisabled(true);
	newGameButton.disabled = role != "host";
	newGameButton.onclick = role == "host" ? startSharedGame : null;
}

function leave() {
	if (transport)
		transport.close();
	transport = null;
	session = null;
	status.textContent = "Host a game or join one from another tab.";
	roomDisplay.closest(".friends-room").hidden = true;
	hostButton.hidden = false;
	joinButton.hidden = false;
	joinInput.hidden = false;
	leaveButton.hidden = true;
	joinInput.value = "";
	joinInput.setCustomValidity("");
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

friendsButton.addEventListener("click", toggleMenu);
friendsMenu.querySelector(".modal-close").addEventListener("click", toggleMenu);
friendsMenu.addEventListener("click", function(event) {
	if (event.target == friendsMenu)
		toggleMenu();
});
hostButton.addEventListener("click", function() {
	begin("host", randomHex(3));
});
joinButton.addEventListener("click", function() {
	var roomId = normalizeRoomId(joinInput.value);
	if (!roomId) {
		joinInput.setCustomValidity("Enter the host's room code.");
		joinInput.reportValidity();
		return;
	}
	joinInput.setCustomValidity("");
	begin("guest", roomId);
});
joinInput.addEventListener("keydown", function(event) {
	if (event.key == "Enter")
		joinButton.click();
});
copyButton.addEventListener("click", async function() {
	try {
		await navigator.clipboard.writeText(roomDisplay.textContent);
		copyButton.textContent = "Copied";
		setTimeout(function() { copyButton.textContent = "Copy"; }, 1200);
	} catch (e) {
		window.prompt("Copy this room code:", roomDisplay.textContent);
	}
});
leaveButton.addEventListener("click", leave);
