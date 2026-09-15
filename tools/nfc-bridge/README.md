# NFC bridge for the ACR122U reader

The kiosk expects a card reader that types a card's ID number by itself
(like the reader borrowed from school did). The ACR122U doesn't do that
— it needs this small program running in the background to read the
card and type the number for it. Once this is running, tapping a card
works exactly the same as it did with the borrowed reader.

## One-time setup

1. Install the ACS driver for the ACR122U if Windows doesn't already
   recognize it — download from [acs.com.hk](https://www.acs.com.hk).
2. Install Python if you don't have it already.
3. In this folder, run:
   ```
   pip install -r requirements.txt
   ```

## Every time you want to use the kiosk

1. Plug in the ACR122U.
2. Open the kiosk page in the browser (`localhost:3000/kiosk` for
   testing, or wherever it's deployed).
3. In this folder, run:
   ```
   python acr122u_bridge.py
   ```
4. Leave that window open in the background. Tap a card — it should
   log in on the kiosk page automatically, the same as before.

## If it's not working

- **"No PC/SC reader found"** — the driver isn't installed, or the
  reader isn't plugged in. Reinstall the ACS driver and try again.
- **Tapping does nothing** — make sure the browser window with the
  kiosk page is the active window on screen when you tap (click on it
  first). The program types into whatever window currently has focus.
- **A different number types out than expected** — that's fine, it's
  reading the real chip ID off the card. It'll be consistent for the
  same physical card every time, which is what matters for enrollment
  (see `apps/api/scripts/import_rfid_enrollment.py`).
