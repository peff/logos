import { Logos, makePuzzle, exhaustPuzzleDeductions } from "./logos-test.js";
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

function makeSession(role, playerId, symbols = Logos.defaultSymbols) {
	const puzzle = makePuzzle(6, true, symbols);
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

async function waitForConflictRewind(puzzle) {
	for (let i = 0; puzzle.supposeRewindTimer !== null && i < 60; i++)
		await new Promise(resolve => setTimeout(resolve, 50));
	assert(puzzle.supposeRewindTimer === null, "conflict rewind did not finish");
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

Deno.test("multiplayer resync preserves seasonal symbols until the next game", function() {
	let date = new Date(2026, 9, 26);
	const symbols = () => Logos.symbolsForDate(date);
	const host = makeSession("host", "host", symbols);
	const guest = makeSession("guest", "guest", symbols);
	const network = new InMemoryMultiplayerNetwork(host.session);
	const revealed = game => game.puzzle.symbols[3]
		.filter(symbol => typeof symbol != "string").length;
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		assert(revealed(host) == 1 && revealed(guest) == 1);
		date = new Date(2026, 9, 31);
		guest.session.receiveSync(host.session.syncMessage());
		assert(revealed(guest) == 1, "resync changed an existing game's artwork");
		host.session.start(0x12345678);
		assert(revealed(host) == 6 && revealed(guest) == 6,
		       "restarting the same seed did not refresh both players' symbols");
		date = new Date(2026, 10, 1);
		guest.session.receiveSync(host.session.syncMessage());
		assert(revealed(guest) == 6, "midnight resync removed active artwork");
		host.session.start(42);
		assert(revealed(host) == 0 && revealed(guest) == 0,
		       "new multiplayer game did not restore classic symbols");
	} finally {
		stopAll(host, guest);
	}
});

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
	host.session.rules.continueAfterLoss = false;
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

Deno.test("chalk clue dismissals survive hosting, late joins, resync and shared erasure", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.newGame(0);
	const index = puzzle.clues.findIndex(clue => clue.display);
	puzzle.requestChalkClue(puzzle.clues[index]);
	const host = { puzzle, session: new MultiplayerSession(puzzle, { role: "host", playerId: "host" }) };
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		network.addGuest(guest.session);
		assert(guest.puzzle.clues[index].chalkMark?.actor === "host");
		guest.puzzle.requestChalkClue(guest.puzzle.clues[index]);
		assert(!host.puzzle.clues[index].chalkMark);
		guest.puzzle.requestChalkClue(guest.puzzle.clues[index]);
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [host, guest, late]) {
			assert(game.puzzle.clues[index].active);
			assert(game.puzzle.clues[index].chalkMark?.actor === "alice");
		}
		guest.puzzle.eraseChalkMarks();
		for (const game of [host, guest, late])
			assert(game.puzzle.clues[index].active && !game.puzzle.clues[index].chalkMark);
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("multiplayer chalk shares attribution, replacement, erasure, and resync", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x31415926);
		network.addGuest(guest.session);
		const slot = guest.puzzle.rows[0].slots[0];
		const hostSlot = host.puzzle.rows[0].slots[0];
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
		for (const game of [host, guest]) {
			const mark = game.puzzle.pencilMarks[0];
			assert(mark.actor == "alice" && !mark.discard && mark.color,
			       "shared chalk lost its author");
			assert(mark.slot.possibilityElems[mark.value].style["--chalk-author"] == mark.color,
			       "explicit mark was not colored");
		}
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-remove");
		assert(guest.puzzle.pencilMarks[0].actor == "host" &&
		       guest.puzzle.pencilMarks[0].discard, "opposing mark did not replace ownership");
		guest.session.receiveSync(host.session.syncMessage());
		assert(guest.puzzle.pencilMarks[0].actor == "host" &&
		       guest.puzzle.pencilMarks[0].color == host.puzzle.pencilMarks[0].color,
		       "resync lost attribution");
		guest.puzzle.requestTileAction(guest.puzzle.rows[0].slots[0], slot.value, "pencil-remove");
		assert(!host.puzzle.pencilMarks.length, "guest could not erase another player's mark");
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-select");
		guest.puzzle.eraseChalkMarks();
		assert(!host.puzzle.pencilMarks.length && !guest.puzzle.pencilMarks.length,
		       "eraser did not clear shared chalk");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("concurrent chalk actions preserve intent and host ordering", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x31415926);
		network.addGuest(guest.session);
		const queued = [];
		guest.session.connectHost(message => queued.push(message));
		const slot = guest.puzzle.rows[0].slots[0];
		const hostSlot = host.puzzle.rows[0].slots[0];
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-select");
		host.session.receive("alice", queued.shift());
		assert(host.puzzle.pencilMarks.length == 1 &&
		       host.puzzle.pencilMarks[0].actor == "host" && host.session.revision == 2,
		       "simultaneous circles erased or reassigned the first mark");
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-select");
		host.session.receive("alice", queued.shift());
		assert(!host.puzzle.pencilMarks.length, "simultaneous erasures restored a mark");
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-remove");
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-select");
		host.session.receive("alice", queued.shift());
		assert(host.puzzle.pencilMarks[0].actor == "alice" &&
		       host.puzzle.pencilMarks[0].discard, "later opposing mark did not win");
		guest.puzzle.eraseChalkMarks();
		host.puzzle.requestTileAction(hostSlot, slot.value, "pencil-select");
		host.session.receive("alice", queued.shift());
		assert(!host.puzzle.pencilMarks.length, "clear did not erase preceding marks");
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
		host.session.receive("alice", queued.shift());
		assert(host.puzzle.pencilMarks[0].actor == "alice", "mark after clear was lost");
		guest.session.receiveSync(host.session.syncMessage());
		assert(guest.puzzle.pencilMarks[0].color == host.puzzle.pencilMarks[0].color,
		       "replay changed first-writer attribution");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("late joins retain chalk from players who have left", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x31415926);
		network.addGuest(guest.session);
		const slot = guest.puzzle.rows[0].slots[0];
		guest.puzzle.requestTileAction(slot, slot.value, "pencil-select");
		const color = host.puzzle.pencilMarks[0].color;
		host.session.removePeer("alice");
		network.addGuest(late.session);
		assert(late.puzzle.pencilMarks[0].actor == "alice" &&
		       late.puzzle.pencilMarks[0].color == color,
		       "late join lost a departed author's chalk color");
		late.puzzle.requestTileAction(late.puzzle.rows[0].slots[0], slot.value, "place");
		assert(!host.puzzle.pencilMarks.length && !late.puzzle.pencilMarks.length,
		       "committing a tile left obsolete chalk");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("hosting an existing game shares its chalk", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.newGame(0x31415926);
	const slot = puzzle.rows[0].slots[0];
	puzzle.requestTileAction(slot, slot.value, "pencil-select");
	const host = { puzzle, session: new MultiplayerSession(puzzle, {role: "host", playerId: "host"}) };
	const guest = makeSession("guest", "alice");
	try {
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		assert(guest.puzzle.pencilMarks.length == 1 && guest.puzzle.pencilMarks[0].actor == "host",
		       "joining an existing game lost its chalk");
		assert(guest.puzzle.pencilMarks[0].color == host.puzzle.pencilMarks[0].color,
		       "adopted chalk colors differ");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("the host's multiplayer rules override guest preferences", function() {
	const host = makeSession("host", "host");
	host.session.rules.continueAfterLoss = false;
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
	host.session.rules.continueAfterLoss = false;
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
	assert(hostState.unexpectedDeparture, "failed guest did not request invitation recovery");

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
	alice.puzzle.clues[index].display.onpointerdown({
		button: 2, pointerType: "mouse", preventDefault() {},
	});
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
			       game.puzzle.timerTimeout === null && !game.puzzle.timer.hidden &&
			       game.puzzle.timerText.textContent === "—" &&
			       game.puzzle.clues.length == 0 && game.session.players.length == 2,
			       "connecting started a game or retained an old puzzle");
			assert(game.puzzle.hClueSlots.every(slot => !slot.onclick),
			       "the lobby retained clickable clues from the old game");
		}
		host.puzzle.randomPuzzleSeed = () => 0x87654321;
		guest.puzzle.randomPuzzleSeed = () => 0x87654321;
		guest.session.requestNewGame();
		for (const game of [host, guest])
			assert(game.session.gameId == 1 && game.session.seed == 0x87654321 &&
			       !game.puzzle.gameOver && game.puzzle.timerTimeout !== null,
			       "a guest could not start the shared game from the lobby");
		assert(boardState(host.puzzle) == boardState(guest.puzzle), "new boards differ");
		assert([host, guest].every(game => game.session.recentActions.size == 1 &&
		       game.session.recentActions.get("guest")?.[0].type == "new-game"),
		       "the new game was not attributed to its guest requester");
		host.session.requestNewGame();
		assert(host.session.gameId == 2 && guest.session.gameId == 2,
		       "the host could not replace a shared game");
		assert([host, guest].every(game => game.session.recentActions.size == 1 &&
		       game.session.recentActions.get("host")?.[0].type == "new-game"),
		       "host new game did not replace the previous starter's activity");
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
		assert([host, alice, bob].every(game => game.session.recentActions.size == 1 &&
		       game.session.recentActions.get("alice")?.[0].type == "new-game"),
		       "a coalesced request changed the new game's attribution");
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

Deno.test("empty requester difficulty choices do not clear only one player's game", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	try {
		host.session.start(0x12345678);
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		guest.puzzle.randomDifficulties = [];
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
		assert(host.session.recentActions.get("host").map(a => a.type).join() == "new-game,resume",
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
		assert([host, guest, late].every(game => game.session.recentActions.size == 1 &&
		       JSON.stringify(game.session.recentActions.get("host")) == '[{"type":"new-game"}]'),
		       "new game retained old activity");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("hint requests share zen mode and attribution but keep explanations local", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.hintAcknowledged = false;
		guest.puzzle.hint(1);
		assert(guest.puzzle.pendingHint && host.session.revision == 0,
		       "opening the hint notice recorded a hint");
		guest.puzzle.finishHintNotice(false);
		assert(!host.puzzle.practiceMode && !guest.puzzle.practiceMode,
		       "canceling the notice changed the game mode");
		guest.puzzle.hint(1);
		guest.puzzle.finishHintNotice(true);
		for (const game of [host, guest])
			assert(game.puzzle.practiceMode &&
			       game.puzzle.timerTimeout === null && !game.puzzle.practiceModePreference,
			       "the hint did not stop everyone's clock and enter game-local zen mode");
		assert(guest.puzzle.hintRequest?.stage == 1 && !host.puzzle.hintRequest,
		       "the hint was not confined to the requester");
		guest.puzzle.hint(2);
		assert(host.session.recentActions.get("alice").length == 2 &&
		       guest.session.recentActions.get("alice").every(action => action.type == "hint"),
		       "repeated hint presses did not create separate attributed events");
		guest.session.receiveCommit(host.session.history.at(-1));
		assert(guest.session.recentActions.get("alice").length == 2,
		       "a duplicate hint commit was logged twice");
		host.puzzle.hint(1);
		assert(host.session.recentActions.get("host").at(-1).type == "hint" &&
		       guest.puzzle.hintRequest.stage == 2 && host.puzzle.hintRequest.stage == 1,
		       "host hint changed another player's explanation");
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [guest, late])
			assert(game.puzzle.practiceMode &&
			       game.puzzle.timerTimeout === null && !game.puzzle.hintRequest &&
			       JSON.stringify([...game.session.recentActions]) ==
			       JSON.stringify([...host.session.recentActions]),
			       "sync did not replay zen mode and history without showing hints");
		host.session.start(0x12345678);
		assert([host, guest, late].every(game => !game.puzzle.practiceMode &&
		       game.puzzle.timerTimeout !== null),
		       "a new game retained hint-induced zen mode");
	} finally {
		stopAll(host, guest, late);
	}
});

function captureMultiplayerRuns(game) {
	const runs = [];
	game.puzzle.recordOutcome = async (outcome, run) => {
		assert(outcome == run.outcome, "result outcome differs from saved run");
		runs.push(structuredClone(run));
		return true;
	};
	return runs;
}

function finishSharedPuzzle(game) {
	for (const row of game.puzzle.rows)
		for (const slot of row.slots)
			if (!slot.single)
				game.puzzle.requestTileAction(slot, slot.value, "place");
}

Deno.test("shared results use the host's time and names, without replay duplicates", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const hostRuns = captureMultiplayerRuns(host);
	const guestRuns = captureMultiplayerRuns(guest);
	const lateRuns = captureMultiplayerRuns(late);
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.setPlayerName("Plato");
		guest.session.playerName = "Socrates";
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		host.session.addPeer("departed", () => {}, "Hypatia");
		host.session.removePeer("departed");
		host.puzzle.timerStarted = Date.now() - 45000;
		guest.puzzle.timerStarted = Date.now() - 900000;
		finishSharedPuzzle(host);
		assert(hostRuns.length == 1 && guestRuns.length == 1 &&
		       JSON.stringify(hostRuns) == JSON.stringify(guestRuns), "peers saved different results");
		const run = hostRuns[0];
		assert(run.multiplayer && run.outcome == "won" && run.elapsed >= 45000 &&
		       run.elapsed < 60000 && run.players.join() == "Plato,Socrates,Hypatia" && run.difficulty,
		       "result lost host timing, participant names, or normal run fields");
		guest.session.receiveCommit(host.session.history.at(-1));
		guest.session.requestSync();
		network.addGuest(late.session);
		assert(guestRuns.length == 1 && lateRuns.length == 0,
		       "replay duplicated a result or gave a completed run to a late arrival");
		host.session.start(0x12345678);
		finishSharedPuzzle(host);
		assert(hostRuns.length == 2 && guestRuns.length == 2 && lateRuns.length == 1 &&
		       hostRuns[0].multiplayerId != hostRuns[1].multiplayerId,
		       "reusing a seed did not create a separate shared run");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("resync recovers a missed result for an existing participant", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	captureMultiplayerRuns(host);
	const runs = captureMultiplayerRuns(guest);
	try {
		host.session.start(0x12345678);
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		const sender = host.session.peers.get("alice");
		host.session.peers.set("alice", message => { if (!message.result) sender(message); });
		finishSharedPuzzle(host);
		assert(!runs.length, "the result was not dropped by the test");
		host.session.peers.set("alice", sender);
		guest.session.requestSync();
		guest.session.requestSync();
		assert(runs.length == 1 && runs[0].elapsed == host.session.result.elapsed,
		       "resync did not recover exactly one authoritative result");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer losses and zen eligibility follow solo recording rules", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const hostRuns = captureMultiplayerRuns(host);
	const guestRuns = captureMultiplayerRuns(guest);
	try {
		host.session.rules.continueAfterLoss = true;
		host.session.start(0x12345678);
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		const mistake = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(mistake.slot, mistake.value, "place");
		assert(hostRuns.length == 1 && guestRuns.length == 1 && hostRuns[0].outcome == "lost",
		       "continued loss did not save a shared loss");
		finishSharedPuzzle(host);
		assert(hostRuns.length == 1 && guestRuns.length == 1, "continued completion saved another run");
		host.session.start(0x12345678);
		guest.puzzle.hintAcknowledged = true;
		guest.puzzle.hint(1);
		finishSharedPuzzle(host);
		assert(hostRuns.length == 1 && guestRuns.length == 1, "hint-assisted game was recorded");
		host.session.rules.practiceMode = true;
		host.session.start(0x12345678);
		finishSharedPuzzle(host);
		assert(hostRuns.length == 1 && guestRuns.length == 1, "initial zen game was recorded");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("seed controls start and restart shared games through the host", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	try {
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		for (const game of [host, guest]) {
			game.puzzle.toggleOptions = () => { game.puzzle.options.hidden = true; };
			game.puzzle.randomDifficulties = [];
		}
		const input = guest.puzzle.options.querySelector("#game-seed");
		input.value = "10699";
		guest.puzzle.playSeed();
		assert(host.session.seed === 0x10699 && guest.session.seed === 0x10699 &&
		       boardState(host.puzzle) === boardState(guest.puzzle), "guest seed did not synchronize");
		assert(host.session.recentActions.get("guest")[0].type === "new-game");
		const firstRun = host.session.runId;
		guest.puzzle.playSeed();
		assert(host.session.runId !== firstRun && host.session.seed === 0x10699,
		       "restarting the same seed did not create a new shared run");
		host.puzzle.options.querySelector("#game-seed").value = "0";
		host.puzzle.playSeed();
		assert(host.session.seed === 0 && guest.session.seed === 0, "host seed zero was lost");
		const gameId = host.session.gameId;
		input.value = "not-a-seed";
		guest.puzzle.playSeed();
		assert(input.validationMessage && host.session.gameId === gameId,
		       "invalid seed was accepted");
		for (const seed of [-1, 0x100000000, 1.5, null, "10699"])
			host.session.receive("guest", {type: "new-game", gameId, seed});
		host.session.receive("guest", {type: "new-game", gameId: gameId - 1, seed: 1});
		assert(host.session.gameId === gameId, "invalid or stale request changed the game");
		guest.puzzle.randomDifficulties = ["easy"];
		guest.puzzle.randomPuzzleSeed = () => {
			assert(guest.puzzle.randomDifficulties.join() === "easy");
			return 0x12345678;
		};
		host.puzzle.randomPuzzleSeed = () => { throw Error("host chose a guest seed"); };
		input.value = "";
		guest.puzzle.playSeed();
		assert(host.session.seed === 0x12345678 && guest.session.seed === 0x12345678,
		       "empty seed did not request a requester-selected random game");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("hosting adopts the solo position and clock without old action history", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.newGame(0x12345678);
	const remove = wrongMove(puzzle);
	puzzle.requestTileAction(remove.slot, remove.value, "remove");
	const placed = puzzle.rows[1].slots.find(slot => !slot.single);
	puzzle.requestTileAction(placed, placed.value, "place");
	const clue = puzzle.clues.find(clue => clue.display);
	puzzle.applyClueAction(clue, false);
	puzzle.timerStarted = Date.now() - 45000;
	puzzle.stopTimer();
	puzzle.paused = true;
	puzzle.resumeAfterModal = true;
	const before = boardState(puzzle);
	const host = {puzzle, session: new MultiplayerSession(puzzle, {role: "host", playerId: "host"})};
	const guest = makeSession("guest", "guest");
	const hostRuns = captureMultiplayerRuns(host);
	const guestRuns = captureMultiplayerRuns(guest);
	try {
		assert(boardState(puzzle) === before && puzzle.timerTimeout === null && puzzle.paused &&
		       host.session.clockState().elapsed >= 45000 && !puzzle.scoreEligible,
		       "hosting reset the position, clock, or eligibility");
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		assert(boardState(guest.puzzle) === before && guest.session.clockState().elapsed >= 45000 &&
		       guest.session.clockState().elapsed < 60000, "guest missed initial position or elapsed time");
		assert(!guest.puzzle.clues[puzzle.clues.indexOf(clue)].active,
		       "dismissed clue was restored for the guest");
		assert(!host.session.history.length && !guest.session.history.length &&
		       !host.session.recentActions.size && !guest.session.recentActions.size,
		       "solo moves appeared in shared history");
		assert(guest.puzzle.paused && guest.puzzle.timerTimeout === null,
		       "guest started playing while the host was setting up invitations");
		puzzle.options.hidden = false;
		puzzle.toggleOptions();
		assert(!puzzle.paused && !guest.puzzle.paused && puzzle.timerTimeout !== null &&
		       guest.puzzle.timerTimeout !== null && host.session.clockState().elapsed >= 45000,
		       "closing hosting setup did not resume the shared clock");
		const next = wrongMove(guest.puzzle, 2);
		guest.puzzle.requestTileAction(next.slot, next.value, "remove");
		guest.session.requestSync();
		assert(boardState(puzzle) === boardState(guest.puzzle) && host.session.revision === 1,
		       "resync lost the initial position or subsequent shared move");
		finishSharedPuzzle(host);
		assert(hostRuns.length === 1 && guestRuns.length === 1 && hostRuns[0].multiplayer &&
		       hostRuns[0].elapsed >= 45000, "adopted game did not save a multiplayer result");
		host.session.start(0x12345678);
		assert(host.session.initialPosition === null && guest.session.initialPosition === null,
		       "new game retained the adopted position");
		assert(boardState(puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("hosting preserves an explicit pause or an existing zen game", function() {
	for (const zen of [false, true]) {
		const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
		puzzle.newGame(0x12345678);
		puzzle.stopTimer();
		puzzle.timerElapsed = 12000;
		puzzle.practiceMode = zen;
		puzzle.manualPaused = puzzle.paused = !zen;
		const host = {puzzle, session: new MultiplayerSession(puzzle, {role: "host", playerId: "host"})};
		const guest = makeSession("guest", "guest");
		try {
			new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
			for (const game of [host, guest])
				assert(game.puzzle.practiceMode === zen && game.puzzle.manualPaused === !zen &&
				       game.puzzle.timerTimeout === null && game.puzzle.timerElapsed === 12000,
				       "adoption lost pause or zen state");
			if (zen) {
				const runs = captureMultiplayerRuns(host);
				finishSharedPuzzle(host);
				assert(!runs.length, "adopting a zen game made it scoreable");
			}
		} finally {
			stopAll(host, guest);
		}
	}
});

Deno.test("finished and unstarted solo puzzles still open a multiplayer lobby", function() {
	for (const pending of [false, true]) {
		const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
		puzzle.newGame(0x12345678, pending);
		if (!pending) {
			puzzle.gameOver = true;
			puzzle.stopTimer();
		}
		const session = new MultiplayerSession(puzzle, {role: "host", playerId: "host"});
		try {
			assert(session.seed === null && session.initialPosition === null &&
			       puzzle.seed === undefined && puzzle.timerTimeout === null,
			       "hosting adopted a completed or unstarted puzzle");
		} finally {
			stopAll({puzzle, session});
		}
	}
});

Deno.test("players can rename themselves before and after connecting", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const observer = makeSession("guest", "bob");
	try {
		host.session.start(0x12345678);
		guest.session.setPlayerName("Sappho");
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(guest.session);
		network.addGuest(observer.session);
		assert(host.session.players[1].name == "Sappho", "pending rename lost");
		guest.session.setPlayerName("  Hypatia  ");
		host.session.setPlayerName("Plato");
		for (const game of [host, guest, observer]) {
			assert(game.session.players[0].name == "Plato", "host rename not shared");
			assert(game.session.players[1].name == "Hypatia", "guest rename not shared");
		}
		assert(host.session.gamePlayers.get("alice") == "Hypatia", "run participant name stale");
		host.session.receive("stranger", { type: "name", name: "Intruder" });
		host.session.receive("alice", { type: "name", name: null });
		host.session.receive("alice", { type: "name", playerId: "host", name: "Sappho" });
		assert(host.session.players[0].name == "Plato", "guest renamed another player");
		assert(host.session.players[1].name == "Sappho", "sender rename lost");
	} finally {
		stopAll(host, guest, observer);
	}
});

Deno.test("hover targets are attributed, transient, and separate from moves", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const observer = makeSession("guest", "bob");
	try {
		host.session.start(0x12345678);
		const network = new InMemoryMultiplayerNetwork(host.session);
		network.addGuest(guest.session);
		network.addGuest(observer.session);
		const target = { row: 0, column: 1, value: 2 };
		guest.session.requestHover(target);
		for (const game of [host, guest, observer]) {
			assert(JSON.stringify(game.session.hovers.get("alice")) == JSON.stringify(target));
			assert(new Set(game.session.players.map(player => player.color)).size == 3,
				"players share a color");
			assert(game.session.history.length == 0 && game.session.revision == 0,
				"hover became a move");
		}
		const message = { type: "hover", gameId: host.session.gameId, playerId: "host", target };
		host.session.receive("alice", message);
		assert(!host.session.hovers.has("host"), "guest spoofed another player");
		host.session.receive("stranger", message);
		assert(!host.session.hovers.has("stranger"), "unknown player can hover");
		host.session.receive("alice", { ...message, target: { ...target, value: 99 } });
		assert(host.session.hovers.get("alice").value == 2, "invalid target accepted");
		const clue = host.puzzle.clues.findIndex(clue => clue.displayType);
		guest.session.requestHover({ clue });
		assert([host, guest, observer].every(game => game.session.hovers.get("alice").clue == clue),
			"clue hover not relayed");
		guest.session.requestHover({ clue: host.puzzle.clues.length });
		assert(host.session.hovers.get("alice").clue == clue, "invalid clue accepted");
		guest.session.requestHover(null);
		assert([host, guest, observer].every(game => !game.session.hovers.size), "clear not shared");
		host.session.requestHover({ row: 1, column: 1, value: null });
		assert(observer.session.hovers.has("host"), "host hover not relayed");
		guest.session.requestHover(target);
		host.session.setPeerState("alice", "interrupted");
		assert([host, guest, observer].every(game => !game.session.hovers.has("alice")),
			"interrupted player kept a highlight");
		host.session.start(10699);
		assert([host, guest, observer].every(game => !game.session.hovers.size), "new game retained hover");
		host.session.receive("host", message);
		assert(!host.session.hovers.size, "old game hover accepted");
	} finally {
		stopAll(host, guest, observer);
	}
});

Deno.test("intentional WebRTC departures do not request invitation recovery", async function() {
	for (const leavingHost of [false, true]) {
		const factory = fakeWebRTCFactory();
		const host = makeSession("host", "host");
		const guest = makeSession("guest", "guest");
		const events = [];
		const hostTransport = new WebRTCHostTransport(host.session, {
			peerConnectionFactory: factory, onChange: state => events.push(state),
		});
		const guestTransport = new WebRTCGuestTransport(guest.session, { peerConnectionFactory: factory });
		try {
			host.session.start(10699);
			await hostTransport.acceptAnswer(await guestTransport.acceptInvitation(
				await hostTransport.createInvitation()));
			if (leavingHost) hostTransport.close();
			else guestTransport.close();
			assert(!host.session.peers.size, "departed guest remains connected");
			assert(!events.some(event => event.unexpectedDeparture), "intentional leave triggered renewal");
		} finally {
			guestTransport.close();
			hostTransport.close();
			stopAll(host, guest);
		}
	}
});

Deno.test("hosting an extreme solo puzzle shares its seed and mode", function() {
	const puzzle = makePuzzle(6, true);
	puzzle.newGame(0, false, false, true);
	const host = { puzzle, session: new MultiplayerSession(puzzle, { role: "host", playerId: "host" }) };
	const guest = makeSession("guest", "alice");
	try {
		new InMemoryMultiplayerNetwork(host.session).addGuest(guest.session);
		assert(guest.puzzle.extreme === true);
		const message = host.session.syncMessage();
		assert(message.seed === 0 && message.extreme === true);
		assert(!("extremeIndices" in message));
		const identity = guest.puzzle.gameIdentity;
		guest.session.receiveSync({ ...message, seed: 2 });
		assert(guest.puzzle.gameIdentity === identity && guest.session.ready);
		assert(!Logos.cluesSolve(guest.puzzle, guest.puzzle.clues));
		assert(Logos.countSolutions(guest.puzzle, guest.puzzle.clues) === 1);
		assert(boardState(puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("guests can start extreme games, replay moves and return to ordinary games", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		network.addGuest(guest.session);
		guest.puzzle.options.hidden = true;
		guest.puzzle.toggleOptions();
		guest.puzzle.playExtreme();
		assert(host.puzzle.extreme && guest.puzzle.extreme);
		const slot = guest.puzzle.rows[0].slots[0];
		guest.puzzle.requestTileAction(slot, slot.value, "place");
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [guest, late]) {
			assert(game.puzzle.extreme === true);
			assert(boardState(game.puzzle) === boardState(host.puzzle));
			assert(!Logos.cluesSolve(game.puzzle, game.puzzle.clues));
			assert(Logos.countSolutions(game.puzzle, game.puzzle.clues) === 1);
			assert(await game.puzzle.recordOutcome("won") === false);
		}
		const identity = host.puzzle.gameIdentity;
		guest.session.requestNewGame(0, [999]);
		assert(host.puzzle.gameIdentity === identity);
		guest.session.requestNewGame(2, true);
		assert(host.puzzle.gameIdentity === identity, "seed without an extreme puzzle was accepted");
		assert(host.session.requestNewGame(0));
		for (const game of [host, guest, late]) {
			assert(!game.puzzle.extreme);
			assert(Logos.cluesSolve(game.puzzle, game.puzzle.clues));
		}
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("extreme clue assistance is shared and survives adoption, late joins and resync", function() {
	const puzzle = makePuzzle(6, true, Logos.defaultSymbols);
	puzzle.newGame(0, false, false, true);
	exhaustPuzzleDeductions(puzzle);
	const host = { puzzle, session: new MultiplayerSession(puzzle, { role: "host", playerId: "host" }) };
	const guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		network.addGuest(guest.session);
		guest.puzzle.hintAcknowledged = true;
		const count = host.puzzle.clues.length;
		guest.puzzle.explainLoss();
		assert(guest.puzzle.hintRequest.stalled && host.puzzle.clues.length === count);
		guest.puzzle.explainLoss();
		assert(guest.puzzle.hintRequest.stage === 2 && !host.puzzle.hintRequest);
		assert(host.session.history.at(-1).action.type === "hint" && host.puzzle.clues.length === count);
		guest.puzzle.explainLoss();
		assert(host.session.history.at(-1).action.type === "hint");
		assert(guest.puzzle.proof && !host.puzzle.proof);
		assert(guest.puzzle.proof.steps.at(-1).placements.every(bits => bits === 63));
		assert(host.puzzle.clues.length === count && !guest.puzzle.revealedClues.length);
		guest.puzzle.explainLoss();
		guest.puzzle.explainLoss();
		guest.puzzle.requestExtremeClue();
		assert(!guest.puzzle.proof);
		network.addGuest(late.session);
		guest.session.requestSync();
		for (const game of [host, guest, late]) {
			assert(game.puzzle.clues.length === count + 1 && game.puzzle.revealedClues.length === 1);
			assert(JSON.stringify(game.puzzle.positionSnapshot()) === JSON.stringify(host.puzzle.positionSnapshot()));
			assert(game.puzzle.practiceMode);
		}
		const revision = host.session.revision;
		guest.session.requestAction({ type: "reveal-clue", clue: guest.puzzle.revealedClues[0] });
		assert(host.session.revision === revision, "duplicate reveal was accepted");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("shared Extreme results retain mode, host time, and JSON-safe skull ratings", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "guest");
	const hostRuns = captureMultiplayerRuns(host), guestRuns = captureMultiplayerRuns(guest);
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x4c3f2a56, "host", true);
		network.addGuest(guest.session);
		host.puzzle.timerStarted = Date.now() - 45000;
		finishSharedPuzzle(host);
		assert(hostRuns.length === 1 && guestRuns.length === 1 &&
		       JSON.stringify(hostRuns) === JSON.stringify(guestRuns));
		const run = hostRuns[0];
		assert(run.extreme === true && run.multiplayer && run.elapsed >= 45000 &&
		       run.extremeDifficulty.version === 1 && run.extremeDifficulty.stalled &&
		       run.extremeDifficulty.level === null && !run.difficulty);
		guest.session.requestSync();
		assert(guestRuns.length === 1);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer suppositions stay private and incorporate shared moves when rewound", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const before = boardState(p);
		p.enterSuppose();
		const move = wrongMove(p);
		p.requestTileAction(move.slot, move.value, "place");
		assert(p.suppose && !host.puzzle.suppose);
		assert(boardState(p) == before && host.session.revision == 0);
		const root = p.suppose;
		p.enterSuppose();
		const row = p.rows.indexOf(move.slot.row);
		const column = move.slot.row.slots.indexOf(move.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], move.value, "remove");
		assert(p.suppose.parent == root, "shared update closed a private branch");
		assert(!(root.domains[row][move.value] & (1 << column)));
		assert(move.slot.row.elem.classList.contains("pencil-conflict"), "conflict was not highlighted");
		p.leaveSuppose();
		p.moveSuppose(-1);
		assert(!(root.domains[row][move.value] & (1 << column)), "rewind resurrected a shared discard");
		assert(!move.slot.row.elem.classList.contains("pencil-conflict"));
		p.leaveSuppose();
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer applies private moves through the host and skips redundant moves", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "remove");
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.enterSuppose();
		host.session.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		assert(p.suppose && !a.slot.possible[a.value]);
		await p.acceptSuppose();
		assert(!p.suppose && !b.slot.possible[b.value]);
		assert(host.puzzle.suppose, "accepting a guest branch closed the host branch");
		assert(boardState(p) == boardState(host.puzzle));
		assert(host.session.history.at(-1).action.type == "remove");
		guest.session.receiveSync(host.session.syncMessage());
		assert(boardState(p) == boardState(host.puzzle), "batch did not survive resync");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("multiplayer branch application stops at a mistake in Zen mode", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.rules.practiceMode = true;
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "remove");
		await p.acceptSuppose();
		assert(p.losses == 1 && host.puzzle.losses == 1);
		assert(b.slot.possible[b.value], "moves continued after a mistake");
		assert(host.session.history.length == 1 && host.session.history[0].action.type == "place");
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("rejecting a multiplayer supposition shares only the inverse assumption", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = host.puzzle;
		p.enterSuppose();
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "remove");
		p.rejectSuppose();
		assert(!p.suppose && !a.slot.possible[a.value] && b.slot.possible[b.value]);
		assert(host.session.revision == 1 && boardState(p) == boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("branch batches tolerate intervening moves but validate the entire request", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const a = wrongMove(p, 0), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "remove");
		let pending;
		guest.session.connectHost(message => { pending = message; });
		await p.acceptSuppose();
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		assert(pending.expectedRevision == 0 && host.session.revision == 1);
		host.session.receive("guest", pending);
		assert(host.session.revision == 2 && !b.slot.possible[b.value]);
		assert(boardState(p) == boardState(host.puzzle));
		const before = boardState(p);
		for (const moves of [[null], [{ type: "place", row: 99, column: 0, value: 0 }],
			[{ type: "suppose-apply", moves: [], clues: [] }]]) {
			host.session.receive("guest", { type: "command", gameId: host.session.gameId,
				commandId: "bad-" + JSON.stringify(moves), expectedRevision: 2,
				action: { type: "suppose-apply", moves, clues: [] } });
			assert(host.session.revision == 2 && boardState(host.puzzle) == before);
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("branch application retains and locks the exploration until its own acknowledgment", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const branch = p.suppose;
		const commands = [];
		guest.session.connectHost(message => commands.push(message));
		await p.acceptSuppose();
		assert(p.suppose === branch && branch.pending);
		await p.acceptSuppose();
		p.requestTileAction(b.slot, b.value, "remove");
		p.moveSuppose(-1);
		p.rejectSuppose();
		p.leaveSuppose();
		assert(commands.length == 1 && branch.position == 1 && branch.history.length == 2);
		assert(p.supposeControls.querySelector(".suppose-accept").disabled);
		const move = wrongMove(host.puzzle, 2);
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(p.suppose === branch && branch.pending, "another player's commit cleared the branch");
		host.session.receive("guest", commands[0]);
		assert(!p.suppose && !guest.session.pendingSuppose && !a.slot.possible[a.value]);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("a host proof rejects normal moves and retains a rejected branch for retry", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		let a = wrongMove(p);
		/* The applicability gate only needs the presence of a proof. */
		host.puzzle.proof = {};
		p.requestTileAction(a.slot, a.value, "remove");
		assert(host.session.revision == 0 && guest.session.lastRejection);
		a = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const branch = p.suppose;
		await p.acceptSuppose();
		assert(p.suppose === branch && !branch.pending && !guest.session.pendingSuppose);
		assert(branch.history.length == 2 && branch.position == 1);
		assert(!p.supposeControls.querySelector(".suppose-accept").disabled);
		host.puzzle.proof = null;
		await p.acceptSuppose();
		assert(!p.suppose && host.session.revision == 1);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		host.puzzle.proof = null;
		stopAll(host, guest);
	}
});

Deno.test("resync preserves nested explorations and recovers a missed branch acknowledgment", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		const root = p.suppose;
		p.enterSuppose();
		const nested = p.suppose;
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.suppose === nested && nested.parent === root);
		p.leaveSuppose();
		host.session.peers.set("guest", () => {});
		await p.acceptSuppose();
		assert(p.suppose === root && root.pending && host.session.revision == 1);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!p.suppose && !guest.session.pendingSuppose);
		assert(boardState(p) == boardState(host.puzzle));
		p.enterSuppose();
		host.session.start(0x12345678);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!p.suppose, "replacement game retained an obsolete branch");
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("private suppositions clear outgoing hover but still receive other players' highlights", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const target = { row: 0, column: 1, value: 2 };
		for (const [explorer, other] of [[host, guest], [guest, host]]) {
			explorer.session.requestHover(target);
			assert(other.session.hovers.has(explorer.session.playerId));
			explorer.puzzle.enterSuppose();
			assert(!other.session.hovers.has(explorer.session.playerId), "entering kept a shared highlight");
			explorer.session.requestHover(target);
			explorer.session.requestHover({ clue: explorer.puzzle.clues.findIndex(clue => clue.displayType) });
			assert(!other.session.hovers.has(explorer.session.playerId), "private hover escaped");
			other.session.requestHover(target);
			assert(explorer.session.hovers.has(other.session.playerId), "incoming highlight was suppressed");
			explorer.puzzle.leaveSuppose();
			explorer.session.requestHover(target);
			assert(other.session.hovers.has(explorer.session.playerId), "hover did not resume");
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared conflicts offer a rewind that preserves earlier deductions and discards the suffix", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "remove");
		p.requestTileAction(b.slot, b.value, "place");
		p.requestTileAction(c.slot, c.value, "remove");
		const state = p.suppose;
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
		const row = p.rows.indexOf(b.slot.row), column = b.slot.row.slots.indexOf(b.slot);
		p.sounds.length = 0;
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], b.value, "remove");
		assert(state.sharedConflicts[row]);
		const description = p.supposeControls.querySelector(".suppose-assumption");
		const title = p.supposeControls.querySelector(".proof-position");
		assert(description.textContent.startsWith("Discard "), "later deduction lost its description");
		assert(title.textContent.endsWith(" · Conflict"));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 1);
		p.moveSuppose(-1);
		assert(description.textContent.startsWith("Another player discarded "));
		p.moveSuppose(1);
		p.reconcileSuppose();
		assert(description.textContent.startsWith("Discard "));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 1,
			"history navigation or repeated reconciliation replayed the alert");
		assert(state.sharedConflictMessages[row + ":" + b.value + ":" + column].startsWith("Another player discarded "));
		assert(state.sharedConflictMessages[row + ":" + b.value + ":" + column].endsWith("from column " + (column + 1) + "; you had placed it there."));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict-discarded"));
		assert(!p.supposeControls.querySelector(".suppose-rewind").hidden);
		assert(p.supposeRewindTarget().position == 1);
		assert(p.supposeControls.querySelector(".suppose-accept").hidden);
		assert(p.supposeControls.querySelector(".suppose-reject").hidden);
		assert(p.supposeButton.disabled);
		const before = JSON.stringify(state);
		const next = wrongMove(p, 3);
		p.requestTileAction(next.slot, next.value, "remove");
		const clue = p.clues.find(clue => clue.active && clue.display);
		p.requestClueAction(clue, false);
		p.enterSuppose();
		await p.acceptSuppose();
		p.rejectSuppose();
		assert(p.suppose === state && JSON.stringify(state) == before,
			"conflicted exploration accepted an edit, nested branch, apply, or reject");
		assert(host.session.revision == 1, "conflicted exploration sent a shared move");
		state.pending = true;
		p.rewindSupposeConflict();
		assert(state.position == 3 && state.history.length == 4);
		state.pending = false;
		p.paused = true;
		p.rewindSupposeConflict();
		assert(state.position == 3 && state.history.length == 4);
		p.paused = false;
		p.moveSuppose(-2);
		assert(!title.textContent.includes("Conflict"));
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
		p.moveSuppose(2);
		p.rewindSupposeConflict();
		await waitForConflictRewind(p);
		assert(p.suppose === state && state.position == 1 && state.history.length == 2);
		assert(!state.sharedConflicts.some(Boolean));
		assert(!b.slot.row.elem.classList.contains("pencil-conflict"));
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(!b.slot.possible[b.value], "rewind undid a shared move");
		assert(!p.supposeControls.querySelector(".suppose-accept").hidden);
		assert(!p.supposeControls.querySelector(".suppose-reject").hidden);
		assert(!p.supposeButton.disabled);
		p.moveSuppose(1);
		assert(state.position == 1, "discarded suffix remained accessible");
		assert(host.session.revision == 1 && boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("conflict rewind can return from a nested branch to its enclosing supposition", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(p, 1);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		const root = p.suppose;
		p.enterSuppose();
		p.requestTileAction(b.slot, b.value, "remove");
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.supposeRewindTarget().state === root);
		p.rewindSupposeConflict();
		assert(p.suppose.parent === root && p.suppose.position === 0, "nested steps were skipped");
		await waitForConflictRewind(p);
		assert(p.suppose === root && !root.assumption && root.position == 0 && root.history.length == 1);
		assert(!root.sharedConflicts.some(Boolean));
		assert(!p.rows[row].slots[column].possible[a.value]);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("private row contradictions are not attributed to unrelated shared moves", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		/* Make an intrinsically contradictory row, as tentative deductions can. */
		p.suppose.domains[0][0] = 0;
		p.saveSupposeStep();
		p.renderSuppose();
		const a = wrongMove(host.puzzle, 1);
		host.puzzle.requestTileAction(a.slot, a.value, "remove");
		assert(p.rows[0].elem.classList.contains("pencil-conflict"));
		assert(!p.suppose.sharedConflicts.some(Boolean));
		assert(!p.supposeRewindTarget());
		assert(p.supposeControls.querySelector(".suppose-rewind").hidden);
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("conflicting shared placements stay visible and later moves survive backing out", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p), b = wrongMove(host.puzzle, 1);
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.slot.value, "remove");
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.slot.value, "place");
		assert(a.slot.single && !a.slot.singleElem.hidden);
		assert(a.slot.singleElem.classList.contains("suppose-conflict"));
		assert(p.suppose.sharedConflictMessages[row + ":" + a.slot.value + ":" + column].startsWith("Another player placed "));
		assert(p.suppose.sharedConflictMessages[row + ":" + a.slot.value + ":" + column].endsWith("in column " + (column + 1) + "; you had discarded it there."));
		assert(!a.slot.singleElem.classList.contains("suppose-conflict-discarded"));
		assert(!a.slot.elem.classList.contains("suppose-placed"), "shared placement rendered as tentative");
		host.puzzle.requestTileAction(b.slot, b.value, "remove");
		assert(boardState(p) == boardState(host.puzzle), "conflict stopped later shared moves");
		assert(a.slot.singleElem.classList.contains("suppose-conflict"), "later update erased the marker");
		guest.session.receiveSync(host.session.syncMessage());
		const slot = p.rows[row].slots[column];
		assert(slot.singleElem.classList.contains("suppose-conflict"), "resync lost the conflicting tile");
		p.leaveSuppose();
		assert(slot.single && !slot.singleElem.hidden);
		assert(!slot.singleElem.classList.contains("suppose-conflict"));
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("later shared moves reveal additional conflicts in an already conflicting row", async function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p);
		const row = p.rows.indexOf(a.slot.row), column = a.slot.row.slots.indexOf(a.slot);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		let b;
		for (const [c, slot] of a.slot.row.slots.entries())
			for (const [v, bits] of p.suppose.domains[row].entries())
				if (c != column && !slot.single && v != slot.value && (bits & (1 << c)) && bits != (1 << c))
					b ||= { slot, value: v, column: c };
		assert(b, "no independent second guess in the same row");
		p.requestTileAction(b.slot, b.value, "place");
		assert(p.suppose.position == 2);
		p.sounds.length = 0;
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[column], a.value, "remove");
		assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[b.column], b.value, "remove");
		assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"), "second conflict was lost");
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 2);
		const description = p.supposeControls.querySelector(".suppose-assumption");
		assert(description.textContent.includes("from column " + (b.column + 1)));
		p.moveSuppose(-1);
		assert(!b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(description.textContent.includes("from column " + (column + 1)));
		p.moveSuppose(1);
		assert(b.slot.possibilityElems[b.value].classList.contains("suppose-conflict"));
		guest.session.receiveSync(host.session.syncMessage());
		assert(p.rows[row].slots[b.column].possibilityElems[b.value].classList.contains("suppose-conflict"));
		assert(p.sounds.filter(sound => sound == "practice-mistake").length == 2, "resync repeated the alerts");
		p.rewindSupposeConflict();
		await waitForConflictRewind(p);
		assert(p.suppose.position == 0 && p.suppose.history.length == 1);
		assert(!p.hasSupposeConflict() && !Object.keys(p.suppose.sharedConflictMessages).length);
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared placement conflicts only with its supposed discard, not untouched candidates", function() {
	const host = makeSession("host", "host");
	const guest = makeSession("guest", "guest");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const row = p.rows.findIndex(row => row.slots.every(slot =>
			!slot.single && slot.possible[row.slots[3].value]));
		assert(row >= 0, "no row with all six candidates available");
		const slots = p.rows[row].slots, symbol = slots[3].value;
		p.enterSuppose();
		p.requestTileAction(slots[2], symbol, "remove");
		p.requestTileAction(slots[3], symbol, "remove");
		host.puzzle.requestTileAction(host.puzzle.rows[row].slots[3], symbol, "place");
		assert(p.suppose.conflictTiles[row][symbol] == (1 << 3));
		assert(slots[3].singleElem.classList.contains("suppose-conflict"));
		for (const column of [0, 1, 2, 4, 5])
			assert(!slots[column].possibilityElems[symbol].classList.contains("suppose-conflict"),
				"non-conflicting candidate was highlighted in column " + (column + 1));
		assert(Object.keys(p.suppose.sharedConflictMessages).length == 1);
		assert(p.supposeRewindTarget().position == 1);
		p.rewindSupposeConflict();
		assert(!p.hasSupposeConflict() && slots[3].single);
		assert(!slots[2].possible[symbol], "rewind lost an agreed discard");
		assert(boardState(p) == boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("shared placement hides conflict markers at superseded tentative placements", function() {
	for (const discardFirst of [false, true]) {
		const host = makeSession("host", "host");
		const guest = makeSession("guest", "guest");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			const p = guest.puzzle, a = wrongMove(p);
			const row = p.rows.indexOf(a.slot.row);
			const wrongColumn = a.slot.row.slots.indexOf(a.slot);
			const realColumn = a.slot.row.slots.findIndex(slot => slot.value == a.value);
			p.enterSuppose();
			p.requestTileAction(a.slot, a.value, "place");
			if (discardFirst) {
				host.puzzle.requestTileAction(host.puzzle.rows[row].slots[wrongColumn], a.value, "remove");
				assert(a.slot.possibilityElems[a.value].classList.contains("suppose-conflict"));
			}
			host.puzzle.requestTileAction(host.puzzle.rows[row].slots[realColumn], a.value, "place");
			assert(p.rows[row].slots[realColumn].singleElem.classList.contains("suppose-conflict"));
			const description = p.supposeControls.querySelector(".suppose-assumption").textContent;
			assert(description.startsWith("You placed "));
			assert(description.endsWith("in column " + (wrongColumn + 1) +
				"; another player placed it in column " + (realColumn + 1) + "."));
			for (const [column, slot] of p.rows[row].slots.entries())
				if (column != realColumn)
					assert(!slot.possibilityElems[a.value].classList.contains("suppose-conflict"),
						"superseded placement retained a visible conflict marker");
			assert(p.suppose.conflictTiles[row][a.value] & (1 << wrongColumn),
				"display filtering erased the earlier conflict evidence");
			p.rewindSupposeConflict();
			assert(!p.hasSupposeConflict() && p.rows[row].slots[realColumn].single);
		} finally {
			stopAll(host, guest);
		}
	}
});

Deno.test("suppose activity logs outer transitions and survives resync and late joins", function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const actions = game => (game.session.recentActions.get("alice") || []).map(a => a.type);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		guest.puzzle.enterSuppose();
		guest.puzzle.leaveSuppose();
		guest.session.requestSync();
		assert(guest.puzzle.suppose, "resync lost the branch");
		network.addGuest(late.session);
		for (const game of [host, guest, late])
			assert(JSON.stringify(actions(game)) === '["suppose-enter"]',
			       "private moves, nesting or resync added log entries");
		guest.puzzle.leaveSuppose();
		for (const game of [host, guest, late])
			assert(JSON.stringify(actions(game)) === '["suppose-enter","suppose-leave"]');
		assert(host.session.revision === 0, "presence changed the board revision");
		host.session.receive("alice", { type: "suppose", gameId: host.session.gameId, active: false });
		host.session.receive("alice", { type: "suppose", gameId: host.session.gameId - 1, active: true });
		host.session.receive("unknown", { type: "suppose", gameId: host.session.gameId, active: true });
		assert(actions(host).length === 2, "duplicate or stale presence was logged");
		host.puzzle.enterSuppose();
		host.puzzle.leaveSuppose();
		for (const game of [host, guest, late])
			assert(game.session.recentActions.get("host").slice(-2).map(a => a.type).join() ===
			       "suppose-enter,suppose-leave");
		guest.puzzle.enterSuppose();
		host.session.start(42);
		assert(!host.session.supposingPlayers.size && !actions(guest).length,
		       "new game retained old suppose activity");
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("accepted suppose applications log departure before moves for every player", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const other = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		network.addGuest(other.session);
		for (const player of [host, guest]) {
			player.puzzle.enterSuppose();
			const move = wrongMove(player.puzzle);
			player.puzzle.requestTileAction(move.slot, move.value, "remove");
			await player.puzzle.acceptSuppose();
			for (const game of [host, guest, other])
				assert(game.session.recentActions.get(player.session.playerId).slice(-3)
				       .map(a => a.type).join() === "suppose-enter,suppose-leave,remove",
				       "branch exit was missing, duplicated or followed the replay");
		}
	} finally {
		stopAll(host, guest, other);
	}
});

Deno.test("rejected suppose applications do not log departure", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		host.puzzle.proof = {};
		await guest.puzzle.acceptSuppose();
		host.puzzle.proof = null;
		assert(guest.puzzle.suppose && !guest.puzzle.suppose.pending);
		for (const game of [host, guest])
			assert(game.session.recentActions.get("alice").map(a => a.type).join() === "suppose-enter");
		guest.puzzle.leaveSuppose();
		assert(host.session.recentActions.get("alice").at(-1).type === "suppose-leave");
	} finally {
		host.puzzle.proof = null;
		stopAll(host, guest);
	}
});

Deno.test("host-paced suppose replay pauses between moves and resumes for every player", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const late = makeSession("guest", "bob");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		const moves = [wrongMove(p, 0), wrongMove(p, 1), wrongMove(p, 2)];
		p.enterSuppose();
		for (const move of moves)
			p.requestTileAction(move.slot, move.value, "remove");
		await p.acceptSuppose();
		assert(!p.suppose && !guest.session.pendingSuppose, "acceptance did not close the branch");
		assert(host.session.revision === 1 && guest.session.replay);
		assert(!moves[0].slot.possible[moves[0].value] && moves[1].slot.possible[moves[1].value]);
		await wait(100);
		assert(host.session.revision === 1, "the second move had no delay");
		guest.puzzle.togglePause();
		assert(host.puzzle.paused && guest.puzzle.paused);
		const paused = boardState(host.puzzle);
		network.addGuest(late.session);
		assert(late.session.replay && late.puzzle.paused, "late join lost replay or pause state");
		guest.session.requestSync();
		for (const game of [host, guest]) {
			game.puzzle.toggleAbout();
			game.puzzle.toggleAbout();
			assert(game.puzzle.paused, "closing a dialog resumed a shared pause");
		}
		await wait(400);
		for (const game of [host, guest, late])
			assert(boardState(game.puzzle) === paused && game.session.revision === 1,
			       "replay advanced while paused");
		late.puzzle.togglePause();
		assert(!host.puzzle.paused && !guest.puzzle.paused && !late.puzzle.paused);
		for (let i = 0; i < 20 && host.session.replay; i++) await wait(100);
		assert(!host.session.replay && host.session.revision === 3, "replay did not finish after resume");
		for (const game of [host, guest, late]) {
			assert(!game.session.replay && boardState(game.puzzle) === boardState(host.puzzle));
			assert(game.session.recentActions.get("alice").map(a => a.type).join() ===
			       "suppose-enter,suppose-leave,remove,pause,remove,remove");
		}
	} finally {
		stopAll(host, guest, late);
	}
});

Deno.test("suppose replay blocks shared edits but permits pointing and private exploration", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		await p.acceptSuppose();
		const move = wrongMove(host.puzzle, 3);
		assert(host.session.requestTileAction(move.slot, move.value, "remove") === false);
		assert(guest.session.requestAction({ type: "hint", stage: 1 }) === false);
		host.session.receive("alice", { type: "command", gameId: host.session.gameId,
			commandId: "during-replay", expectedRevision: host.session.revision,
			action: { type: "remove", row: 3, column: move.slot.row.slots.indexOf(move.slot), value: move.value } });
		assert(host.session.revision === 1 && host.session.replay, "incoming command interrupted replay");
		host.session.requestHover({ type: "tile", row: 3, column: 0, value: 0 });
		assert(guest.session.hovers.has("host"), "pointing was blocked");
		host.puzzle.enterSuppose();
		host.puzzle.requestTileAction(move.slot, move.value, "remove");
		assert(host.puzzle.suppose.position === 1);
		await host.puzzle.acceptSuppose();
		host.puzzle.rejectSuppose();
		assert(host.puzzle.suppose && host.session.revision === 1, "private Apply or Reject escaped the replay lock");
		host.session.advanceSupposeReplay();
		assert(!host.session.replay && host.session.revision === 2);
		assert(host.puzzle.suppose, "another player's replay closed private exploration");
		host.puzzle.leaveSuppose();
		assert(host.session.requestTileAction(move.slot, move.value, "remove"));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("replay acceptance survives missed messages and duplicate requests without restarting", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle;
		p.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		let command;
		guest.session.connectHost(message => {
			if (message.type === "command") command = message;
			host.session.receive("alice", message);
		});
		host.session.peers.set("alice", () => {});
		await p.acceptSuppose();
		assert(p.suppose.pending && host.session.revision === 1);
		host.session.peers.set("alice", message => guest.session.receive("host", message));
		guest.session.requestSync();
		assert(!p.suppose && guest.session.replay, "resync failed to recover acceptance");
		host.session.receive("alice", command);
		assert(host.session.revision === 1 && guest.session.replay, "duplicate restarted replay");
		host.session.advanceSupposeReplay();
		host.session.receive("alice", command);
		assert(host.session.revision === 2 && !guest.session.replay, "completed replay restarted");
		assert(boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("new games and leaving multiplayer cancel scheduled replay moves", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		for (const end of ["new-game", "leave"]) {
			guest.puzzle.enterSuppose();
			for (const row of [0, 1]) {
				const move = wrongMove(guest.puzzle, row);
				guest.puzzle.requestTileAction(move.slot, move.value, "remove");
			}
			await guest.puzzle.acceptSuppose();
			assert(host.session.replay && host.session.replayTimer !== null);
			if (end === "new-game") host.session.start(0x12345678);
			else host.session.leave();
			assert(!host.session.replay && host.session.replayTimer === null);
			const before = boardState(host.puzzle);
			await new Promise(resolve => setTimeout(resolve, 350));
			assert(boardState(host.puzzle) === before, "cancelled replay changed the board");
		}
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("host and guest dialogs do not pause a shared replay", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		for (const row of [0, 1]) {
			const move = wrongMove(guest.puzzle, row);
			guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		}
		await guest.puzzle.acceptSuppose();
		host.puzzle.toggleAbout();
		guest.puzzle.toggleAbout();
		assert(!host.puzzle.paused && !guest.puzzle.paused && host.session.revision === 1);
		await new Promise(resolve => setTimeout(resolve, 350));
		assert(!host.session.replay && host.session.revision === 2,
		       "a dialog suspended the replay");
		host.puzzle.toggleAbout();
		guest.puzzle.toggleAbout();
		assert(!host.puzzle.paused && !guest.puzzle.paused);
		assert(boardState(host.puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("a mistake during paced replay stops later moves and clue dismissals, also in Zen", async function() {
	for (const zen of [false, true]) {
		const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
		const network = new InMemoryMultiplayerNetwork(host.session);
		try {
			host.session.rules.practiceMode = zen;
			host.session.start(0x12345678);
			network.addGuest(guest.session);
			const p = guest.puzzle;
			p.enterSuppose();
			const a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
			p.requestTileAction(a.slot, a.value, "remove");
			p.requestTileAction(b.slot, b.value, "place");
			p.requestTileAction(c.slot, c.value, "remove");
			const clue = p.clues.find(clue => clue.display && clue.active);
			p.requestClueAction(clue, false);
			await p.acceptSuppose();
			assert(host.session.replay && host.session.revision === 1);
			host.session.advanceSupposeReplay();
			assert(!host.session.replay && !guest.session.replay && host.session.revision === 2);
			assert(c.slot.possible[c.value], "replay continued after the mistake");
			assert(!host.session.history.some(commit => commit.action.type === "clue"),
			       "replay dismissed clues after the mistake");
			assert(p.losses === 1 && host.puzzle.losses === 1);
			assert(boardState(p) === boardState(host.puzzle));
		} finally {
			stopAll(host, guest);
		}
	}
});

Deno.test("an entirely redundant branch still acknowledges acceptance across resync", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		guest.puzzle.enterSuppose();
		const move = wrongMove(guest.puzzle);
		guest.puzzle.requestTileAction(move.slot, move.value, "remove");
		let command;
		guest.session.connectHost(message => {
			if (message.type === "command") command = message;
		});
		await guest.puzzle.acceptSuppose();
		const action = command.action.moves[0];
		host.session.requestAction(action);
		host.session.peers.set("alice", () => {});
		host.session.receive("alice", command);
		assert(host.session.revision === 1 && !host.session.replay && guest.puzzle.suppose.pending);
		guest.session.receiveSync(host.session.syncMessage());
		assert(!guest.puzzle.suppose && !guest.session.pendingSuppose && !guest.session.replay);
		assert(boardState(host.puzzle) === boardState(guest.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("animated conflict rewind stops on pause and manual navigation", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, first = wrongMove(p);
		p.enterSuppose();
		p.requestTileAction(first.slot, first.value, "place");
		for (const row of [1, 2, 3]) {
			const move = wrongMove(p, row);
			p.requestTileAction(move.slot, move.value, "remove");
		}
		host.puzzle.requestTileAction(host.puzzle.rows[0].slots[first.slot.row.slots.indexOf(first.slot)],
			first.value, "remove");
		assert(p.suppose.position === 4 && p.supposeRewindTarget().position === 0);
		p.rewindSupposeConflict();
		assert(p.suppose.position === 3 && p.suppose.history.length === 4);
		await wait(100);
		assert(p.suppose.position === 3, "rewind had no delay");
		p.togglePause();
		assert(p.paused && p.supposeRewindTimer === null);
		await wait(350);
		assert(p.suppose.position === 3, "rewind continued while paused");
		p.togglePause();
		await wait(350);
		assert(p.suppose.position === 3, "rewind resumed without another click");
		p.rewindSupposeConflict();
		assert(p.suppose.position === 2 && p.suppose.history.length === 3);
		p.moveSuppose(-1);
		assert(p.suppose.position === 1 && p.supposeRewindTimer === null);
		await wait(350);
		assert(p.suppose.position === 1, "animation overrode manual navigation");
		p.rewindSupposeConflict();
		assert(p.suppose.position === 0 && p.suppose.history.length === 1);
		assert(!p.hasSupposeConflict() && p.supposeRewindTimer === null);
		assert(host.session.revision === 1 && boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("animated conflict rewind follows newly exposed earlier conflicts", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1), c = wrongMove(p, 2);
		p.enterSuppose();
		p.requestTileAction(a.slot, a.value, "place");
		p.requestTileAction(b.slot, b.value, "place");
		p.requestTileAction(c.slot, c.value, "remove");
		const discard = move => host.puzzle.requestTileAction(
			host.puzzle.rows[p.rows.indexOf(move.slot.row)].slots[move.slot.row.slots.indexOf(move.slot)],
			move.value, "remove");
		discard(b);
		assert(p.supposeRewindTarget().position === 1);
		p.rewindSupposeConflict();
		assert(p.suppose.position === 2);
		discard(a);
		assert(p.supposeRewindTarget().position === 0);
		await waitForConflictRewind(p);
		assert(p.suppose.position === 0 && p.suppose.history.length === 1);
		assert(!p.hasSupposeConflict() && host.session.revision === 2);
		assert(boardState(p) === boardState(host.puzzle));
	} finally {
		stopAll(host, guest);
	}
});

Deno.test("leaving or resyncing a supposition cancels animated rewind", async function() {
	const host = makeSession("host", "host"), guest = makeSession("guest", "alice");
	const network = new InMemoryMultiplayerNetwork(host.session);
	try {
		host.session.start(0x12345678);
		network.addGuest(guest.session);
		for (const exit of ["resync", "leave", "new-game"]) {
			const p = guest.puzzle, a = wrongMove(p, 0), b = wrongMove(p, 1);
			p.enterSuppose();
			p.requestTileAction(a.slot, a.value, "place");
			p.requestTileAction(b.slot, b.value, "remove");
			host.puzzle.requestTileAction(host.puzzle.rows[0].slots[a.slot.row.slots.indexOf(a.slot)],
				a.value, "remove");
			p.rewindSupposeConflict();
			assert(p.suppose.position === 1 && p.supposeRewindTimer !== null);
			if (exit === "resync") guest.session.requestSync();
			else if (exit === "leave") p.leaveSuppose();
			else host.session.start(0x12345678);
			assert(p.supposeRewindTimer === null);
			const state = p.suppose;
			await new Promise(resolve => setTimeout(resolve, 350));
			assert(p.suppose === state && (!state || state.position === 1));
			p.leaveSuppose();
		}
	} finally {
		stopAll(host, guest);
	}
});
