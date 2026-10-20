# Mantém o robô ligado em segundo plano, sem janela. Se ele cair, liga de novo em 5 segundos.
# Para desligar de vez: "Desligar robô.cmd" (cria parar.flag e encerra o processo).
Set-Location $PSScriptRoot
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$parar = Join-Path $PSScriptRoot 'parar.flag'
Remove-Item $parar -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
  cmd /c "npm install >> `"$logs\servico.log`" 2>&1"
}

while (-not (Test-Path $parar)) {
  $log = Join-Path $logs ('console-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
  cmd /c "node robo.js >> `"$log`" 2>&1"
  if ($LASTEXITCODE -eq 3) { break }
  if (Test-Path $parar) { break }
  Start-Sleep -Seconds 5
}
Remove-Item $parar -ErrorAction SilentlyContinue
