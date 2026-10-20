' O Integra chama mourarobo://ligar ou mourarobo://preparar/email
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta

bruto = ""
arg = ""
If WScript.Arguments.Count > 0 Then
  bruto = WScript.Arguments(0)
  arg = LCase(bruto)
End If

If InStr(arg, "ligar") > 0 Or InStr(arg, "preparar") > 0 Then
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\robo-servico.ps1""", 0, False
End If

If InStr(arg, "entrar") > 0 Or InStr(arg, "preparar") > 0 Then
  email = ExtrairEmail(bruto)
  If email <> "" Then
    sh.Run "cmd /c node entrar.js """ & email & """", 1, False
  Else
    sh.Run "cmd /c node entrar.js", 1, False
  End If
End If

Function ExtrairEmail(texto)
  Dim baixo, marcas, i, p, email, q
  baixo = LCase(texto)
  marcas = Array("preparar/", "entrar/")
  For i = 0 To UBound(marcas)
    p = InStr(1, baixo, marcas(i), 1)
    If p > 0 Then
      email = Mid(texto, p + Len(marcas(i)))
      q = InStr(email, "?")
      If q > 0 Then email = Left(email, q - 1)
      email = Replace(email, "%40", "@")
      email = Replace(email, "/", "")
      ExtrairEmail = email
      Exit Function
    End If
  Next
  ExtrairEmail = ""
End Function
