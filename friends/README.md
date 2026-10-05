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
