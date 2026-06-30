!macro customUnInstall
  ; User data (settings, API keys, stats, history, models) lives in
  ; %APPDATA%/TingMo and is intentionally NOT deleted during uninstall.
  ; This preserves user preferences across updates and allows reinstall
  ; without data loss. Users who want a clean wipe can delete the folder manually.
!macroend
