# Instalado pelo botão Ligar robô do Integra. Baixa o robô, instala o Node se faltar,
# deixa na inicialização do Windows e abre o login do Sienge.
$ErrorActionPreference = 'Stop'
$origem = [string]$env:MOURA_ROBO_ORIGEM
if (-not $origem) { throw 'O Integra não informou o endereço de origem.' }
$origem = $origem.TrimEnd('/')
$dest = Join-Path $env:LOCALAPPDATA 'MouraLeite\robo-sienge'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$arquivos = @(
  'package.json', 'package-lock.json', 'config.js', 'robo.js', 'entrar.js', 'sessao.js',
  'passos-lote.js', 'gravar.js', 'inspecionar.js', 'robo-servico.ps1', 'robo-oculto.vbs',
  'robo-protocolo.vbs', 'instalar-automatico.ps1'
)
Write-Host 'Baixando o robô do Sienge…'
foreach ($nome in $arquivos) {
  $url = $origem + '/robo-pacote/' + $nome
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $dest $nome) -UseBasicParsing
}

function AtualizarPath {
  $maq = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usu = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($maq, $usu) | Where-Object { $_ }) -join ';'
}

AtualizarPath
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Instalando o Node.js…'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'O Node.js não está instalado e o winget não está disponível. Instale o Node.js em https://nodejs.org e rode este arquivo de novo.' }
  & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw 'Não consegui instalar o Node.js. Instale em https://nodejs.org e rode este arquivo de novo.' }
  AtualizarPath
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'O Node.js foi instalado, mas esta janela ainda não o enxerga. Feche a janela, abra de novo o arquivo baixado.'
}

Write-Host 'Preparando o robô…'
Set-Location $dest
& npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { throw 'Não consegui instalar as dependências do robô.' }

& (Join-Path $dest 'instalar-automatico.ps1')
Write-Host 'Abrindo o Sienge para o login neste computador…'
Start-Process -FilePath 'node' -ArgumentList 'entrar.js' -WorkingDirectory $dest
Write-Host ''
Write-Host 'Robô do Sienge instalado e ligado.'
Write-Host 'Faça o login na janela do Sienge. Depois volte ao Integra: o código é pego sozinho.'
