# tools/nfc-bridge/acr122u_bridge.py
# Standalone background helper for the ACR122U NFC reader. The kiosk web
# app (apps/web/components/kiosk/RfidListener.tsx) was built assuming a
# "keyboard wedge" reader that types a card's UID + Enter by itself — the
# cheap RFID readers the project was originally tested with do exactly
# that, with no driver or setup. The ACR122U is a different class of
# device (a PC/SC smart-card reader): it doesn't type anything on its
# own, it only answers structured commands over the PC/SC API. This
# script is the bridge — it watches the reader, reads each tapped card's
# UID the PC/SC way, and then types that UID + Enter into whatever
# window has focus, so the kiosk page (and everything downstream of
# RfidListener) sees the exact same input it always expected. No changes
# needed anywhere else in the app.
#
# Uses pyscard's CardMonitor/CardObserver — a real insertion/removal
# event feed built on the OS's own PC/SC status-change API, not a
# hand-rolled poll loop. First version of this script polled the same
# connection in a loop to guess whether the card had been lifted yet,
# which doesn't reliably detect removal and re-fired the same tap
# several times while the card just sat on the reader. CardMonitor
# fires exactly once per physical tap by construction, so that class of
# bug isn't possible here.
#
# Setup:
#   pip install -r requirements.txt
#   (Windows also needs the ACS driver installed — download from
#   acs.com.hk for the ACR122U if Windows doesn't recognize it as a
#   PC/SC reader on its own.)
#
# Usage:
#   Plug in the reader, open the kiosk page in the browser, then run:
#     python acr122u_bridge.py
#   Leave it running in the background. Tap a card — it should type the
#   UID into whatever has focus (the kiosk page's hidden input, if the
#   browser window is active) and press Enter, exactly like the
#   borrowed reader did.
#
# UID format: matches what was observed from real taps earlier in this
# project (e.g. "8622bfc6") — lowercase hex, no separators. The GET DATA
# APDU below (FF CA 00 00 00) is the ACR122U's standard "read the
# card's UID" command; works for MIFARE Classic/Ultralight and most
# ISO14443A cards, which is what DLSL-style ID cards use.

import sys
import time

try:
    from smartcard.System import readers
    from smartcard.CardMonitoring import CardMonitor, CardObserver
    from smartcard.util import toHexString
except ImportError:
    print("Missing dependency: pyscard. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import keyboard
except ImportError:
    print("Missing dependency: keyboard. Run: pip install -r requirements.txt")
    sys.exit(1)

GET_UID_APDU = [0xFF, 0xCA, 0x00, 0x00, 0x00]
SUCCESS_SW = (0x90, 0x00)


class TapObserver(CardObserver):
    """CardMonitor calls update() once per actual state change (a card
    freshly inserted, or one freshly removed) — never repeatedly for a
    card that's just sitting there, which is what made the old
    poll-and-guess version misfire."""

    def update(self, observable, actions):
        added_cards, _removed_cards = actions
        for card in added_cards:
            self._handle_tap(card)

    def _handle_tap(self, card) -> None:
        try:
            connection = card.createConnection()
            connection.connect()
            data, sw1, sw2 = connection.transmit(GET_UID_APDU)
        except Exception as e:
            print(f"Couldn't read that card ({e}) — try tapping again.")
            return

        if (sw1, sw2) != SUCCESS_SW:
            print("Card detected but couldn't read a UID — try tapping again.")
            return

        uid = toHexString(data).replace(" ", "").lower()
        print(f"Tapped: {uid}")
        # A brief pause before typing — gives the browser a moment if
        # the tap coincided with a click/focus change.
        time.sleep(0.1)
        keyboard.write(uid)
        keyboard.send("enter")


def main() -> None:
    available = readers()
    if not available:
        print(
            "No PC/SC reader found. Check that the ACR122U is plugged in and its "
            "driver is installed (acs.com.hk), then run this again."
        )
        sys.exit(1)
    for r in available:
        print(f"Using reader: {r}")

    monitor = CardMonitor()
    observer = TapObserver()
    monitor.addObserver(observer)

    print("Watching for taps... (Ctrl+C to stop)")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        monitor.deleteObserver(observer)
        print("\nStopped.")


if __name__ == "__main__":
    main()
