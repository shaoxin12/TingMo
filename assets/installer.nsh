; Combined NSIS custom macros for TingMo installer

!macro customInit
  ; Back up user data before uninstall (old version's uninstaller may wipe it)
  IfFileExists "$APPDATA\TingMo\*.*" 0 +3
    CreateDirectory "$APPDATA\TingMo_backup"
    CopyFiles /SILENT "$APPDATA\TingMo\*.*" "$APPDATA\TingMo_backup"
!macroend

!macro customInstall
  ; Restore backed-up user data after install
  IfFileExists "$APPDATA\TingMo_backup\*.*" 0 +3
    CreateDirectory "$APPDATA\TingMo"
    CopyFiles /SILENT "$APPDATA\TingMo_backup\*.*" "$APPDATA\TingMo"
    RMDir /r "$APPDATA\TingMo_backup"
!macroend

!macro customUnInstall
  ; User data is intentionally preserved during uninstall.
  ; Settings, API keys, stats, history, and models live in %APPDATA%/TingMo
  ; and survive both uninstall and update. Users who want a clean wipe can
  ; delete the folder manually.
!macroend
