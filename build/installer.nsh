; Lets phones on the same Wi-Fi reach the game's local server (private networks only).
; Needs admin; if the install is per-user this fails silently and Windows asks on first run instead.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dedos Ligeiros"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Dedos Ligeiros" dir=in action=allow program="$INSTDIR\Dedos Ligeiros.exe" enable=yes profile=private,domain'
!macroend
!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dedos Ligeiros"'
!macroend
