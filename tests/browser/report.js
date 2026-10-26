/* Loaded only by the runner's HTTP server, before the harness scripts. */
(() => {
	const suite = location.pathname.split("/").pop().replace(/\.html$/, "");
	const output = document.querySelector("#results, #result");
	let sequence = 0, finished = false;
	function report(ok, details) {
		if (finished) return;
		finished = ok !== null;
		return fetch("/__result/" + suite, {
			method: "POST",
			body: JSON.stringify({ sequence: ++sequence, ok, details }),
		}).catch(() => {});
	}
	const changes = new MutationObserver(() => report(null, output.textContent));
	changes.observe(output, { childList: true, subtree: true, characterData: true });
	addEventListener("error", event => report(false, "FAIL: " + event.message));
	addEventListener("unhandledrejection", event =>
		report(false, "FAIL: " + (event.reason?.stack || event.reason)));
	addEventListener("load", async () => {
		try {
			if (!window.browserTestsDone) throw Error("Missing browserTestsDone promise");
			const ok = await window.browserTestsDone;
			changes.disconnect();
			await report(ok === true, output.textContent);
		} catch (error) { await report(false, "FAIL: " + (error.stack || error)); }
	});
})();
