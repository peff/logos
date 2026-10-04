/* Opt-in development signaling. Game traffic still uses normal WebRTC. */
(function() {
const params = new URLSearchParams(location.search);
const role = params.get("local-role") == "guest" ? "guest" : "host";
const room = params.get("local-test");
const id = params.get("local-id") || crypto.randomUUID();
const fileMode = location.protocol == "file:";
const targets = new Map();
let channel;

async function start() {
	const controls = document.createElement("div");
	controls.id = "local-test-controls";
	controls.style.cssText = "font: 12px system-ui; padding: 4px; text-align: center";
	const status = document.createElement("span");
	controls.append(status);
	document.querySelector("#application-footer").append(controls);
	function report(message) {
		status.textContent = "Local test · " + role + " · " + message;
	}
	try {
		if (role == "host") {
			const button = document.createElement("button");
			button.id = "local-test-add-guest";
			button.type = "button";
			button.textContent = "Open guest tab";
			button.style.marginLeft = "8px";
			button.onclick = () => {
				const guestId = crypto.randomUUID();
				const url = new URL(location.href);
				url.searchParams.set("local-role", "guest");
				url.searchParams.set("local-id", guestId);
				url.searchParams.delete("local-name");
				/* Retain the opener to signal between file: windows. */
				const guest = window.open(url, "_blank");
				if (guest) targets.set(guestId, guest);
				else report("Allow popups to open a guest tab");
			};
			controls.append(button);
		}
		if (fileMode && role == "guest" && !window.opener)
			throw new Error("Open a guest using the host's Open guest tab button");
		if (!fileMode) channel = new BroadcastChannel("logos-local-test:" + room);
		const send = message => {
			message = { ...message, from: id, room, protocol: "logos-local-test" };
			if (channel) channel.postMessage(message);
			else if (role == "guest") window.opener.postMessage(message, "*");
			else targets.get(message.to)?.postMessage(message, "*");
		};
		async function waitFor(get, description) {
			const deadline = Date.now() + 30000;
			while (Date.now() < deadline) {
				const value = get();
				if (value) return value;
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			throw new Error("Timed out waiting for " + description);
		}
		const click = selector => document.querySelector(selector).click();
		document.querySelector("#friends-player-name").value = params.get("local-name") ||
			(role == "host" ? "Host" : "Guest " + id.slice(0, 4));
		const pending = new Set();
		let queue = Promise.resolve();
		let joining = false;
		click("#friends-button");
		if (role == "host") {
			click("#friends-host");
			click("#friends-menu .modal-close");
		}

		async function receive(message) {
			if (!message || message.protocol != "logos-local-test" || message.room != room ||
			    message.from == id || message.to && message.to != id)
				return;
			if (role == "host" && message.type == "join" && !pending.has(message.from)) {
				pending.add(message.from);
				queue = queue.then(async () => {
					click("#friends-add-guest");
					const inputs = document.querySelectorAll(".friends-player-invitation input");
					const input = inputs[inputs.length - 1];
					const offer = await waitFor(() => input.value, "invitation");
					send({ type: "offer", to: message.from, offer });
				}).catch(error => report(error.message));
			} else if (role == "host" && message.type == "answer" && pending.has(message.from)) {
				pending.delete(message.from);
				document.querySelector("#friends-answer-input").value = message.answer;
				click("#friends-accept-answer");
			} else if (role == "guest" && message.type == "host" && !joining) {
				send({ type: "join", to: message.from });
			} else if (role == "guest" && message.type == "offer" && !joining) {
				joining = true;
				document.querySelector("#friends-invitation-input").value = message.offer;
				click("#friends-join");
				const answer = await waitFor(() =>
					document.querySelector("#friends-answer-output").value, "answer");
				send({ type: "answer", to: message.from, answer });
				await waitFor(() => window.puzzle.actionController?.ready, "connection");
				report("Connected");
			}
		}
		if (channel) channel.onmessage = event => receive(event.data).catch(error => report(error.message));
		else window.addEventListener("message", event => {
			const expected = role == "guest" ? window.opener : targets.get(event.data?.from);
			if (expected && event.source == expected)
				receive(event.data).catch(error => report(error.message));
		});
		send({ type: role == "host" ? "host" : "join" });
		report(role == "host" ? "Ready for guest tabs" : "Waiting for a host tab");
	} catch (error) {
		report(error.message);
	}
}
if (document.readyState == "complete") start();
else window.addEventListener("load", start, { once: true });
window.addEventListener("pagehide", () => channel?.close());
})();
