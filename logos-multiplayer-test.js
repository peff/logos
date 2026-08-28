import { Logos, makePuzzle } from "./logos-test.js";
import {
	InMemoryMultiplayerNetwork,
	MultiplayerSession,
} from "./logos-multiplayer.js";
import { BroadcastRoomTransport } from "./logos-broadcast.js";
import {
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	encodeSignal,
} from "./logos-webrtc.js";

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

Deno.test("history replay dismisses exhausted clues only once", function() {
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
	assert(dismissals == 1,
	       "history replay checked exhausted clues more than once");
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

Deno.test("broadcast rooms connect independently constructed sessions", function() {
	const rooms = new Map();
	function channelFactory(name) {
		const peers = rooms.get(name) || new Set();
		const channel = {
			onmessage: null,
			postMessage(message) {
				for (const peer of peers)
					if (peer != channel && peer.onmessage)
						peer.onmessage({ data: message });
			},
			close() { peers.delete(channel); },
		};
		peers.add(channel);
		rooms.set(name, peers);
		return channel;
	}

	const host = makeSession("host", "host-id");
	const guest = makeSession("guest", "guest-id");
	host.session.start(0x55667788);
	const hostTransport = new BroadcastRoomTransport(host.session, {
		roomId: "ABC123",
		playerName: "Host",
		channelFactory,
	});
	const guestTransport = new BroadcastRoomTransport(guest.session, {
		roomId: "abc-123",
		playerName: "Guest",
		channelFactory,
	});

	assert(guest.session.ready && host.session.peers.has("guest-id") &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the broadcast guest did not discover and sync from the host");
	const move = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 1 && guest.session.revision == 1 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the broadcast transport did not carry a guest move");

	guestTransport.close();
	assert(!host.session.peers.has("guest-id"),
	       "the broadcast host retained a guest which left");
	hostTransport.close();
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

function fakeWebRTCFactory() {
	let nextPeer = 1;
	const offers = new Map();
	const answers = new Map();

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
		constructor() {
			this.id = nextPeer++;
			this.iceGatheringState = "complete";
			this.localDescription = null;
			this.remoteDescription = null;
			this.channel = null;
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
		}
		async setRemoteDescription(description) {
			this.remoteDescription = description;
			if (description.type != "answer")
				return;
			const key = description.sdp.slice("answer:".length);
			const guest = answers.get(key);
			assert(offers.get(this.id) == this && guest,
			       "the fake answer did not match its offer");
			const guestChannel = new FakeChannel();
			this.channel.peer = guestChannel;
			guestChannel.peer = this.channel;
			guest.ondatachannel({ channel: guestChannel });
			this.channel.readyState = guestChannel.readyState = "open";
			if (guestChannel.onopen)
				guestChannel.onopen();
			if (this.channel.onopen)
				this.channel.onopen();
		}
		addEventListener() {}
		removeEventListener() {}
		close() {
			if (this.channel)
				this.channel.close();
		}
	}

	return function() { return new FakePeerConnection(); };
}

Deno.test("WebRTC signaling blobs are compressed, versioned and typed", async function() {
	const blob = await encodeSignal({
		protocol: "logos-webrtc-1",
		type: "offer",
		connectionId: "connection",
		playerId: "host",
		description: { type: "offer", sdp: "test-Σ" },
	});
	const signal = await decodeSignal(blob, "offer");
	assert(signal.description.sdp == "test-Σ" && blob.startsWith("LOGOS1."),
	       "the signaling blob did not round trip");
	let rejected = false;
	try {
		await decodeSignal(blob, "answer");
	} catch (e) {
		rejected = true;
	}
	assert(rejected, "an offer was accepted where an answer was required");
});

Deno.test("WebRTC transports connect sessions through offer and answer", async function() {
	const factory = fakeWebRTCFactory();
	const host = makeSession("host", "host-id");
	const guest = makeSession("guest", "guest-id");
	host.session.start(0x99887766);
	const hostTransport = new WebRTCHostTransport(host.session, {
		peerConnectionFactory: factory,
		idFactory: () => "connection-id",
	});
	const guestTransport = new WebRTCGuestTransport(guest.session, {
		peerConnectionFactory: factory,
	});

	const invitation = await hostTransport.createInvitation();
	const answer = await guestTransport.acceptInvitation(invitation);
	await hostTransport.acceptAnswer(answer);
	assert(guest.session.ready && host.session.peers.has("guest-id") &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the WebRTC guest did not synchronize after connecting");
	const move = wrongMove(guest.puzzle);
	guest.puzzle.requestTileAction(move.slot, move.value, "remove");
	assert(host.session.revision == 1 && guest.session.revision == 1 &&
	       boardState(host.puzzle) == boardState(guest.puzzle),
	       "the WebRTC data channel did not carry the guest move");

	guestTransport.close();
	hostTransport.close();
	stopAll(host, guest);
});
