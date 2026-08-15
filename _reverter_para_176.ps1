# _reverter_para_176.ps1
# Reverte o numero de versao de 177 para 176 no index.html
# para que o deploy.bat faca o bump correto para 177.

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$content = [System.IO.File]::ReadAllText("index.html", $utf8NoBom)

# Reverte badge de versao
$today = Get-Date -Format "dd/MM/yyyy"
$content = $content -replace 'v1\.0\.177\s*&nbsp;.+?\d{2}/\d{2}/\d{4}', "v1.0.176 &nbsp;&middot;&nbsp; 14/08/2026"

# Reverte cache busters
$content = $content -replace '\?v=177', "?v=176"

[System.IO.File]::WriteAllText("index.html", $content, $utf8NoBom)
Write-Host "OK: versao revertida para v1.0.176 (deploy.bat vai bumpar para 177)"
