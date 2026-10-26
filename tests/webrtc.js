import {
	WebRTCGuestTransport, WebRTCHostTransport, decodeSignal, encodeSignal,
	normalizePlayerName, assert, boardState, makeSession, stopAll, wrongMove,
} from "./multiplayer-helpers.js";

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
			assert(new TextEncoder().encode(data).length <= 16384, "oversized data-channel frame");
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
	const large = { type: "test-history", text: "tiles: 🏛️ ".repeat(10000) };
	const receiveHost = host.session.receive, receiveGuest = guest.session.receive;
	const delivered = [];
	try {
		host.session.receive = (from, message) => delivered.push(message);
		guest.session.receive = (from, message) => delivered.push(message);
		host.session.sendTo("guest-id", large);
		guest.session.hostSender(large);
		assert(delivered.length === 2 && delivered.every(message => JSON.stringify(message) === JSON.stringify(large)),
		       "large Unicode history did not survive channel fragmentation");
	} finally {
		host.session.receive = receiveHost;
		guest.session.receive = receiveGuest;
	}

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
