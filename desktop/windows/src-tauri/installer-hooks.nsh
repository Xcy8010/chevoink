; A packaged launcher can redirect LOCALAPPDATA into its own package cache.
; Preserve normal/custom installation paths; relocate only this known bad default.
!define CHEVOINK_ICON_SOURCE "${__FILEDIR__}\icons\icon.ico"
Var ChevoinkInstalled

; Existing shortcuts may cache the old executable icon by its unchanged path.
; Use an installed, content-versioned icon, never a build/tool-cache path.
Function RefreshChevoinkShortcuts
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\chevoink-logo-212aa389.ico" 0
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$DESKTOP\${PRODUCTNAME}.lnk", p 0)'
  ${EndIf}
  !if "${STARTMENUFOLDER}" != ""
    StrCpy $1 "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    StrCpy $1 "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
  !insertmacro IsShortcutTarget "$1" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    CreateShortcut "$1" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\chevoink-logo-212aa389.ico" 0
    !insertmacro SetLnkAppUserModelId "$1"
    System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$1", p 0)'
  ${EndIf}
FunctionEnd

Function .onGUIEnd
  ${If} $ChevoinkInstalled = 1
    Call RefreshChevoinkShortcuts
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  File /oname=chevoink-logo-212aa389.ico "${CHEVOINK_ICON_SOURCE}"
  StrCpy $ChevoinkInstalled 1
  Call RefreshChevoinkShortcuts
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\chevoink-logo-212aa389.ico"
!macroend

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
