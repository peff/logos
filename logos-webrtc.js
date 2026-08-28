/* Manual-signaling WebRTC transport for Logos multiplayer. */

const webRTCProtocol = "logos-webrtc-1";

function encodeSignal(signal) {
	var bytes = new TextEncoder().encode(JSON.stringify(signal));
	var binary = "";
	for (var i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i]);
	return "LOGOS1." + btoa(binary).replace(/\+/g, "-")
		.replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSignal(blob, expectedType) {
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
		signal = JSON.parse(new TextDecoder().decode(bytes));
	} catch (e) {
		throw new Error("The Logos connection message is malformed.");
	}
	if (!signal || signal.protocol != webRTCProtocol ||
	    signal.type != expectedType || typeof signal.connectionId != "string" ||
	    typeof signal.playerId != "string" || !signal.description ||
	    signal.description.type != expectedType ||
	    typeof signal.description.sdp != "string")
		throw new Error("The Logos connection message has the wrong type.");
	return signal;
}

function waitForIceGathering(peer, timeout) {
	if (peer.iceGatheringState == "complete")
		return Promise.resolve();
	return new Promise(function(resolve, reject) {
		var timer = setTimeout(function() {
			peer.removeEventListener("icegatheringstatechange", changed);
			reject(new Error("Timed out while finding connection routes."));
		}, timeout);
		function changed() {
			if (peer.iceGatheringState != "complete")
				return;
			clearTimeout(timer);
			peer.removeEventListener("icegatheringstatechange", changed);
			resolve();
		}
		peer.addEventListener("icegatheringstatechange", changed);
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
		this.configuration = { iceServers: options.iceServers || [] };
		this.iceGatheringTimeout = options.iceGatheringTimeout || 10000;
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
		var record = { connectionId, peer, channel, playerId: null };
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
		this.changed("invitation-ready");
		return encodeSignal({
			protocol: webRTCProtocol,
			type: "offer",
			connectionId,
			playerId: this.session.playerId,
			description: connectionDescription(peer),
		});
	}

	async acceptAnswer(blob) {
		var signal = decodeSignal(blob, "answer");
		var record = this.pending.get(signal.connectionId);
		if (!record)
			throw new Error("This answer does not match a pending invitation.");
		record.playerId = signal.playerId;
		await record.peer.setRemoteDescription(signal.description);
		this.changed("connecting");
	}

	prepareChannel(record) {
		var transport = this;
		record.channel.onopen = function() {
			if (!record.playerId) {
				record.peer.close();
				return;
			}
			transport.pending.delete(record.connectionId);
			transport.connected.set(record.playerId, record);
			transport.session.addPeer(record.playerId, function(message) {
				record.channel.send(JSON.stringify(message));
			});
			transport.changed("connected");
		};
		record.channel.onmessage = function(event) {
			var message = parseChannelMessage(event);
			if (message && record.playerId)
				transport.session.receive(record.playerId, message);
		};
		record.channel.onclose = function() {
			if (record.playerId) {
				transport.connected.delete(record.playerId);
				transport.session.removePeer(record.playerId);
			}
			transport.pending.delete(record.connectionId);
			transport.changed("disconnected");
		};
	}

	changed(state) {
		this.onChange({
			state,
			connected: this.connected.size,
			pending: this.pending.size,
		});
	}

	close() {
		for (var record of this.pending.values())
			record.peer.close();
		for (var record of this.connected.values())
			record.peer.close();
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
		this.configuration = { iceServers: options.iceServers || [] };
		this.iceGatheringTimeout = options.iceGatheringTimeout || 10000;
		this.onChange = options.onChange || function() {};
		this.peer = null;
		this.channel = null;
		this.hostId = null;
	}

	async acceptInvitation(blob) {
		var signal = decodeSignal(blob, "offer");
		this.hostId = signal.playerId;
		this.peer = this.peerConnectionFactory(this.configuration);
		var transport = this;
		this.peer.ondatachannel = function(event) {
			transport.channel = event.channel;
			transport.prepareChannel();
		};
		await this.peer.setRemoteDescription(signal.description);
		await this.peer.setLocalDescription(await this.peer.createAnswer());
		await waitForIceGathering(this.peer, this.iceGatheringTimeout);
		this.onChange({ state: "answer-ready", connected: false });
		return encodeSignal({
			protocol: webRTCProtocol,
			type: "answer",
			connectionId: signal.connectionId,
			playerId: this.session.playerId,
			description: connectionDescription(this.peer),
		});
	}

	prepareChannel() {
		var transport = this;
		this.session.connectHost(function(message) {
			transport.channel.send(JSON.stringify(message));
		});
		this.channel.onopen = function() {
			transport.onChange({ state: "connected", connected: true });
		};
		this.channel.onmessage = function(event) {
			var message = parseChannelMessage(event);
			if (message)
				transport.session.receive(transport.hostId, message);
		};
		this.channel.onclose = function() {
			transport.onChange({ state: "disconnected", connected: false });
		};
	}

	close() {
		if (this.peer)
			this.peer.close();
		this.session.leave();
	}
}

export {
	WebRTCGuestTransport,
	WebRTCHostTransport,
	decodeSignal,
	encodeSignal,
	waitForIceGathering,
};
