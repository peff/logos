Multiplayer Prototype
=====================

The current multiplayer prototype uses `BroadcastChannel`, and therefore
works only between tabs in the same browser and origin. It is intended to
exercise the host-authoritative game protocol before adding WebRTC.

Serve this directory over HTTP:

    python3 -m http.server 8767

Then open `http://localhost:8767/` in two tabs. Choose **Play with friends**
in the first tab, host a game, and copy its room code. In the second tab,
choose **Play with friends** and join with that code. Committed moves should
appear in both tabs; chalk marks deliberately remain local.
