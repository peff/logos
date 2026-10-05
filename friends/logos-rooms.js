/* Room discovery and signaling; game messages remain on WebRTC. */
(function() {
function normalizeRoomName(name) {
	return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function validRoomName(name) {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64;
}

function generateRoomName() {
	const words = [
		["amber", "bronze", "golden", "ivory", "marble", "silver", "quiet", "bright",
		 "ancient", "azure", "gentle", "hidden", "lucid", "sacred", "sunlit", "verdant"],
		["olive", "owl", "laurel", "lyre", "cedar", "cypress", "dolphin", "iris",
		 "lotus", "myrtle", "phoenix", "raven", "sphinx", "tortoise", "willow", "zephyr"],
		["garden", "grove", "portico", "symposium", "agora", "academy", "harbor", "temple",
		 "library", "fountain", "island", "meadow", "oracle", "terrace", "theater", "courtyard"],
	];
	const random = crypto.getRandomValues(new Uint32Array(words.length));
	return words.map((list, i) => list[random[i] % list.length]).join("-");
}

class RoomSignaling {
	constructor(options) {
		Object.assign(this, options);
		this.token = Array.from(crypto.getRandomValues(new Uint8Array(32)),
			value => value.toString(16).padStart(2, "0")).join("");
		this.pending = new Map();
		this.cancelled = new Set();
		this.gathering = new Set();
		this.role = null;
		this.transport = null;
		this.stopped = false;
		this.expiresAt = 0;
		this.retryCount = 0;
		this.nameAttempts = 0;
	}

	start() {
		this.connect();
	}

	report(state, message) {
		this.onState({ state, message, role: this.role, expiresAt: this.expiresAt });
	}

	connect() {
		if (this.stopped) return;
		this.report("connecting", this.role ? "Reconnecting to the room…" : "Joining room…");
		const url = new URL(this.endpoint);
		url.protocol = url.protocol == "https:" ? "wss:" : "ws:";
		url.pathname = url.pathname.replace(/\/$/, "") + "/" + this.name;
		const ws = this.socket = new WebSocket(url);
		const timeout = setTimeout(() => ws.close(), 15000);
		ws.onopen = () => {
			clearTimeout(timeout);
			ws.send(JSON.stringify({ type: "join", token: this.token,
				guestOnly: this.role == "guest", hostOnly: !!this.hostOnly,
				resume: this.role == "host" }));
		};
		ws.onmessage = event => {
			if (this.socket !== ws || this.stopped) return;
			let message;
			try { message = JSON.parse(event.data); }
			catch (_) { this.fail("Invalid response from the room server"); return; }
			this.receive(message, ws).catch(error => {
				if (this.socket !== ws || this.stopped) return;
				if (this.role == "host" && message.id) {
					this.send({ type: "reject", id: message.id });
					this.discard(message.id);
					this.report("guest-error", "A guest could not connect. They can try joining again.");
				} else this.fail(error.message);
			});
		};
		ws.onclose = () => {
			clearTimeout(timeout);
			if (this.socket !== ws || this.stopped) return;
			if (this.expiresAt && Date.now() >= this.expiresAt)
				return this.finish("expired", "Invitation expired");
			if (++this.retryCount > 4)
				return this.fail("Could not reach the room. Try joining again.");
			this.report("connecting", "Reconnecting to the room…");
			this.retryTimer = setTimeout(() => this.connect(), 1000 * this.retryCount);
		};
	}

	send(message) {
		if (this.socket?.readyState == WebSocket.OPEN)
			this.socket.send(JSON.stringify(message));
	}

	async receive(message, ws) {
		if (message.type == "joined") {
			this.retryCount = 0;
			this.expiresAt = message.expiresAt;
			this.role = message.role;
			/* A host keeps its game; a guest retries an incomplete handshake. */
			if (!this.transport || this.role == "guest")
				this.transport = this.onRole(this.role);
			this.report("open", this.role == "host" ?
				"Room open. Share its name or link." : "Connecting to the host…");
		} else if (message.type == "guest" && this.role == "host") {
			this.gathering.add(message.id);
			const signal = await this.transport.createInvitation();
			this.gathering.delete(message.id);
			const offer = await globalThis.LogosFriends.decodeSignal(signal, "offer");
			const record = this.transport.pending.get(offer.connectionId);
			if (this.stopped || this.socket !== ws || this.cancelled.delete(message.id)) {
				if (record) this.transport.drop(record, "closed");
				return;
			}
			this.pending.set(message.id, { connectionId: offer.connectionId, answered: false });
			this.send({ type: "offer", id: message.id, signal });
		} else if (message.type == "offer" && this.role == "guest") {
			const transport = this.transport;
			const signal = await transport.acceptInvitation(message.signal);
			if (!this.stopped && this.socket === ws)
				this.send({ type: "answer", signal });
		} else if (message.type == "answer" && this.role == "host") {
			const pending = this.pending.get(message.id);
			const answer = await globalThis.LogosFriends.decodeSignal(message.signal, "answer");
			if (!pending || answer.connectionId != pending.connectionId)
				throw new Error("The response does not match this guest");
			pending.answered = true;
			await this.transport.acceptAnswer(message.signal);
		} else if (message.type == "departed" && this.role == "host") {
			const pending = this.pending.get(message.id);
			if (!pending && this.gathering.has(message.id)) this.cancelled.add(message.id);
			else if (pending && !pending.answered) {
				const record = this.transport.pending.get(pending.connectionId);
				if (record) this.transport.drop(record, "closed");
			}
			this.pending.delete(message.id);
		} else if (message.type == "extended") {
			this.expiresAt = message.expiresAt;
			this.report("open", this.role == "host" ?
				"Room open. Share its name or link." : "Connecting to the host…");
		} else if (message.type == "expired") {
			/* The server allows already-started handshakes a short grace period. */
			this.report("expired", "Invitation expired");
		} else if (message.type == "ended") {
			if (this.role == "guest")
				this.fail(message.message + ". Try joining again.");
			else this.finish("expired", message.message);
		} else if (message.type == "error") {
			if (message.code == "ROOM_TAKEN" && this.randomName && !this.role) {
				if (++this.nameAttempts >= 16)
					return this.fail("Could not find an unused room name. Try again.");
				/* Claim a fresh name before constructing any game session. */
				this.socket = null;
				ws.close();
				this.name = this.randomName();
				this.connect();
			} else this.fail(message.message);
		}
	}

	extend() {
		if (this.role != "host" || this.stopped ||
		    this.socket?.readyState !== WebSocket.OPEN)
			return false;
		this.report("extending", "Extending invitation…");
		this.send({ type: "extend" });
		return true;
	}

	discard(id) {
		const pending = this.pending.get(id);
		const record = pending && this.transport?.pending.get(pending.connectionId);
		if (record) this.transport.drop(record, "failed");
		this.pending.delete(id);
		this.gathering.delete(id);
		this.cancelled.delete(id);
	}

	connected() {
		if (this.role != "guest" || this.stopped) return;
		this.send({ type: "done" });
		this.finish("connected", "Connected to the host.");
	}

	fail(message) {
		this.finish("error", message);
	}

	finish(state, message) {
		this.stopped = true;
		clearTimeout(this.retryTimer);
		this.socket?.close();
		for (const { connectionId, answered } of this.pending.values()) {
			const record = this.transport?.pending.get(connectionId);
			if (record && !answered) this.transport.drop(record, "closed");
		}
		this.pending.clear();
		this.report(state, message);
	}

	close() {
		if (this.role == "host") this.send({ type: "leave" });
		this.finish("closed", "");
	}
}

Object.assign(globalThis.LogosFriends, {
	RoomSignaling, normalizeRoomName, validRoomName, generateRoomName,
});
})();
