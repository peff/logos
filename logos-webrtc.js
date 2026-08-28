/* Manual-signaling WebRTC transport for Logos multiplayer. */

(function() {

const webRTCProtocol = "logos-webrtc-1";
const defaultIceServers = [
	{ urls: "stun:stun.cloudflare.com:3478" },
];

function normalizePlayerName(name, fallback) {
	name = String(name || "")
		.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
		.trim().replace(/\s+/g, " ");
	name = Array.from(name).slice(0, 32).join("");
	return name || fallback;
}

async function compress(bytes) {
	var stream = new Blob([bytes]).stream()
		.pipeThrough(new CompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes) {
	var stream = new Blob([bytes]).stream()
		.pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodeSignal(signal) {
	var bytes = await compress(
		new TextEncoder().encode(JSON.stringify(signal)));
	var binary = "";
	for (var i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i]);
	return "LOGOS1." + btoa(binary).replace(/\+/g, "-")
		.replace(/\//g, "_").replace(/=+$/, "");
}

async function decodeSignal(blob, expectedType) {
	if (typeof blob != "string" || !blob.trim().startsWith("LOGOS1."))
		throw new Error("This is not a Logos connection message.");
	var encoded = blob.trim().slice(7).replace(/-/g, "+").replace(/_/g, "/");
	while (encoded.length % 4)
		encoded += "=";
	var binary;
	try {
		binary = atob(encoded);
	} catch (e) {
		throw new Error("The Logos connection message is malformed.");
	}
	var bytes = new Uint8Array(binary.length);
	for (var i = 0; i < binary.length; i++)
		bytes[i] = binary.charCodeAt(i);
	var signal;
	try {
		bytes = await decompress(bytes);
		signal = JSON.parse(new TextDecoder().decode(bytes));
	} catch (e) {
		throw new Error("The Logos connection message is malformed.");
	}
	if (!signal || signal.protocol != webRTCProtocol ||
	    signal.type != expectedType || typeof signal.connectionId != "string" ||
	    typeof signal.playerId != "string" ||
	    typeof signal.playerName != "string" || !signal.description ||
	    signal.description.type != expectedType ||
	    typeof signal.description.sdp != "string")
		throw new Error("The Logos connection message has the wrong type.");
	signal.playerName = normalizePlayerName(signal.playerName,
		expectedType == "offer" ? "Host" : "Guest");
	return signal;
}

function waitForIceGathering(peer, timeout) {
	function hasServerReflexiveCandidate() {
		return peer.localDescription &&
			/(?:^|\s)typ srflx(?:\s|$)/m.test(peer.localDescription.sdp);
	}
	if (peer.iceGatheringState == "complete" || hasServerReflexiveCandidate())
		return Promise.resolve();
	return new Promise(function(resolve) {
		var timer = setTimeout(finished, timeout);
		function finished() {
			peer.removeEventListener("icegatheringstatechange", changed);
			peer.removeEventListener("icecandidate", candidate);
			resolve();
		}
		function changed() {
			if (peer.iceGatheringState != "complete")
				return;
			clearTimeout(timer);
			finished();
		}
		function candidate(event) {
			if ((!event.candidate || event.candidate.type != "srflx") &&
			    !hasServerReflexiveCandidate())
				return;
			clearTimeout(timer);
			finished();
		}
		peer.addEventListener("icegatheringstatechange", changed);
		peer.addEventListener("icecandidate", candidate);
	});
}

function connectionDescription(peer) {
	return {
		type: peer.localDescription.type,
		sdp: peer.localDescription.sdp,
	};
}

function parseChannelMessage(event) {
	try {
		return JSON.parse(event.data);
	} catch (e) {
		return null;
	}
}

class WebRTCHostTransport {
	constructor(session, options) {
		options = options || {};
		this.session = session;
		this.peerConnectionFactory = options.peerConnectionFactory ||
			function(configuration) {
				return new RTCPeerConnection(configuration);
			};
		this.configuration = {
			iceServers: options.iceServers || defaultIceServers,
		};
		this.iceGatheringTimeout = options.iceGatheringTimeout || 10000;
		this.connectionTimeout = options.connectionTimeout || 30000;
		this.playerName = normalizePlayerName(options.playerName, "Host");
		this.idFactory = options.idFactory || function() {
			return crypto.randomUUID();
		};
		this.onChange = options.onChange || function() {};
		this.pending = new Map();
		this.connected = new Map();
	}

	async createInvitation() {
		var connectionId = this.idFactory();
		var peer = this.peerConnectionFactory(this.configuration);
		var channel = peer.createDataChannel("logos-game");
		var record = {
			connectionId, peer, channel, playerId: null,
			failureTimer: null, closed: false,
		};
		this.pending.set(connectionId, record);
		this.prepareChannel(record);
		try {
			await peer.setLocalDescription(await peer.createOffer());
			await waitForIceGathering(peer, this.iceGatheringTimeout);
		} catch (e) {
			this.pending.delete(connectionId);
			peer.close();
			throw e;
		}
		this.changed("invitation-ready", record);
		return await encodeSignal({
			protocol: webRTCProtocol,
			type: "offer",
			connectionId,
			playerId: this.session.playerId,
			playerName: this.playerName,
			description: connectionDescription(peer),
		});
	}

	async acceptAnswer(blob) {
		var signal = await decodeSignal(blob, "answer");
		var record = this.pending.get(signal.connectionId);
		if (!record)
			throw new Error("This answer does not match a pending invitation.");
		record.playerId = signal.playerId;
		record.playerName = signal.playerName;
		this.scheduleFailure(record);
		try {
			await record.peer.setRemoteDescription(signal.description);
		} catch (e) {
			this.drop(record, "failed");
			throw e;
		}
		if (this.pending.has(record.connectionId))
			this.changed("connecting", record);
	}

	prepareChannel(record) {
		var transport = this;
		record.peer.onconnectionstatechange = function() {
			var state = record.peer.connectionState;
			if (state == "failed" || state == "closed")
				transport.drop(record, state);
			else if (state == "disconnected") {
				transport.scheduleFailure(record);
				transport.changed("disconnected", record);
			} else if (state == "connected" &&
				   record.channel.readyState == "open") {
				transport.clearFailure(record);
				transport.changed("connected", record);
			}
		};
		record.channel.onopen = function() {
			if (!record.playerId) {
				record.peer.close();
				return;
			}
			transport.pending.delete(record.connectionId);
			transport.connected.set(record.playerId, record);
			transport.clearFailure(record);
			transport.session.addPeer(record.playerId, function(message) {
				record.channel.send(JSON.stringify(message));
			});
			transport.changed("connected", record);
		};
		record.channel.onmessage = function(event) {
			var message = parseChannelMessage(event);
			if (message && record.playerId)
				transport.session.receive(record.playerId, message);
		};
		record.channel.onclose = function() {
			transport.drop(record, "closed");
		};
	}

	scheduleFailure(record) {
		if (record.failureTimer || record.closed)
			return;
		var transport = this;
		record.failureTimer = setTimeout(function() {
			transport.drop(record, "failed");
		}, this.connectionTimeout);
	}

	clearFailure(record) {
		if (record.failureTimer)
			clearTimeout(record.failureTimer);
		record.failureTimer = null;
	}

	drop(record, state) {
		if (record.closed)
			return;
		record.closed = true;
		this.clearFailure(record);
		this.pending.delete(record.connectionId);
		if (record.playerId && this.connected.get(record.playerId) == record) {
			this.connected.delete(record.playerId);
			this.session.removePeer(record.playerId);
		}
		record.peer.close();
		this.changed(state, record);
	}

	changed(state, record) {
		this.onChange({
			state,
			connected: this.connected.size,
			pending: this.pending.size,
			connectionId: record && record.connectionId,
			playerId: record && record.playerId,
			playerName: record && record.playerName,
		});
	}

	close() {
		for (var record of Array.from(this.pending.values()))
			this.drop(record, "closed");
		for (var record of Array.from(this.connected.values()))
			this.drop(record, "closed");
		this.pending.clear();
		this.connected.clear();
		this.session.leave();
	}
}

class WebRTCGuestTransport {
	constructor(session, options) {
		options = options || {};
		this.session = session;
		this.peerConnectionFactory = options.peerConnectionFactory ||
			function(configuration) {
				return new RTCPeerConnection(configuration);
			};
		this.configuration = {
			iceServers: options.iceServers || defaultIceServers,
		};
		this.iceGatheringTimeout = options.iceGatheringTimeout || 10000;
		this.connectionTimeout = options.connectionTimeout || 30000;
		this.signalingTimeout = options.signalingTimeout || 5 * 60 * 1000;
		this.playerName = normalizePlayerName(options.playerName, "Guest");
		this.onChange = options.onChange || function() {};
		this.peer = null;
		this.channel = null;
		this.hostId = null;
		this.failureTimer = null;
		this.connected = false;
		this.closed = false;
	}

	async acceptInvitation(blob) {
		var signal = await decodeSignal(blob, "offer");
		this.hostId = signal.playerId;
		this.hostName = signal.playerName;
		this.peer = this.peerConnectionFactory(this.configuration);
		var transport = this;
		this.peer.onconnectionstatechange = function() {
			var state = transport.peer.connectionState;
			if (state == "closed")
				transport.finish(state);
			else if (state == "failed" && transport.connected)
				transport.finish(state);
			else if (state == "failed")
				transport.connectionLost();
			else if (state == "disconnected")
				transport.connectionLost();
			else if (state == "connected") {
				transport.clearFailure();
				if (transport.channel &&
				    transport.channel.readyState == "open")
					transport.onChange({
						state: "connected", connected: true,
					});
			}
		};
		this.peer.ondatachannel = function(event) {
			transport.channel = event.channel;
			transport.prepareChannel();
		};
		try {
			await this.peer.setRemoteDescription(signal.description);
			await this.peer.setLocalDescription(await this.peer.createAnswer());
			await waitForIceGathering(this.peer, this.iceGatheringTimeout);
		} catch (e) {
			this.finish("failed");
			throw e;
		}
		this.onChange({ state: "answer-ready", connected: false });
		return await encodeSignal({
			protocol: webRTCProtocol,
			type: "answer",
			connectionId: signal.connectionId,
			playerId: this.session.playerId,
			playerName: this.playerName,
			description: connectionDescription(this.peer),
		});
	}

	prepareChannel() {
		var transport = this;
		this.session.connectHost(function(message) {
			transport.channel.send(JSON.stringify(message));
		});
		this.channel.onopen = function() {
			transport.clearFailure();
			transport.connected = true;
			transport.onChange({ state: "connected", connected: true });
		};
		this.channel.onmessage = function(event) {
			var message = parseChannelMessage(event);
			if (message)
				transport.session.receive(transport.hostId, message);
		};
		this.channel.onclose = function() {
			transport.finish("closed");
		};
	}

	connectionLost() {
		this.onChange({
			state: this.connected ? "disconnected" : "answer-ready",
			connected: false,
		});
		if (this.failureTimer || this.closed)
			return;
		var transport = this;
		this.failureTimer = setTimeout(function() {
			transport.finish("failed");
		}, this.connected ? this.connectionTimeout : this.signalingTimeout);
	}

	clearFailure() {
		if (this.failureTimer)
			clearTimeout(this.failureTimer);
		this.failureTimer = null;
	}

	finish(state) {
		if (this.closed)
			return;
		this.closed = true;
		this.clearFailure();
		this.peer.close();
		this.session.leave();
		this.onChange({ state, connected: false, terminal: true });
	}

	close() {
		this.closed = true;
		this.clearFailure();
		if (this.peer)
			this.peer.close();
		this.session.leave();
	}
}

Object.assign(globalThis.LogosFriends ||= {}, {
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	encodeSignal,
	normalizePlayerName,
	waitForIceGathering,
});

})();
