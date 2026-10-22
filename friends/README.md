Multiplayer Prototype
=====================

Players meet in named rooms through the optional Cloudflare Worker. Everyone
uses the same **Join room** operation; the first arrival becomes the host and
later arrivals connect to that host over WebRTC. The Worker exchanges connection
messages only. Game traffic goes directly between browsers.

1. Choose **LOGOS with Friends** in Options.
2. Enter a room name and select **Join room**, or select **Random room**
   to claim a generated name. If it is taken, creation retries another name
   without joining the existing game (up to 16 attempts).
3. Share the room name or **Copy invitation link**. Friends can enter the same
   name or follow the link to join automatically. First-time players enter their
   name and select **Join room**. Names can be changed later in the Friends dialog.

Names are case-insensitive; spaces become hyphens. Links contain only the room
name, so an old link may lead to a new gathering if that name has been reused.
Knowing a room name permits joining it; rooms are not password-protected.

Invitations last 15 minutes. The host's signaling connection then closes, with
up to 30 seconds for handshakes already underway to finish. Established games
continue independently. When the invitation expires, **Reopen invitation**
appears to open another invitation for the same game; if someone else has claimed the name, choose another. A brief host
signaling interruption can reconnect, but guests are never promoted within an
existing room. Ending multiplayer closes invitations immediately.

If an established guest connection fails or times out, the host renews or
reopens the invitation for another 15 minutes. Intentional departures do not
extend it. Disconnected guests can select **Rejoin room** to reconnect and
receive the host's current puzzle, or **End multiplayer** to continue solo.
Rejoining never creates a new room. If another gathering has claimed an expired
name, the host must choose a new name and share its invitation.

The first arrival shares their current puzzle if they are already playing.
Otherwise, the room begins in the lobby.

The signaling endpoint is configured by the `logos-rooms-endpoint` meta tag in
`index.html`. See [the server instructions](../server/README.md) for deployment
and local development. For local room testing, run the Worker with
`wrangler dev`, serve the repository over HTTP, and open
`tests/logos-rooms-test.html` for signaling checks or
`tests/logos-friends-test.html` for roster and gameplay checks. Both tests point
their clients at the local Worker on port 8787.

WebRTC uses Cloudflare's public STUN server, but no TURN relay is configured.
Some restrictive networks may therefore still prevent a connection.

Hosting during a game shares the current puzzle, progress, and elapsed time.
Earlier solo moves do not appear in the player action logs. Otherwise, hosting
opens a lobby so players can connect before starting. Anyone can press
**New Game** to start or replace the shared puzzle, using their own difficulty
preferences, or choose a particular seed in Options. Guests who join a game
already in progress receive its current state.

Once connected, committed moves and manual clue dismissal/restoration appear
for every player, including guests who join later. Chalk marks and automatic
clue dismissal preferences remain local. The same room link accepts additional guests while the invitation is open.

Suppose explores a private branch, including nested suppositions. Shared
moves update every saved step of that branch. When a shared move introduces
a conflict, the conflicting tiles get the gold outline and glow used for proof
steps. Further tentative moves are blocked, and **Rewind to conflict** replaces
**Apply moves** and **Reject**.
It steps backward every 300 ms, discarding each step until it reaches the last
consistent position and leaving nested branches if necessary. Pausing or
manually navigating history stops the animation; click Rewind again to
continue. The title marks conflicting positions;
the step that introduces a conflict explains it, while later steps retain
their original descriptions. Later shared moves can reveal additional
conflicting tiles, including within an already conflicting row. Each update
that reveals new conflicts plays the gentle Zen mistake sound when sound
effects are enabled. Shared placements remain visible; discarded tiles involved in a conflict appear as faded markers
and cannot be played. Shared moves continue updating the committed board even
after a conflict, so backing out always returns to the current shared position.
**Apply moves** sends the explored moves to the host as a batch. On acceptance,
the player leaves Suppose to watch the shared board. The host replays the moves
with a 300 ms delay between them, skips moves already resolved on the shared
board, and stops at the first mistake (also in Zen mode). Shared board edits
are blocked during replay, but pointing and private exploration remain
available. The pause button suspends replay for everyone; local dialogs do not.
Late joiners receive the current board and follow the remaining moves.
**Reject** shares only the inverse of the initial assumption.
Players in the same supposition share hover highlights with each other. These
stay within the branch, while highlights from the shared board remain visible
to everyone. The multiplayer log marks entry into and
exit from Suppose with a fork and a slashed fork. Nested branches stay private;
an accepted Apply logs the exit before its replayed moves.

Other players continue on their own boards. While application is pending, the
branch stays visible and its controls are locked until the host acknowledges
it. Rejection unlocks the branch for retry; shared pauses and the host viewing
a proof can prevent application. Resyncing the same game preserves branches
and recovers missed acknowledgments. A new game or ending multiplayer closes
private branches.

From the shared board, click a player's active fork tile to watch their
supposition. Watchers also get a fork tile; clicking either participant's fork
joins the same branch. Historical forks are not join links. You must leave
your own supposition before watching another one.

Watching follows the controller's current step, nested branches, clue
dismissals, shared conflicts, and rewinds. This first version is read-only:
only the controller can change the branch, navigate its history, or Apply or
Reject it. Watchers can stop watching independently. If the controller leaves
or disconnects, everyone returns to the shared board; an accepted Apply
returns everyone before the shared replay starts. A rejected Apply keeps the
branch open. Resync preserves participation.

The watched panel is titled with the controller's name. An SVG eye and count
show how many people are watching; hover or press and hold for their names.
Keyboard users can hold Space or Enter while the eye button is focused.
Branch identity and participation are separate from control permission, so
future versions can allow participants to edit the same branch as equals.

The host’s practice mode and continue-after-loss preferences apply to the
shared game. With continuation enabled, a mistake switches everyone to
practice mode; starting a new shared game restores the host’s original rules.

The host maintains the shared clock, and any player can explicitly pause or
resume the game for everyone. Menus and tab visibility remain local for all
players and do not pause the game. While the clock runs, the host broadcasts
its time every ten seconds as well as with moves and pause/resume changes.

Connected players remain visible above the game controls, replacing the logo.
The host and guests see the same roster, including interrupted connections.
Click **LOGOS with Friends** above the roster to reopen the invitation and
leave controls.

With a mouse, hovering over a slot, possibility, or clue points it out to
other players using your roster color. Hover targets are relayed through the
host over WebRTC, independently of moves and history. Leaving the board and clue areas,
opening a dialog, or switching away clears the highlight; touch input does
not share a hover target.
