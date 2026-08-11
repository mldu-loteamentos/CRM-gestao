# _version_bump.ps1
# Helper chamado pelo deploy.bat para incrementar a versao automaticamente no index.html

param(
    [string]$IndexFile = "index.html"
)

$content = [System.IO.File]::ReadAllText($IndexFile, [System.Text.Encoding]::UTF8)

# Lê a versão atual do badge no sidebar
if ($content -match 'v(\d+)\.(\d+)\.(\d+)\s*&nbsp;') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3] + 1
} else {
    Write-Error "ERRO: Padrao de versao 'vX.X.X' nao encontrado no index.html"
    exit 1
}

$newVer    = "$major.$minor.$patch"
$today     = Get-Date -Format "dd/MM/yyyy"
$newBadge  = "v$newVer &nbsp;·&nbsp; $today"

# Substitui o badge antigo pelo novo
$content = $content -replace `
    'v\d+\.\d+\.\d+\s*&nbsp;.+?\d{2}/\d{2}/\d{4}', `
    $newBadge

[System.IO.File]::WriteAllText($IndexFile, $content, [System.Text.Encoding]::UTF8)

# Retorna a versão nova para o deploy.bat capturar
Write-Output $newVer
