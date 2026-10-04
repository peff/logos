Multiplayer Prototype
=====================

The current multiplayer prototype supports manual WebRTC signaling. It uses
no signaling server: the players exchange an invitation and answer through
chat, email, or another existing channel. It uses Cloudflare's public STUN
server to discover routes through typical NATs, but does not configure a TURN
relay. Some restrictive networks may therefore still prevent a connection.

Serve the repository root over HTTP:

    python3 -m http.server 8767

To try WebRTC between two browsers:

1. Choose **LOGOS with Friends** in Options on the host and select **Host a game**.
2. Copy the generated invitation to the guest.
3. In the guest, paste the invitation and select **RSVP**.
4. Copy the answer back to the host.
5. In the host, paste the answer and select **Accept response**.

Hosting during a game shares the current puzzle, progress, and elapsed time.
Earlier solo moves do not appear in the player action logs. Otherwise, hosting
opens a lobby so players can connect before starting. Anyone can press
**New Game** to start or replace the shared puzzle, using their own difficulty
preferences, or choose a particular seed in Options. Guests who join a game
already in progress receive its current state.

Once connected, committed moves and manual clue dismissal/restoration appear
for every player, including guests who join later. Chalk marks and automatic
clue dismissal preferences remain local. The host can create a separate
invitation for each additional guest.

The host’s practice mode and continue-after-loss preferences apply to the
shared game. With continuation enabled, a mistake switches everyone to
practice mode; starting a new shared game restores the host’s original rules.

The host maintains the shared clock, and any player can explicitly pause or
resume the game for everyone. Menus and tab visibility remain local for all
players and do not pause the game. While the clock runs, the host broadcasts
its time every ten seconds as well as with moves and pause/resume changes.

Connected players remain visible below the game controls, replacing the logo.
The host and guests see the same roster, including interrupted connections.
Click **LOGOS with Friends** above the roster to reopen the invitation and
leave controls.
