Multiplayer Prototype
=====================

The current multiplayer prototype supports manual WebRTC signaling. It uses
no signaling server: the players exchange an invitation and answer through
chat, email, or another existing channel. It currently configures no STUN or
TURN servers, so connections are expected to work only on the same machine or
local network.

Serve this directory over HTTP:

    python3 -m http.server 8767

To try WebRTC between two browsers:

1. Choose **Play with friends** in the host and select **Host a game**.
2. Copy the generated invitation to the guest.
3. In the guest, paste the invitation and select **Create answer**.
4. Copy the answer back to the host.
5. In the host, paste the answer and select **Accept answer**.

Once connected, committed moves should appear in both browsers; chalk marks
deliberately remain local. The host can create a separate invitation for each
additional guest.

The older `BroadcastChannel` transport remains available under
**Same-browser test**. It works only between tabs in the same browser and
origin, but is useful for distinguishing game protocol bugs from WebRTC
connection problems.
