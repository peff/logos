import { Logos, makePuzzle } from "./logos-test.js";
import "../friends/logos-multiplayer.js";
import "../friends/logos-webrtc.js";

const {
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	encodeSignal,
	normalizePlayerName,
} = globalThis.LogosFriends;

function assert(condition, message) {
	if (!condition)
		throw new Error(message || "assertion failed");
}

function boardState(puzzle) {
	return JSON.stringify({
		gameOver: puzzle.gameOver,
		rows: puzzle.rows.map(row => row.slots.map(slot => ({
			single: slot.single,
			possible: slot.possible,
		}))),
	});
}

function makeSession(role, playerId) {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	const session = new MultiplayerSession(puzzle, { role, playerId });
	return { puzzle, session };
}

function stopAll(...games) {
	for (const game of games) {
		game.session.leave();
		game.puzzle.stopTimer();
		game.puzzle.say("");
	}
}

function wrongMove(puzzle, rowStart = 0) {
	for (let offset = 0; offset < puzzle.rows.length; offset++) {
		const row = puzzle.rows[(rowStart + offset) % puzzle.rows.length];
		for (const slot of row.slots) {
			if (slot.single)
				continue;
			for (let value = 0; value < slot.possible.length; value++)
				if (value != slot.value && slot.possible[value])
					return { slot, value };
		}
	}
	throw new Error("no wrong move is available");
}

Deno.test("multiplayer routes host and guest actions through the host", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x12345678);
	network.addGuest(guest.session);

	assert(boardState(host.puzzle) == boardState(guest.puzzle),
	       "the guest did not receive the initial game");

	let move = wrongMove(host.puzzle);
	host.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 1 && guest.session.revision == 1 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "a host action did not synchronize");

	move = wrongMove(guest.puzzle, 1);
	guest.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 2 && guest.session.revision == 2 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "a guest action did not synchronize");
	stopAll(host, guest);
});

Deno.test("a late multiplayer guest reconstructs the command history", function() {
	const host = makeSession("host", "host");
	host.session.start(0x87654321);

	for (let column = 0; column < 3; column++) {
		const move = wrongMove(host.puzzle, column);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
	}

	const guest = makeSession("guest", "late");
	new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
	assert(guest.session.revision == host.session.revision &&
	       boardState(guest.puzzle) == boardState(host.puzzle),
	       "the late guest did not replay the host history");
	assert(guest.puzzle.sounds.length == 0,
	       "history replay produced move sounds");
	stopAll(host, guest);
});

Deno.test("remote moves dismiss exhausted clues locally", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	let dismissals = 0;
	guest.puzzle.dismissExhaustedClues = function() { dismissals++; };
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x76543210);
	network.addGuest(guest.session);
	dismissals = 0;

	const move = wrongMove(host.puzzle);
	host.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(dismissals == 1,
	       "a remote commit did not check the guest's exhausted clues");
	stopAll(host, guest);
});

Deno.test("history replay checks exhausted clues after each tile move", function() {
	const host = makeSession("host", "host");
	host.session.start(0x13572468);
	for (let i = 0; i < 3; i++) {
		const move = wrongMove(host.puzzle, i);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
	}

	const guest = makeSession("guest", "late");
	let dismissals = 0;
	guest.puzzle.dismissExhaustedClues = function() { dismissals++; };
	new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
	assert(dismissals == 3,
	       "history replay did not preserve clue dismissal order");
	stopAll(host, guest);
});

Deno.test("stale multiplayer commands are rejected and resynchronized", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const queued = [];
	host.session.start(0xabcdef01);
	guest.session.connectHost(message => queued.push(message));
	host.session.addPeer("alice", message =>
		guest.session.receive("host", message));

	const guestMove = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(
		guestMove.slot, guestMove.value, "remove");
	assert(queued.length == 1, "the guest command was not queued");

	const hostMove = wrongMove(host.puzzle, 1);
	host.puzzle.requestTileAction(hostMove.slot, hostMove.value, "remove");
	host.session.receive("alice", queued.shift());

	assert(guest.session.lastRejection &&
	       guest.session.lastRejection.reason == "stale-or-inapplicable" &&
	       guest.session.revision == host.session.revision &&
	       boardState(guest.puzzle) == boardState(host.puzzle),
	       "the stale guest was not rejected and resynchronized");
	stopAll(host, guest);
});

Deno.test("an accepted mistake loses the multiplayer game for everyone", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x10203040);
	network.addGuest(guest.session);

	const move = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(move.slot, move.value, "place");
	assert(host.puzzle.gameOver && guest.puzzle.gameOver &&
	       host.session.revision == 1 && guest.session.revision == 1,
	       "a guest mistake was not committed as a shared loss");
	stopAll(host, guest);
});

Deno.test("multiplayer pencil marks remain local", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x31415926);
	network.addGuest(guest.session);

	const slot = guest.puzzle.rows[0].slots[0];
	guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
	assert(guest.puzzle.pencilMarks.length == 1 &&
	       host.puzzle.pencilMarks.length == 0 &&
	       host.session.revision == 0 && guest.session.revision == 0,
	       "a private pencil mark entered shared state");
	stopAll(host, guest);
});

Deno.test("the host's multiplayer rules override guest preferences", function() {
	const host = makeSession("host", "host");
	const guestPuzzle = makePuzzle(6, true, Logos.defaultSymbols);
	guestPuzzle.practiceModePreference = true;
	guestPuzzle.continueAfterLoss = true;
	const guest = {
		puzzle: guestPuzzle,
		session: new MultiplayerSession(guestPuzzle, {
			role: "guest",
			playerId: "alice",
		}),
	};
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x42424242);
	network.addGuest(guest.session);

	assert(!guest.puzzle.practiceMode &&
	       !guest.puzzle.continueAfterLoss && !guest.puzzle.scoreEligible,
	       "the guest retained conflicting single-player rules");
	guest.session.leave();
	assert(guest.puzzle.practiceModePreference &&
	       guest.puzzle.continueAfterLoss &&
	       !guest.puzzle.actionController,
	       "leaving did not restore the guest's preferences");
	stopAll(host, guest);
});

Deno.test("the host can start a new shared game", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x11111111);
	network.addGuest(guest.session);

	const move = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(move.slot, move.value, "place");
	assert(host.puzzle.gameOver && guest.puzzle.gameOver,
	       "the first game did not end");
	host.session.start(0x22222222);
	assert(!host.puzzle.gameOver && !guest.puzzle.gameOver &&
	       host.session.revision == 0 && guest.session.revision == 0 &&
	       host.puzzle.seed == 0x22222222 &&
	       guest.puzzle.seed == 0x22222222 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the replacement game was not synchronized");
	stopAll(host, guest);
});

function fakeWebRTCFactory(options) {
	options = options || {};
	let nextPeer = 1;
	const offers = new Map();
	const answers = new Map();
	const peers = [];

	class FakeChannel {
		constructor() {
			this.readyState = "connecting";
			this.peer = null;
			this.closed = false;
		}
		send(data) {
			if (this.readyState != "open")
				throw new Error("sent on a closed data channel");
			if (this.peer.onmessage)
				this.peer.onmessage({ data });
		}
		close() {
			if (this.closed)
				return;
			this.closed = true;
			this.readyState = "closed";
			if (this.onclose)
				this.onclose();
			if (this.peer)
				this.peer.close();
		}
	}

	class FakePeerConnection {
		constructor(configuration) {
			this.id = nextPeer++;
			this.configuration = configuration;
			this.iceGatheringState = options.gatherIce === false ||
				options.gatherIce == "srflx" ?
				"gathering" : "complete";
			this.connectionState = "new";
			this.localDescription = null;
			this.remoteDescription = null;
			this.channel = null;
			peers.push(this);
		}
		createDataChannel() {
			return this.channel = new FakeChannel();
		}
		async createOffer() {
			offers.set(this.id, this);
			return { type: "offer", sdp: "offer:" + this.id };
		}
		async createAnswer() {
			const offerId = Number(this.remoteDescription.sdp.split(":")[1]);
			const key = offerId + ":" + this.id;
			answers.set(key, this);
			return { type: "answer", sdp: "answer:" + key };
		}
		async setLocalDescription(description) {
			this.localDescription = description;
			if (options.gatherIce == "srflx")
				this.localDescription.sdp +=
					" a=candidate:1 1 udp 1 192.0.2.1 1234 typ srflx";
		}
		async setRemoteDescription(description) {
			this.remoteDescription = description;
			if (description.type != "answer")
				return;
			const key = description.sdp.slice("answer:".length);
			const guest = answers.get(key);
			assert(offers.get(this.id) == this && guest,
			       "the fake answer did not match its offer");
			if (options.connect === false) {
				this.setConnectionState("connecting");
				guest.setConnectionState("connecting");
				return;
			}
			const guestChannel = new FakeChannel();
			guest.channel = guestChannel;
			this.channel.peer = guestChannel;
			guestChannel.peer = this.channel;
			guest.ondatachannel({ channel: guestChannel });
			this.channel.readyState = guestChannel.readyState = "open";
			if (guestChannel.onopen)
				guestChannel.onopen();
			if (this.channel.onopen)
				this.channel.onopen();
			this.setConnectionState("connected");
			guest.setConnectionState("connected");
		}
		addEventListener() {}
		removeEventListener() {}
		setConnectionState(state) {
			this.connectionState = state;
			if (this.onconnectionstatechange)
				this.onconnectionstatechange();
		}
		close() {
			if (this.connectionState == "closed")
				return;
			this.setConnectionState("closed");
			if (this.channel)
				this.channel.close();
		}
	}

	function factory(configuration) {
		return new FakePeerConnection(configuration);
	}
	factory.peers = peers;
	return factory;
}

Deno.test("WebRTC signaling blobs are compressed, versioned and typed", async function() {
	const blob = await encodeSignal({
		protocol: "logos-webrtc-1",
		type: "offer",
		connectionId: "connection",
		playerId: "host",
		playerName: "Host Person",
		description: { type: "offer", sdp: "test-Σ" },
	});
	const signal = await decodeSignal(blob, "offer");
	assert(signal.description.sdp == "test-Σ" &&
	       signal.playerName == "Host Person" && blob.startsWith("LOGOS1."),
	       "the signaling blob did not round trip");
	let rejected = false;
	try {
		await decodeSignal(blob, "answer");
	} catch (e) {
		rejected = true;
	}
	assert(rejected, "an offer was accepted where an answer was required");
});

Deno.test("WebRTC signaling keeps partial routes after an ICE timeout", async function() {
	const host = makeSession("host", "host-id");
	const transport = new WebRTCHostTransport(host.session, {
		peerConnectionFactory: fakeWebRTCFactory({ gatherIce: false }),
		iceGatheringTimeout: 1,
	});
	const invitation = await decodeSignal(
		await transport.createInvitation(), "offer");
	assert(invitation.description.sdp.startsWith("offer:"),
	       "the partial invitation did not retain its local description");
	transport.close();
	stopAll(host);
});

Deno.test("WebRTC signaling finishes after finding a public route", async function() {
	const host = makeSession("host", "host-id");
	const transport = new WebRTCHostTransport(host.session, {
		peerConnectionFactory: fakeWebRTCFactory({ gatherIce: "srflx" }),
		iceGatheringTimeout: 10000,
	});
	const invitation = await decodeSignal(
		await transport.createInvitation(), "offer");
	assert(invitation.description.sdp.includes("typ srflx"),
	       "the invitation did not retain its public route");
	transport.close();
	stopAll(host);
});

Deno.test("WebRTC player names are normalized as plain text", function() {
	const name = normalizePlayerName(
		"  <img src=x onerror=alert(1)>\n\u202e", "Guest");
	assert(name == "<img src=x onerror=alert(1)>",
	       "the signaling name was not normalized predictably");
	assert(normalizePlayerName("\u0000\n", "Guest") == "Guest",
	       "an empty signaling name did not use its fallback");
});

Deno.test("WebRTC transports connect sessions through offer and answer", async function() {
	const factory = fakeWebRTCFactory();
	const host = makeSession("host", "host-id");
	const guest = makeSession("guest", "guest-id");
	host.session.start(0x99887766);
	var hostState;
	const hostTransport = new WebRTCHostTransport(host.session, {
		peerConnectionFactory: factory,
		idFactory: () => "connection-id",
		playerName: "Helen",
		onChange: state => hostState = state,
	});
	var guestState;
	const guestTransport = new WebRTCGuestTransport(guest.session, {
		peerConnectionFactory: factory,
		playerName: "Grace",
		onChange: state => guestState = state,
	});

	const invitation = await hostTransport.createInvitation();
	const answer = await guestTransport.acceptInvitation(invitation);
	factory.peers[1].setConnectionState("failed");
	assert(guestState.state == "answer-ready" && !guestState.terminal,
	       "the guest abandoned an answer before it reached the host");
	await hostTransport.acceptAnswer(answer);
	assert(guest.session.ready && host.session.peers.has("guest-id") &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the WebRTC guest did not synchronize after connecting");
	assert(guest.session.players.map(player => player.name).join() == "Helen,Grace",
	       "the transport did not publish the names from signaling");
	assert(hostState.connectionId == "connection-id" &&
	       hostState.playerId == "guest-id" &&
	       hostState.playerName == "Grace",
	       "the WebRTC host did not identify the connected guest");
	assert(factory.peers.every(peer =>
	       peer.configuration.iceServers[0].urls ==
	       "stun:stun.cloudflare.com:3478"),
	       "the WebRTC peers did not use the default STUN server");
	const move = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 1 && guest.session.revision == 1 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the WebRTC data channel did not carry the guest move");
	factory.peers[0].setConnectionState("disconnected");
	assert(host.session.players[1].state == "interrupted",
	       "the transport did not mark the interrupted guest");
	assert(hostState.state == "disconnected",
	       "the WebRTC host did not report an interrupted connection");
	factory.peers[0].setConnectionState("connected");
	assert(host.session.players[1].state == "connected",
	       "the transport did not mark the recovered guest");
	assert(hostState.state == "connected",
	       "the WebRTC host did not report a recovered connection");
	factory.peers[1].setConnectionState("disconnected");
	assert(guestState.state == "disconnected",
	       "the WebRTC guest did not report an interrupted connection");
	factory.peers[1].setConnectionState("connected");
	assert(guestState.state == "connected",
	       "the WebRTC guest did not report a recovered connection");
	factory.peers[1].setConnectionState("failed");
	assert(!guest.session.ready,
	       "a failed WebRTC guest retained its multiplayer session");
	assert(guestState.state == "failed" && guestState.terminal,
	       "a failed WebRTC guest did not report a terminal failure");
	assert(!host.session.peers.has("guest-id"),
	       "a failed WebRTC guest remained attached to the host");

	guestTransport.close();
	hostTransport.close();
	stopAll(host, guest);
});

Deno.test("WebRTC hosts time out accepted answers which do not connect", async function() {
	const factory = fakeWebRTCFactory({ connect: false });
	const host = makeSession("host", "host-id");
	const guest = makeSession("guest", "guest-id");
	host.session.start(0x12345678);
	var hostState;
	const hostTransport = new WebRTCHostTransport(host.session, {
		peerConnectionFactory: factory,
		idFactory: () => "connection-id",
		connectionTimeout: 5,
		onChange: state => hostState = state,
	});
	const guestTransport = new WebRTCGuestTransport(guest.session, {
		peerConnectionFactory: factory,
	});

	const invitation = await hostTransport.createInvitation();
	const answer = await guestTransport.acceptInvitation(invitation);
	await hostTransport.acceptAnswer(answer);
	await new Promise(resolve => setTimeout(resolve, 20));
	assert(hostState.state == "failed" && hostTransport.pending.size == 0,
	       "an unconnected WebRTC answer remained pending");

	guestTransport.close();
	hostTransport.close();
	stopAll(host, guest);
});

Deno.test("manual clue choices reach all guests and survive replay", function() {
	const host = makeSession("host", "host");
	const alice = makeSession("guest", "alice");
	const bob = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x12345678);
	network.addGuest(alice.session);
	network.addGuest(bob.session);
	const index = host.puzzle.clues.findIndex(clue => clue.display);
	alice.puzzle.clues[index].listener({ preventDefault() {} });
	for (const game of [host, alice, bob])
		assert(!game.puzzle.clues[index].active,
		       "a guest dismissal was not shared");
	bob.puzzle.requestClueAction(bob.puzzle.clues[index], true);
	for (const game of [host, alice, bob])
		assert(game.puzzle.clues[index].active,
		       "a guest restoration was not shared");
	host.puzzle.requestClueAction(host.puzzle.clues[index], false);
	const late = makeSession("guest", "late");
	network.addGuest(late.session);
	assert(!late.puzzle.clues[index].active && late.session.revision == 3,
	       "a late guest lost the manual clue choice");
	stopAll(host, alice, bob, late);
});

Deno.test("continued multiplayer losses honor host preferences and replay", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.continueAfterLoss = true;
	const host = { puzzle, session: new MultiplayerSession(puzzle, {
		role: "host", playerId: "host",
	}) };
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	host.session.start(0x10203040);
	network.addGuest(guest.session);
	const mistake = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(mistake.slot, mistake.value, "place");
	for (const game of [host, guest])
		assert(game.puzzle.continuedFromLoss && game.puzzle.practiceMode &&
		       !game.puzzle.gameOver, "the shared loss did not allow continuation");
	const move = wrongMove(host.puzzle);
	host.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 2 && guest.session.revision == 2 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "a move after the loss did not synchronize");
	const late = makeSession("guest", "late");
	network.addGuest(late.session);
	assert(late.puzzle.continuedFromLoss && late.puzzle.practiceMode &&
	       !late.puzzle.timerStarted &&
	       late.puzzle.timerElapsed == host.puzzle.timerElapsed &&
	       boardState(late.puzzle) == boardState(host.puzzle),
	       "a late guest did not reconstruct the continued loss and stopped timer");
	host.session.start(0x22222222);
	assert(!host.puzzle.practiceMode && !guest.puzzle.practiceMode &&
	       !late.puzzle.practiceMode && host.puzzle.continueAfterLoss,
	       "a new shared game did not restore the host's rules");
	host.session.leave();
	assert(host.puzzle.continueAfterLoss,
	       "leaving changed the host's continuation preference");
	stopAll(host, guest, late);
});

Deno.test("replay preserves restoration of an exhausted clue and the finish time", function() {
	const host = makeSession("host", "host");
	host.puzzle.autoDismissClues = true;
	host.session.start(0x12345678);
	for (const row of host.puzzle.rows)
		for (const slot of row.slots)
			if (!slot.single)
				host.puzzle.requestTileAction(slot, slot.value, "place");
	assert(host.puzzle.gameOver, "the host did not finish the puzzle");
	const finished = host.session.history.at(-1);
	host.puzzle.timerElapsed = 1000;
	const index = host.puzzle.clues.findIndex(clue => clue.display && !clue.active);
	assert(index >= 0, "no clue was automatically dismissed");
	host.puzzle.requestClueAction(host.puzzle.clues[index], true);
	host.session.history.at(-1).committedAt = finished.committedAt + 5000;
	const guest = makeSession("guest", "late");
	guest.puzzle.autoDismissClues = true;
	new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
	assert(guest.puzzle.clues[index].active,
	       "replay dismissed a clue restored after its last tile move");
	assert(guest.puzzle.timerElapsed == 1000,
	       "a clue action after the finish changed the replayed timer");
	stopAll(host, guest);
});

Deno.test("multiplayer menus and hidden tabs stay local for every player", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const late = makeSession("guest", "late");
	const realNow = Date.now;
	let now = 1000000;
	Date.now = () => now;
	try {
		host.session.start(0x12345678);
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(guest.session);
		for (const game of [host, guest]) {
			game.puzzle.options.hidden = true;
			game.puzzle.toggleOptions();
			assert(!host.puzzle.paused && !guest.puzzle.paused &&
			       host.puzzle.timerTimeout !== null && guest.puzzle.timerTimeout !== null,
			       "a local menu paused the shared game");
			now += 60000;
			const move = wrongMove(guest.puzzle);
			guest.puzzle.requestTileAction(move.slot, move.value, "remove");
			assert(host.session.revision == guest.session.revision &&
			       boardState(host.puzzle) == boardState(guest.puzzle),
			       "a menu blocked another player's move");
			game.puzzle.toggleOptions();
			game.puzzle.setPageHidden(true);
			now += 60000;
			assert(!host.puzzle.paused && !guest.puzzle.paused,
			       "a hidden tab paused the shared game");
			guest.puzzle.togglePause();
			assert(host.puzzle.manualPaused && guest.puzzle.manualPaused,
			       "a hidden tab prevented a shared pause");
			now += 30000;
			guest.puzzle.togglePause();
			game.puzzle.setPageHidden(false);
			assert(!host.puzzle.paused && !guest.puzzle.paused &&
			       host.puzzle.timerStarted == guest.puzzle.timerStarted,
			       "returning from a hidden tab changed the shared clock");
		}
		host.puzzle.togglePause();
		const elapsed = host.puzzle.timerElapsed;
		now += 60000;
		network.addGuest(late.session);
		assert(late.puzzle.timerTimeout === null && late.puzzle.timerElapsed == elapsed,
		       "a late guest counted time while the room was paused");
		late.puzzle.togglePause();
		assert(host.puzzle.timerStarted == late.puzzle.timerStarted &&
		       host.puzzle.timerStarted == guest.puzzle.timerStarted,
		       "a late guest could not resume everyone's clock");
	} finally {
		stopAll(host, guest, late);
		Date.now = realNow;
	}
});

Deno.test("multiplayer clock synchronization does not depend on matching system clocks", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const realNow = Date.now;
	let now = 1000000;
	Date.now = () => now;
	try {
		host.session.start(0x12345678);
		now += 12000;
		const sync = host.session.syncMessage();
		now += 3600000;
		guest.session.receive("host", sync);
		assert(now - guest.puzzle.timerStarted == 12000,
		       "a guest's system clock offset changed the elapsed time");
	} finally {
		stopAll(host, guest);
		Date.now = realNow;
	}
});

Deno.test("guests request shared pause states without toggling duplicate requests", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const other = makeSession("guest", "other");
	try {
		host.session.start(0x12345678);
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(guest.session);
		network.addGuest(other.session);
		assert(!guest.puzzle.timer.disabled, "a guest cannot use the pause button");
		guest.puzzle.togglePause();
		for (const game of [host, guest, other])
			assert(game.puzzle.manualPaused && game.puzzle.timerTimeout === null,
			       "a guest pause did not stop everyone's clock");
		other.session.requestPause(true);
		assert(host.puzzle.manualPaused, "a second pause request resumed the host");
		other.puzzle.togglePause();
		for (const game of [host, guest, other])
			assert(!game.puzzle.manualPaused && game.puzzle.timerTimeout !== null,
			       "a guest resume did not restart everyone's clock");
		guest.session.requestPause(false);
		assert(!host.puzzle.manualPaused, "a second resume request paused the host");
		host.session.receive("stranger", {
			type: "pause", seed: host.session.seed, paused: true,
		});
		assert(!host.puzzle.manualPaused, "an unknown peer paused the room");
		host.session.receive("guest", {
			type: "pause", seed: host.session.seed + 1, paused: true,
		});
		assert(!host.puzzle.manualPaused, "a request for an old puzzle paused the room");
	} finally {
		stopAll(host, guest, other);
	}
});

Deno.test("host clock heartbeats correct drift without sending on every tick", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const realNow = Date.now;
	let now = 1000000;
	Date.now = () => now;
	let messages = 0;
	try {
		host.session.start(0x12345678);
		host.session.addPeer("guest", message => {
			if (message.type == "clock") messages++;
			guest.session.receive("host", message);
		});
		host.session.timerTick();
		const initial = messages;
		guest.puzzle.timerStarted -= 5000;
		for (let i = 0; i < 9; i++) {
			now += 1000;
			host.session.timerTick();
		}
		assert(messages == initial, "a heartbeat was sent before ten seconds");
		now += 1000;
		host.session.timerTick();
		assert(messages == initial + 1 &&
		       host.puzzle.timerStarted == guest.puzzle.timerStarted,
		       "the heartbeat did not correct the guest's clock");
		host.session.removePeer("guest");
		now += 10000;
		host.session.timerTick();
		assert(messages == initial + 1, "a heartbeat was sent with no guests");
	} finally {
		stopAll(host, guest);
		Date.now = realNow;
	}
});

Deno.test("every player sees roster changes without replaying the puzzle", function() {
	const host = makeSession("host", "host");
	const alice = makeSession("guest", "alice");
	const bob = makeSession("guest", "bob");
	try {
		host.session.setPlayerName("Helen");
		alice.session.setPlayerName("Alice");
		bob.session.setPlayerName("Bob");
		host.session.start(0x12345678);
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(alice.session);
		const move = wrongMove(alice.puzzle);
		alice.puzzle.requestTileAction(move.slot, move.value, "remove");
		const identity = alice.puzzle.gameIdentity;
		network.addGuest(bob.session);
		for (const game of [host, alice, bob]) {
			assert(game.session.players.map(player => player.name).join() == "Helen,Alice,Bob",
			       "the roster did not include all player names");
			assert(game.session.players[0].role == "host",
			       "the roster did not identify the host");
		}
		assert(alice.puzzle.gameIdentity == identity && alice.session.revision == 1,
		       "a roster update replayed an existing guest's puzzle");
		host.session.setPeerState("bob", "interrupted");
		assert(alice.session.players[2].state == "interrupted",
		       "an interrupted connection was not shared");
		host.session.setPeerState("bob", "connected");
		assert(alice.session.players[2].state == "connected",
		       "a recovered connection was not shared");
		host.session.removePeer("bob");
		assert(alice.session.players.length == 2 && host.session.players.length == 2,
		       "a departed player remained in the shared roster");
		host.session.start(0x87654321);
		assert(alice.session.players.map(player => player.name).join() == "Helen,Alice",
		       "starting a new game lost the roster");
		let cleared = false;
		alice.session.onPlayersChanged = players => { cleared = players.length == 0; };
		alice.session.leave();
		assert(cleared && alice.session.players.length == 0,
		       "leaving did not clear the roster");
	} finally {
		stopAll(host, alice, bob);
	}
});

Deno.test("multiplayer connects in a lobby and any player can start a game", function() {
	const oldPuzzle = makePuzzle(6, true, Logos.defaultSymbols);
	oldPuzzle.newGame(0x12345678);
	const host = { puzzle: oldPuzzle, session: new MultiplayerSession(oldPuzzle, {
		role: "host", playerId: "host",
	}) };
	const guest = makeSession("guest", "guest");
	try {
		assert(host.session.ready && !guest.session.ready && !guest.session.requestNewGame(),
		       "an unconnected guest could request a game");
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		for (const game of [host, guest]) {
			assert(game.session.ready && game.session.seed === null &&
			       game.puzzle.seed === undefined && game.puzzle.gameOver &&
			       game.puzzle.timerTimeout === null && game.puzzle.timer.hidden &&
			       game.puzzle.clues.length == 0 && game.session.players.length == 2,
			       "connecting started a game or retained an old puzzle");
			assert(game.puzzle.hClueSlots.every(slot => !slot.onclick),
			       "the lobby retained clickable clues from the old game");
		}
		host.puzzle.randomPuzzleSeed = () => 0x87654321;
		guest.puzzle.randomPuzzleSeed = () => { throw Error("the guest chose the seed"); };
		guest.session.requestNewGame();
		for (const game of [host, guest])
			assert(game.session.gameId == 1 && game.session.seed == 0x87654321 &&
			       !game.puzzle.gameOver && game.puzzle.timerTimeout !== null,
			       "a guest could not start the shared game from the lobby");
		assert(boardState(host.puzzle) == boardState(guest.puzzle), "new boards differ");
		host.session.requestNewGame();
		assert(host.session.gameId == 2 && guest.session.gameId == 2,
		       "the host could not replace a shared game");
		guest.session.requestNewGame();
		assert(host.session.gameId == 3 && guest.session.gameId == 3,
		       "the guest could not replace a shared game");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("simultaneous new-game requests start only one puzzle", function() {
	const host = makeSession("host", "host");
	const alice = makeSession("guest", "alice");
	const bob = makeSession("guest", "bob");
	try {
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(alice.session);
		network.addGuest(bob.session);
		const queue = [];
		alice.session.connectHost(message => queue.push(["alice", message]));
		bob.session.connectHost(message => queue.push(["bob", message]));
		host.puzzle.randomPuzzleSeed = () => 0x12345678;
		alice.session.requestNewGame();
		bob.session.requestNewGame();
		for (const [from, message] of queue) host.session.receive(from, message);
		assert([host, alice, bob].every(game => game.session.gameId == 1),
		       "concurrent requests replaced the newly started game");
		host.session.receive("stranger", { type: "new-game", gameId: 1 });
		assert(host.session.gameId == 1, "an unknown player started a game");
	} finally {
		stopAll(host, alice, bob);
	}
});

Deno.test("moves from a previous game cannot affect a replacement with the same seed", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	try {
		host.session.start(0x12345678);
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		let queued;
		guest.session.connectHost(message => queued = message);
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		host.session.start(0x12345678);
		host.session.receive("guest", queued);
		assert(host.session.revision == 0 && guest.session.revision == 0 &&
		       guest.session.lastRejection &&
		       boardState(host.puzzle) == boardState(guest.puzzle),
		       "an old move was accepted into the replacement game");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("empty host difficulty choices do not clear only one player's game", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	try {
		host.session.start(0x12345678);
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		host.puzzle.randomDifficulties = [];
		guest.session.requestNewGame();
		assert(host.session.gameId == 1 && guest.session.gameId == 1 &&
		       !host.puzzle.gameOver && !guest.puzzle.gameOver &&
		       boardState(host.puzzle) == boardState(guest.puzzle),
		       "a rejected new-game request cleared the host's puzzle");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("recent player actions retain attribution across sync and reset with the game", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		let move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		const commit = host.session.history[0];
		assert(host.session.recentActions.get("alice")[0].type == "remove" &&
		       !host.session.recentActions.get("alice")[0].mistake,
		       "guest discard was not attributed correctly");
		host.session.receiveCommand("alice", {
			...commit, expectedRevision: 0,
		});
		assert(guest.session.recentActions.get("alice").length == 1,
		       "duplicate commit added another activity");
		guest.puzzle.togglePause();
		guest.session.requestPause(true);
		host.puzzle.togglePause();
		host.session.timerChanged();
		assert(host.session.recentActions.get("alice").map(a => a.type).join() == "remove,pause",
		       "guest pause was misattributed or duplicated");
		assert(host.session.recentActions.get("host").map(a => a.type).join() == "resume",
		       "host resume or clock heartbeat was recorded incorrectly");
		network.addGuest(late.session);
		const snapshot = session => JSON.stringify([...session.recentActions]);
		assert(snapshot(host.session) == snapshot(guest.session) &&
		       snapshot(host.session) == snapshot(late.session),
		       "live and late guests have different histories");
		guest.session.requestSync();
		assert(snapshot(host.session) == snapshot(guest.session), "sync duplicated history");
		for (let i = 0; i < 14; i++)
			host.puzzle.togglePause();
		assert(host.session.recentActions.get("host").length == 12 &&
		       snapshot(host.session) == snapshot(guest.session), "history was not bounded");
		guest.session.requestSync();
		assert(snapshot(host.session) == snapshot(guest.session),
		       "sync did not retain all twelve actions");
		move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "place");
		assert(host.session.recentActions.get("alice").at(-1).mistake &&
		       snapshot(host.session) == snapshot(guest.session), "mistake was not marked");
		host.session.start(0x12345678);
		assert([host, guest, late].every(game => game.session.recentActions.size == 0),
		       "new game retained old activity");
	} finally {
		stopAll(host, guest, late);
	}
});
