# Coloca o robô na inicialização do Windows deste usuário e já liga agora, sem janela.
$vbs = Join-Path $PSScriptRoot 'robo-oculto.vbs'
$atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'Robo do Sienge.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + $vbs + '"'
$s.WorkingDirectory = $PSScriptRoot
$s.Description = 'Robo do Sienge (Gerar Pagamento do Integra)'
$s.Save()

$classe = 'HKCU:\Software\Classes\mourarobo'
New-Item -Path $classe -Force | Out-Null
Set-ItemProperty -Path $classe -Name '(default)' -Value 'URL:Robo do Sienge'
New-ItemProperty -Path $classe -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$comando = Join-Path $classe 'shell\open\command'
New-Item -Path $comando -Force | Out-Null
$protocolo = Join-Path $PSScriptRoot 'robo-protocolo.vbs'
Set-ItemProperty -Path $comando -Name '(default)' -Value ("wscript.exe `"" + $protocolo + "`" `"%1`"")

$ligado = Get-NetTCPConnection -LocalPort 7788 -State Listen -ErrorAction SilentlyContinue
if (-not $ligado) { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $vbs + '"') }

Write-Host ''
Write-Host 'Robo do Sienge automatico: LIGADO.'
Write-Host 'Ele liga sozinho quando o Windows inicia, sem janela.'
Write-Host 'Para desligar: "Desligar robo.cmd". Para tirar da inicializacao: "Remover automatico.cmd".'
