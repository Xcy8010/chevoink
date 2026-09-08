; A packaged launcher can redirect LOCALAPPDATA into its own package cache.
; Preserve normal/custom installation paths; relocate only this known bad default.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  System::Call 'shlwapi::StrStrIW(w "$INSTDIR", w "\Packages\OpenAI.Codex_") p.r0'
  ${If} $0 != 0
    ReadEnvStr $1 "USERPROFILE"
    ${If} $1 == ""
      Abort "Cannot resolve the Windows user profile. Please select an independent installation directory."
    ${EndIf}
    StrCpy $INSTDIR "$1\AppData\Local\Programs\Chevoink"
  ${EndIf}
  Pop $1
  Pop $0
!macroend
