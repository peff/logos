var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	// unicode dice
	["&#x2680;", "&#x2681;", "&#x2682;", "&#x2683;", "&#x2684;", "&#x2685;"],
	// unicode shapes
	["&#x25b3;", "&#x25bd;", "<span class=\"heavy-outline\">&#x25a1;</span>",
	 "&#x25c7;", "&#x2b20;", "<span class=\"circle-symbol\">&#x25cb;</span>"],
	["+", "&#x2012;", "&#x00f7;", "x", "=", "√"]
];

var startMessages = [
	"The ancient puzzle awaits. Let reason be your guide.",
	"The signs are set. The search for truth begins.",
	"The pattern lies hidden. Reveal that which is concealed.",
	"The oracle is silent. Only reason may uncover the truth.",
	"The pieces are before you. Their true order remains veiled.",
	"The mystery is set. Uncover the hidden order.",
	"The veil is drawn. Let the work of deduction begin.",
	"The pattern is broken. Restore the order that lies beneath.",
	"Truth is hidden among the signs. Seek it well.",
];

var falsePlacementMessages = [
	"You have mistaken falsehood for truth. The wisdom of the ancients eludes you...",
	"You have crowned a false answer as truth. The ancients turn away...",
	"You have embraced an illusion as truth. The oracle falls silent...",
	"Your judgment has fixed upon the false. The ancients are unconvinced...",
	"You have chosen the path of error. Wisdom recedes from your grasp...",
	"You have drawn certainty from deceiving signs. The lesson is lost...",
	"Your conclusion does not follow. The philosophers dismiss your proof...",
];

var falseEliminationMessages = [
	"You have cast aside a truth not yet understood. The wisdom of the ancients eludes you...",
	"You have banished a truth from consideration. The ancients turn away...",
	"You have rejected a truth before its hour. The oracle falls silent...",
	"Your judgment has condemned the possible. The ancients are unconvinced...",
	"You have closed a path that led to truth. Wisdom recedes from your grasp...",
	"You have severed a thread that belonged in the pattern. The Fates turn away...",
	"You have excluded what reason still permits. The philosophers dismiss your proof...",
];

var winMessages = [
	"The pattern is revealed. The wisdom of the ancients is yours.",
	"Every sign has found its place. The secrets of the ancients stand revealed.",
	"You have restored the hidden order. The ancients acknowledge your wisdom.",
	"The veil is lifted. What was concealed is now understood.",
	"The final truth falls into place. The oracle speaks your name.",
	"You have mastered the logic of the ancients. The mystery is no more.",
	"The design is complete. Knowledge emerges from the shadows.",
	"All false paths are closed. The one true order remains.",
];

var milestoneMessages = [
	[
		"The first signs align. A hidden order begins to emerge.",
		"The scattered signs begin to speak.",
		"The first seal is broken. The mystery stirs.",
	],
	[
		"The pattern takes shape. The wisdom of the ancients draws near.",
		"Half of the ancient design stands revealed.",
		"Order rises from uncertainty. The path grows clearer.",
	],
	[
		"The veil grows thin. Only the final secrets remain.",
		"The final veil trembles. Truth lies close at hand.",
		"Nearly every sign has found its place. The answer awaits.",
	],
];

var milestoneThresholds = [9, 18, 27];

document.addEventListener('contextmenu', function(ev) {
	ev.preventDefault();
});

function Puzzle(board, hClues, vClues, messages, timer, symbols,
		options, optionsButton, help, helpButton, scores, scoresButton,
		about, logoButton) {
	symbols = symbols || defaultSymbols;

	this.messages = messages;
	this.timer = timer;
	this.options = options;
	this.optionsButton = optionsButton;
	this.help = help;
	this.helpButton = helpButton;
	this.scores = scores;
	this.scoresButton = scoresButton;
	this.about = about;
	this.logoButton = logoButton;
	this.timerInterval = null;
	this.timerStarted = null;
	this.timerElapsed = 0;
	this.messageTimeout = null;
	this.soundSamples = {
		place: new Audio("sound/place.opus"),
		discard: new Audio("sound/discard.opus"),
		clue: new Audio("sound/clue.opus"),
		mistake: new Audio("sound/mistake.opus"),
	};
	this.soundVolumes = {
		place: 1,
		discard: 0.4,
		clue: 1,
		mistake: 1,
	};
	this.soundVariations = {
		place: 0.045,
		discard: 0.1,
		clue: 0.055,
		mistake: 0,
	};
	/* Normalized offsets, scaled by each sound's variation above. */
	this.soundSequence = [0, 0.833, -0.5, 0.333, -1, -0.167, 0.667,
		-0.667, 0.167, 1, -0.333, 0.5, -0.833];
	this.soundSequencePositions = {};
	for (var name in this.soundSamples) {
		this.soundSamples[name].preload = "auto";
		this.soundSamples[name].preservesPitch = false;
	}
	this.gameOver = true;
	this.paused = false;
	this.resumeAfterModal = false;
	this.nextMilestone = 0;
	this.showMilestones = true;
	this.rows = [];
	this.hClueSlots = [];
	this.vClueSlots = [];
	for (var i = 0; i < symbols.length; i++)
		this.rows[i] = new Row(this, symbols[i], board.insertRow(), i);
	for (var i = 0; i < 6; i++) {
		var row = hClues.insertRow();
		for (var j = 0; j < 3; j++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.hClueSlots.push(cell);
		}
	}
	{
		var row = vClues.insertRow();
		for (var i = 0; i < 8; i++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.vClueSlots.push(cell);
		}
	}

	this.clear = function() {
		this.gameOver = true;
		this.nextMilestone = 0;
		this.stopTimer();
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clear();
		this.say("");
	}

	this.newGame = function() {
		this.gameOver = true;
		this.nextMilestone = 0;
		this.stopTimer();
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].newGame();
		this.gameOver = false;
		this.generateClues();
		this.startTimer();
		this.say(randomChoice(startMessages));
	}

	this.checkWin = function() {
		if (this.gameOver)
			return;
		this.checkMilestones();
		for (var i = 0; i < this.rows.length; i++)
			if (!this.rows[i].isComplete())
				return;
		this.gameOver = true;
		this.playSound("win");
		this.stopTimer();
		var highScore = this.recordHighScore(this.timerElapsed);
		this.timer.classList.add("won");
		this.messages.classList.add("won");
		this.say(randomChoice(winMessages));
		if (highScore) {
			this.highlightedScore = highScore;
			this.toggleScores();
		}
	}

	this.checkMilestones = function() {
		var complete = 0;
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				if (this.rows[i].slots[j].single)
					complete++;

		while (this.nextMilestone < milestoneThresholds.length &&
		       complete >= milestoneThresholds[this.nextMilestone]) {
			if (this.showMilestones)
				this.say(randomChoice(
					milestoneMessages[this.nextMilestone]));
			this.nextMilestone++;
		}
	}

	this.lose = function(msg) {
		if (this.gameOver)
			return;
		this.gameOver = true;
		this.playSound("mistake");
		this.stopTimer();
		this.timer.classList.add("lost");
		this.messages.classList.add("lost");
		this.revealSolution();
		this.say(msg);
	}

	this.revealSolution = function() {
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				this.rows[i].slots[j].reveal();
	}

	this.say = function(msg) {
		if (this.messageTimeout !== null) {
			clearTimeout(this.messageTimeout);
			this.messageTimeout = null;
		}
		this.messages.classList.remove("fading");
		this.messages.innerHTML = msg;
		if (msg) {
			this.messages.classList.add("appearing");
			this.messages.offsetWidth;
			this.messages.classList.remove("appearing");
		}
		if (msg && this.timerInterval !== null) {
			var puzzle = this;
			this.messageTimeout = setTimeout(function() {
				puzzle.messages.classList.add("fading");
				puzzle.messageTimeout = setTimeout(function() {
					puzzle.messages.innerHTML = "";
					puzzle.messages.classList.remove("fading");
					puzzle.messageTimeout = null;
				}, 1000);
			}, 9000);
		}
	}

	this.updateTimer = function(elapsed) {
		this.timer.textContent = formatTime(elapsed);
	}

	this.recordHighScore = function(elapsed) {
		var score = { elapsed: elapsed, date: Date.now() };
		this.highScores.push(score);
		this.highScores.sort(function(a, b) {
			return a.elapsed - b.elapsed;
		});
		this.highScores = this.highScores.slice(0, 10);
		try {
			localStorage.setItem("highScores",
				JSON.stringify(this.highScores));
		} catch (e) {
			/* The scores still apply for the current page. */
		}
		return this.highScores.indexOf(score) >= 0 ? score : null;
	}

	this.renderHighScores = function() {
		var list = this.scores.querySelector("ol");
		var empty = this.scores.querySelector(".scores-empty");
		list.innerHTML = "";
		empty.hidden = this.highScores.length != 0;
		for (var i = 0; i < this.highScores.length; i++) {
			var item = document.createElement("li");
			if (this.highScores[i] == this.highlightedScore) {
				item.className = "score-new";
				item.setAttribute("aria-current", "true");
			}
			var entry = document.createElement("span");
			entry.className = "score-entry";
			var date = document.createElement("span");
			date.className = "score-date";
			var modern = document.createElement("span");
			modern.className = "score-modern-date";
			modern.textContent = formatScoreDate(this.highScores[i].date);
			date.appendChild(modern);
			if (this.highScores[i].date !== null) {
				var attic = document.createElement("span");
				attic.className = "score-attic-date";
				attic.textContent = greekNumeralDay(
					this.highScores[i].date) + " " +
					atticMonth(this.highScores[i].date) + " · " +
					formatOlympiad(this.highScores[i].date);
				date.appendChild(attic);
			}
			entry.appendChild(date);
			var time = document.createElement("span");
			time.className = "score-time";
			time.textContent = formatTime(this.highScores[i].elapsed);
			entry.appendChild(time);
			item.appendChild(entry);
			list.appendChild(item);
		}
	}

	this.clearOutcome = function() {
		this.timer.classList.remove("won", "lost");
		this.messages.classList.remove("won", "lost");
	}

	this.startTimer = function() {
		var puzzle = this;
		this.timerStarted = Date.now() - this.timerElapsed;
		this.timerInterval = setInterval(function() {
			puzzle.updateTimer(Date.now() - puzzle.timerStarted);
		}, 250);
	}

	this.stopTimer = function() {
		if (this.timerInterval === null)
			return;
		this.timerElapsed = Date.now() - this.timerStarted;
		this.updateTimer(this.timerElapsed);
		clearInterval(this.timerInterval);
		this.timerInterval = null;
		this.timerStarted = null;
	}

	this.generateClues = function() {
		this.clues = [];
		var types = [ExactClue, OrderClue, Adjacent2Clue,
			     Adjacent3Clue, ColumnClue];
		do {
			while (!this.sufficientClues()) {
				var type = weightedChoice(types);
				var clue = new type(this);
				this.clues.push(clue);
				if (clue.displayType)
					clue.active = true;
			}

			for (var i = this.clues.length - 1; i >= 0; i--) {
				var without = this.clues.slice();
				without.splice(i, 1);
				if (cluesSolve(this, without))
					this.clues = without;
			}

			this.clues = limitDisplayedClues(this.clues,
				"horizontal", this.hClueSlots.length);
			this.clues = limitDisplayedClues(this.clues,
				"vertical", this.vClueSlots.length);
		} while (!this.sufficientClues());

		for (var i = 0; i < this.hClueSlots.length; i++) {
			this.hClueSlots[i].innerHTML = "";
			this.hClueSlots[i].oncontextmenu = null;
		}
		for (var i = 0; i < this.vClueSlots.length; i++) {
			this.vClueSlots[i].innerHTML = "";
			this.vClueSlots[i].oncontextmenu = null;
		}

		this.numHClues = 0;
		this.numVClues = 0;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.applyInitialState) {
				clue.applyInitialState();
				continue;
			} else if (clue.displayType == "horizontal")
				clue.display = this.getHClueSlot();
			else if (clue.displayType == "vertical")
				clue.display = this.getVClueSlot();
			checkClueDisplay(clue);
		}
	}

	this.sufficientClues = function() {
		return cluesSolve(this, this.clues);
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.toggleModal = function(modal, button, closeText) {
		if (modal.hidden) {
			this.resumeAfterModal = !this.gameOver &&
				this.timerInterval !== null;
			var done = modal.querySelector(".modal-done");
			if (done)
				done.value = this.resumeAfterModal ?
					"Resume game" : closeText;
			this.paused = true;
			if (this.resumeAfterModal)
				this.stopTimer();
			modal.hidden = false;
		} else {
			modal.hidden = true;
			this.paused = false;
			if (this.resumeAfterModal && !this.gameOver)
				this.startTimer();
			this.resumeAfterModal = false;
		}
		button.setAttribute("aria-expanded", !modal.hidden);
	}

	this.toggleOptions = function() {
		this.toggleModal(this.options, this.optionsButton, "Close");
	}

	this.toggleHelp = function() {
		this.toggleModal(this.help, this.helpButton);
	}

	this.toggleScores = function() {
		this.renderHighScores();
		this.toggleModal(this.scores, this.scoresButton,
			"Rejoin the mortal realm");
		if (this.scores.hidden)
			this.highlightedScore = null;
	}

	this.toggleAbout = function() {
		this.toggleModal(this.about, this.logoButton, "Close");
	}

	var puzzle = this;
	this.options.addEventListener("click", function(ev) {
		if (ev.target == puzzle.options)
			puzzle.toggleOptions();
	});
	this.help.addEventListener("click", function(ev) {
		if (ev.target == puzzle.help)
			puzzle.toggleHelp();
	});
	this.scores.addEventListener("click", function(ev) {
		if (ev.target == puzzle.scores)
			puzzle.toggleScores();
	});
	this.about.addEventListener("click", function(ev) {
		if (ev.target == puzzle.about)
			puzzle.toggleAbout();
	});

	this.setCursor = function(style) {
		if (["gear", "stylus", "native"].indexOf(style) < 0)
			style = "stylus";
		document.body.dataset.cursor = style;
		var input = this.options.querySelector(
				'input[value="' + style + '"]');
		input.checked = true;
		try {
			localStorage.setItem("cursor", style);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setMilestones = function(show) {
		this.showMilestones = show;
		this.options.querySelector("#show-milestones").checked = show;
		try {
			localStorage.setItem("showMilestones", show);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setTimerVisible = function(show) {
		this.timer.hidden = !show;
		this.options.querySelector("#show-timer").checked = show;
		try {
			localStorage.setItem("showTimer", show);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setSoundEffects = function(enabled) {
		this.soundEffects = enabled;
		this.options.querySelector("#sound-effects").checked = enabled;
		try {
			localStorage.setItem("soundEffects", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.playSampleSound = function(name) {
		var audio = this.soundSamples[name];
		if (!audio)
			return;
		for (var other in this.soundSamples) {
			this.soundSamples[other].pause();
			this.soundSamples[other].currentTime = 0;
		}
		audio.volume = this.soundVolumes[name];
		var variation = this.soundVariations[name];
		var position = this.soundSequencePositions[name] || 0;
		audio.playbackRate = 1 + variation * this.soundSequence[position];
		this.soundSequencePositions[name] =
			(position + 1) % this.soundSequence.length;
		var playback = audio.play();
		if (playback)
			playback.catch(function() {});
	}

	this.playSound = function(type) {
		if (!this.soundEffects)
			return;
		if (this.soundSamples[type]) {
			this.playSampleSound(type);
			return;
		}
		var AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext)
			return;
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		var context = this.audioContext;
		if (context.state == "suspended")
			context.resume();
		var variation = 0.94 + Math.random() * 0.12;
		if (type == "win") {
			var notes = [587.33, 783.99, 659.25, 880,
				     783.99, 1046.5, 880, 1174.66,
				     1046.5, 1318.51, 1174.66, 1567.98];
			var delays = [0, 0.09, 0.17, 0.26, 0.34, 0.43,
				      0.52, 0.62, 0.73, 0.85, 0.98, 1.12];
			for (var i = 0; i < notes.length; i++)
				playChime(context, notes[i] * variation, delays[i],
					i == notes.length - 1 ? 0.035 : 0.025);
		}
	}

	var cursor = "stylus";
	var showMilestones = true;
	var showTimer = true;
	var soundEffects = false;
	try {
		cursor = localStorage.getItem("cursor") || cursor;
		var storedMilestones = localStorage.getItem("showMilestones");
		var storedTimer = localStorage.getItem("showTimer");
		var storedSoundEffects = localStorage.getItem("soundEffects");
		if (storedMilestones !== null)
			showMilestones = storedMilestones == "true";
		if (storedTimer !== null)
			showTimer = storedTimer == "true";
		if (storedSoundEffects !== null)
			soundEffects = storedSoundEffects == "true";
	} catch (e) {
		/* Storage may be unavailable for local files. */
	}
	this.highScores = loadHighScores();
	this.setCursor(cursor);
	this.setMilestones(showMilestones);
	this.setTimerVisible(showTimer);
	this.setSoundEffects(soundEffects);

	this.clear();
}

function formatTime(elapsed) {
	var totalSeconds = Math.floor(elapsed / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;
	return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function formatScoreDate(timestamp) {
	if (timestamp === null)
		return "Earlier";
	var date = new Date(timestamp);
	var month = date.toLocaleDateString(undefined, { month: "long" });
	return date.getDate() + " " + month + " " +
		date.getFullYear() + " CE";
}

function atticMonth(timestamp) {
	/* Decorative correspondence only; the Attic calendar was lunar. */
	var months = [
		"Gamelion", "Anthesterion", "Elaphebolion", "Mounichion",
		"Thargelion", "Skirophorion", "Hekatombaion", "Metageitnion",
		"Boedromion", "Pyanopsion", "Maimakterion", "Poseideon",
	];
	return months[new Date(timestamp).getMonth()];
}

function greekNumeralDay(timestamp) {
	var day = new Date(timestamp).getDate();
	var tens = ["", "ι", "κ", "λ"];
	var units = ["", "α", "β", "γ", "δ", "ε", "ϛ", "ζ", "η", "θ"];
	return tens[Math.floor(day / 10)] + units[day % 10] + "\u0374";
}

function formatOlympiad(timestamp) {
	var date = new Date(timestamp);
	var olympiadYear = date.getFullYear();
	/* Use July 1 as a decorative approximation of the summer boundary. */
	if (date.getMonth() < 6)
		olympiadYear--;
	var yearsSinceFirst = olympiadYear + 775;
	var olympiad = Math.floor(yearsSinceFirst / 4) + 1;
	var year = yearsSinceFirst % 4 + 1;
	return "Olympiad " + olympiad + "." + year;
}

function loadHighScores() {
	var scores = [];
	try {
		scores = JSON.parse(localStorage.getItem("highScores") || "[]");
	} catch (e) {
		return [];
	}
	if (!Array.isArray(scores))
		return [];
	scores = scores.map(function(score) {
		if (Number.isFinite(score) && score >= 0)
			return { elapsed: score, date: null };
		if (!score || !Number.isFinite(score.elapsed) || score.elapsed < 0)
			return null;
		if (!Number.isFinite(score.date) || score.date < 0)
			score.date = null;
		return score;
	}).filter(function(score) { return score !== null; });
	return scores.sort(function(a, b) {
		return a.elapsed - b.elapsed;
	}).slice(0, 10);
}

function playChime(context, frequency, delay, volume) {
	var partials = [1, 2.76, 5.4, 8.93];
	var strengths = [0.7, 1, 0.32, 0.12];
	var durations = [1.5, 1.15, 0.65, 0.38];
	var start = context.currentTime + delay;
	for (var i = 0; i < partials.length; i++) {
		var oscillator = context.createOscillator();
		var gain = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency * partials[i];
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume * strengths[i],
			start + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001,
			start + durations[i]);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + durations[i]);
	}
}

function limitDisplayedClues(clues, displayType, limit) {
	var count = 0;
	return clues.filter(function(clue) {
		if (clue.displayType != displayType)
			return true;
		return count++ < limit;
	});
}

// Generate a random integer in the interval [lo, hi).
function randInt(lo, hi) {
	return lo + Math.floor(Math.random() * (hi - lo));
}

function randomChoice(choices) {
	return choices[randInt(0, choices.length)];
}

function weightedChoice(choices) {
	var total = 0;
	for (var i = 0; i < choices.length; i++)
		total += choices[i].weight;

	var value = Math.random() * total;
	for (var i = 0; i < choices.length; i++) {
		value -= choices[i].weight;
		if (value < 0)
			return choices[i];
	}
}

function shuffle(array) {
	for (var i = array.length - 1; i >= 0; i--) {
		var r = Math.floor(Math.random() * (i+1));
		var tmp = array[i];
		array[i] = array[r];
		array[r] = tmp;
	}
	return array;
}

/* Try to solve the puzzle using only deductions from the given clues. */
function cluesSolve(puzzle, clues) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	var domains = [];

	for (var row = 0; row < numRows; row++) {
		domains[row] = [];
		for (var symbol = 0; symbol < rowSize; symbol++)
			domains[row][symbol] = fullDomain;
	}

	var changed;
	do {
		changed = false;

		/* Each column contains exactly one symbol from each row. */
		for (var row = 0; row < numRows; row++) {
			var singles = 0;
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if (!domain)
					return false;
				if ((domain & (domain - 1)) == 0) {
					if (singles & domain)
						return false;
					singles |= domain;
				}
			}
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if ((domain & (domain - 1)) != 0) {
					var reduced = domain & ~singles;
					if (reduced != domain) {
						domains[row][symbol] = reduced;
						changed = true;
					}
				}
			}

			/* A column which has only one candidate fixes that symbol. */
			for (var col = 0; col < rowSize; col++) {
				var bit = 1 << col;
				var candidate = -1;
				for (var symbol = 0; symbol < rowSize; symbol++) {
					if (domains[row][symbol] & bit) {
						if (candidate >= 0) {
							candidate = -2;
							break;
						}
						candidate = symbol;
					}
				}
				if (candidate == -1)
					return false;
				if (candidate >= 0 && domains[row][candidate] != bit) {
					domains[row][candidate] = bit;
					changed = true;
				}
			}
		}

		for (var i = 0; i < clues.length; i++) {
			if (clues[i].constrain(domains, fullDomain))
				changed = true;
		}
	} while (changed);

	for (var row = 0; row < numRows; row++) {
		for (var symbol = 0; symbol < rowSize; symbol++) {
			var domain = domains[row][symbol];
			if (!domain || (domain & (domain - 1)) != 0)
				return false;
		}
	}
	return true;
}

function clueVariable(domains, row, slot) {
	var rowNum = row.puzzle.rows.indexOf(row);
	return {
		domains: domains[rowNum],
		symbol: slot.value
	};
}

function restrictVariable(variable, allowed) {
	var old = variable.domains[variable.symbol];
	variable.domains[variable.symbol] &= allowed;
	return old != variable.domains[variable.symbol];
}

function Row(puzzle, symbols, display, family) {
	this.puzzle = puzzle;
	this.familyClass = "family-" + family;
	this.slots = [];
	for (var i = 0; i < symbols.length; i++)
		this.slots[i] = new Slot(this, symbols, display.insertCell());

	this.clear = function() {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].displaySingle(i);
	}

	this.newGame = function() {
		var values = [];
		for (var i = 0; i < this.slots.length; i++)
			values.push(i);
		shuffle(values);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].newGame(values[i]);
	}

	this.removePossible = function(value) {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].removePossible(value, true);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].checkSingleton();
		for (var i = 0; i < this.slots.length; i++)
			if (i != value)
				this.checkSingleton(i);
	}

	this.checkSingleton = function(value) {
		var possible = this.slots.filter(
			function(slot) { return slot.isPossible(value) });
		if (possible.length == 1)
			possible[0].choose(value);
	}

	this.isComplete = function() {
		for (var i = 0; i < this.slots.length; i++)
			if (!this.slots[i].single)
				return false;
		return true;
	}
}

function Slot(row, symbols, display) {
	this.row = row;
	this.symbols = symbols;
	this.elem = display;
	this.elem.className = "slot " + row.familyClass;

	this.say = function(msg) { this.row.puzzle.say(msg) };

	this.newGame = function(value) {
		this.value = value;
		this.possible = [];
		for (var i = 0; i < this.symbols.length; i++)
			this.possible.push(true);
		this.displayPossible();
	}

	this.symbol = function() {
		return this.symbols[this.value];
	}

	this.displaySingle = function(i, revealed) {
		var tile = document.createElement("div");
		tile.className = "single" + (revealed ? " revealed" : "");
		tile.innerHTML = this.symbols[i];
		this.elem.innerHTML = '';
		this.elem.appendChild(tile);
		this.single = true;
	}

	this.reveal = function() {
		if (this.single)
			return;
		this.displaySingle(this.value, true);
	}

	this.displayPossible = function() {
		// as close to square as we can
		var table = document.createElement("table");
		var rows = Math.floor(Math.sqrt(this.symbols.length));
		var cols = Math.floor(this.symbols.length / rows);
		for (var i = 0; i < rows; i++) {
			var row = table.insertRow();
			var lo = i * cols;
			var hi = (i+1) * cols;
			if (hi > this.symbols.length)
				hi = this.symbols.length;
			for (var j = lo; j < hi; j++) {
				var cell = this.displayPossible[j] = row.insertCell();
				cell.innerHTML = this.symbols[j];
				cell.className = "possibility";
				cell.addEventListener('click',
					function(s, j) { return function() {
						s.choose(j, true);
					}}(this, j));
				cell.addEventListener('contextmenu',
					function(s, j) { return function(ev) {
						ev.preventDefault();
						s.discard(j, true);
					}}(this, j));
			}
		}

		this.elem.innerHTML = "";
		this.elem.appendChild(table);
		this.single = false;
	}

	this.choose = function(value, playerAction) {
		if (this.row.puzzle.gameOver || this.row.puzzle.paused)
			return;
		if (this.value == value) {
			if (playerAction || this.row.puzzle.placeSoundPending)
				this.row.puzzle.playSound("place");
			this.row.puzzle.placeSoundPending = false;
			this.displaySingle(value);
			this.row.removePossible(value);
			this.row.puzzle.checkWin();
		} else {
			this.row.puzzle.lose(randomChoice(falsePlacementMessages));
		}
	}

	this.discard = function(value, playerAction) {
		if (this.single || this.row.puzzle.gameOver ||
		    this.row.puzzle.paused)
			return;
		if (this.value == value) {
			this.row.puzzle.lose(randomChoice(falseEliminationMessages));
		} else {
			if (playerAction) {
				this.row.puzzle.playSound("discard");
				this.row.puzzle.placeSoundPending = true;
			}
			this.removePossible(value);
			this.row.checkSingleton(value);
			this.row.puzzle.placeSoundPending = false;
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.removePossible = function(value, deferCheck) {
		this.possible[value] = false;
		this.displayPossible[value].innerHTML = "";
		this.displayPossible[value].className =
			"possibility dead-possibility";
		if (!deferCheck)
			this.checkSingleton();
	}

	this.checkSingleton = function() {
		if (this.single)
			return;
		var count = 0;
		var last;
		for (var i = 0; i < this.possible.length; i++) {
			if (this.possible[i]) {
				count++;
				last = i;
			}
		}
		if (count == 1)
			this.choose(last);
	}
}

function checkClueDisplay(clue) {
	if (!clue.rendered) {
		clue.render();
		clue.rendered = true;
	}
	if (clue.active)
		clue.display.classList.remove("clue-hidden");
	else
		clue.display.classList.add("clue-hidden");
}

function renderClue(puzzle, clue, slot, type, elements) {
	slot.innerHTML = "";
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		elem.className = elements[i][0];
		elem.innerHTML = elements[i][1];
		slot.appendChild(elem);
	}
	if (!clue.listener) {
		clue.listener = function(ev) {
			ev.preventDefault();
			if (clue.active)
				puzzle.playSound("clue");
			clue.active = !clue.active;
			checkClueDisplay(clue);
		};
	}
	slot.oncontextmenu = clue.listener;
}

function OrderClue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = randInt(this.lCol + 1, this.rRow.slots.length);
	this.displayType = "horizontal";

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var rightAllowed = 0;
		for (var l = 0; l < this.lRow.slots.length; l++) {
			for (var r = l + 1; r < this.rRow.slots.length; r++) {
				if (leftDomain & (1 << l) && rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					rightAllowed |= 1 << r;
				}
			}
		}
		return restrictVariable(left, leftAllowed) |
			restrictVariable(right, rightAllowed);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["dots", "..."],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
OrderClue.weight = 5;

function Adjacent2Clue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = this.lCol + 1;
	this.displayType = "horizontal";

	if (Math.random() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = (rightDomain << 1) | (rightDomain >> 1);
		var rightAllowed = (leftDomain << 1) | (leftDomain >> 1);
		return restrictVariable(left, leftAllowed & fullDomain) |
			restrictVariable(right, rightAllowed & fullDomain);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["arrow", "&#x2194;"],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
Adjacent2Clue.weight = 5;

function Adjacent3Clue(puzzle) {
	this.mRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.mCol = randInt(1, this.mRow.slots.length - 1);
	this.lCol = this.mCol - 1;
	this.rCol = this.mCol + 1;
	this.displayType = "horizontal";

	if (Math.random() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var middle = clueVariable(domains, this.mRow,
					  this.mRow.slots[this.mCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var middleDomain = middle.domains[middle.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var middleAllowed = 0;
		var rightAllowed = 0;
		for (var m = 1; m < this.mRow.slots.length - 1; m++) {
			for (var direction = -1; direction <= 1; direction += 2) {
				var l = m + direction;
				var r = m - direction;
				if (leftDomain & (1 << l) &&
				    middleDomain & (1 << m) &&
				    rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					middleAllowed |= 1 << m;
					rightAllowed |= 1 << r;
				}
			}
		}
		var changed = restrictVariable(left, leftAllowed);
		changed |= restrictVariable(middle, middleAllowed);
		changed |= restrictVariable(right, rightAllowed);
		return changed;
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["tile " + this.mRow.familyClass,
			     this.mRow.slots[this.mCol].symbol()],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
Adjacent3Clue.weight = 5;

function ColumnClue(puzzle) {
	this.tRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.col = randInt(0, this.tRow.slots.length);
	this.bRow = this.tRow;
	while (this.bRow == this.tRow)
		this.bRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.displayType = "vertical";

	this.constrain = function(domains, fullDomain) {
		var top = clueVariable(domains, this.tRow,
				       this.tRow.slots[this.col]);
		var bottom = clueVariable(domains, this.bRow,
					  this.bRow.slots[this.col]);
		var common = top.domains[top.symbol] &
			bottom.domains[bottom.symbol];
		return restrictVariable(top, common) |
			restrictVariable(bottom, common);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "div", [
			    ["tile " + this.tRow.familyClass,
			     this.tRow.slots[this.col].symbol()],
			    ["tile " + this.bRow.familyClass,
			     this.bRow.slots[this.col].symbol()]
		]);
	}
}
ColumnClue.weight = 5;

function ExactClue(puzzle) {
	this.row = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.slot = this.row.slots[randInt(0, this.row.slots.length)];

	this.constrain = function(domains, fullDomain) {
		var variable = clueVariable(domains, this.row, this.slot);
		var pos = this.row.slots.indexOf(this.slot);
		return restrictVariable(variable, 1 << pos);
	}

	this.applyInitialState = function() {
		this.slot.choose(this.slot.value);
	}
}
ExactClue.weight = 1;
