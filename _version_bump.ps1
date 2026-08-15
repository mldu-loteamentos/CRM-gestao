param([string]$IndexFile = "index.html")

# Usa a mesma tecnica: ler como Latin1 e escrever como UTF8 sem BOM
# para garantir que os caracteres especiais sejam preservados corretamente.
$utf8NoBom  = New-Object System.Text.UTF8Encoding $false

# Le o arquivo UTF-8 atual (ja corrigido)
$content = [System.IO.File]::ReadAllText($IndexFile, $utf8NoBom)

# Le a versao atual do badge
if ($content -match 'v(\d+)\.(\d+)\.(\d+)\s*&nbsp;') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3] + 1
} else {
    Write-Error "ERRO: Padrao de versao 'vX.X.X' nao encontrado no index.html"
    exit 1
}

$newVer   = "$major.$minor.$patch"
$today    = Get-Date -Format "dd/MM/yyyy"
$newBadge = "v$newVer &nbsp;&middot;&nbsp; $today"

# Substitui o badge de versao
$content = $content -replace 'v\d+\.\d+\.\d+\s*&nbsp;.+?\d{2}/\d{2}/\d{4}', $newBadge

# Atualiza os cache-busters dos scripts (?v=NNN)
$content = $content -replace '\?v=\d+', "?v=$patch"

# Salva de volta como UTF-8 sem BOM - NUNCA como Latin1
[System.IO.File]::WriteAllText($IndexFile, $content, $utf8NoBom)

Write-Output $newVer
