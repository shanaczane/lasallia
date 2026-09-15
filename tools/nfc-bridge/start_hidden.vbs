' tools/nfc-bridge/start_hidden.vbs
' Launches acr122u_bridge.py with no visible console window — this is
' what a shortcut in the Windows Startup folder should point to, so the
' bridge runs quietly in the background from the moment the kiosk
' computer logs in, with nobody needing to open a terminal. Output goes
' to bridge.log (see acr122u_bridge.py) since there's no console to
' print to here.

Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run "python acr122u_bridge.py", 0, False
