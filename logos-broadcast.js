/* Same-origin, multi-tab transport for developing Logos multiplayer. */

const broadcastProtocol = "logos-friends-broadcast-1";

function normalizeRoomId(roomId) {
	return String(roomId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

class BroadcastRoomTransport {
	constructor(session, options) {
		this.session = session;
		this.roomId = normalizeRoomId(options.roomId);
		this.playerName = options.playerName || session.playerId;
		this.hostId = null;
		this.players = new Map();
		this.onChange = options.onChange || function() {};
		var channelFactory = options.channelFactory ||
			function(name) { return new BroadcastChannel(name); };

		if (!this.roomId)
			throw new Error("a broadcast room requires a room ID");
		this.channel = channelFactory("logos-friends-" + this.roomId);
		this.channel.onmessage = this.handleEvent.bind(this);

		if (session.role == "guest") {
			var transport = this;
			session.connectHost(function(message) {
				transport.post("session", message, transport.hostId);
			});
			this.post("hello", null, null, { name: this.playerName });
		} else {
			this.players.set(session.playerId, this.playerName);
		}
		this.changed();
	}

	post(type, payload, to, extra) {
		var envelope = Object.assign({
			protocol: broadcastProtocol,
			roomId: this.roomId,
			from: this.session.playerId,
			name: this.playerName,
			to: to || null,
			type: type,
			payload: payload,
		}, extra || {});
		this.channel.postMessage(envelope);
	}

	handleEvent(event) {
		var message = event.data;
		if (!message || message.protocol != broadcastProtocol ||
		    message.roomId != this.roomId ||
		    message.from == this.session.playerId ||
		    message.to && message.to != this.session.playerId)
			return;

		if (this.session.role == "host")
			this.handleHostMessage(message);
		else
			this.handleGuestMessage(message);
	}

	handleHostMessage(message) {
		if (message.type == "hello") {
			var transport = this;
			this.players.set(message.from, message.name || message.from);
			this.session.addPeer(message.from, function(payload) {
				transport.post("session", payload, message.from);
			});
			this.changed();
		} else if (message.type == "session" &&
			   this.players.has(message.from)) {
			this.session.receive(message.from, message.payload);
		} else if (message.type == "bye") {
			this.players.delete(message.from);
			this.session.removePeer(message.from);
			this.changed();
		}
	}

	handleGuestMessage(message) {
		if (message.type == "bye" && message.from == this.hostId) {
			this.hostId = null;
			this.players.clear();
			this.changed();
			return;
		}
		if (message.type != "session")
			return;
		if (this.hostId && message.from != this.hostId)
			return;
		this.hostId = message.from;
		this.players.set(message.from, message.name || "Host");
		this.session.receive(message.from, message.payload);
		this.changed();
	}

	changed() {
		this.onChange({
			connected: this.session.role == "host" || !!this.hostId,
			players: new Map(this.players),
		});
	}

	close() {
		this.post("bye", null, this.hostId);
		this.channel.close();
		this.session.leave();
	}
}

export { BroadcastRoomTransport, normalizeRoomId };
