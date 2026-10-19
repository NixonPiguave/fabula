; The installer language initializes new app profiles only. Existing preferences win.
!include "FileFunc.nsh"

!macro customInit
  ; A silent install has no language dialog. Allow an explicit choice for deployment.
  ${If} ${Silent}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/APP_LANGUAGE=" $R1
    ${IfNot} ${Errors}
      ${If} $R1 == "en"
        StrCpy $LANGUAGE 1033
      ${ElseIf} $R1 == "es"
        StrCpy $LANGUAGE 1034
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; ASCII JSON is valid UTF-8 and independent of the installer's code page.
  ; Never write to the user's library or preferences from the installer.
  CreateDirectory "$INSTDIR\resources"
  FileOpen $R0 "$INSTDIR\resources\default-language.json" w
  ${If} $LANGUAGE == 1033
    FileWrite $R0 '{$\"language$\":$\"en$\"}'
  ${Else}
    FileWrite $R0 '{$\"language$\":$\"es$\"}'
  ${EndIf}
  FileClose $R0
!macroend
