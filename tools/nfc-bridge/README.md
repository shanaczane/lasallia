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

## Running it automatically (recommended for the real kiosk)

Running `python acr122u_bridge.py` by hand every time isn't practical
for a kiosk that's on all day. Set it to start automatically instead:

1. Press `Win + R`, type `shell:startup`, press Enter — this opens your
   Startup folder.
2. Right-click `start_hidden.vbs` in this folder → **Create shortcut**.
3. Drag that shortcut into the Startup folder window you opened in
   step 1.

From then on, the bridge starts automatically (with no visible window)
every time the kiosk computer logs in — nobody needs to open a
terminal. To check it's actually running, or to debug a problem, open
`bridge.log` in this folder — it records the same messages that used
to print to the terminal (reader found, each tap, any errors), since a
hidden launch has no console to print to.

To stop it, open Task Manager, find the `python.exe` (or `pythonw.exe`)
process, and end it — or just remove the shortcut from the Startup
folder and restart the computer.

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
