param([string]$CommitHash = "6703578")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$latin1 = [System.Text.Encoding]::GetEncoding(1252)

# Extrai o conteudo do commit como bytes
$tempFile = [System.IO.Path]::GetTempFileName()

# Usa git show para extrair o arquivo e salvar em um temp
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = "git"
$proc.StartInfo.Arguments = "show ${CommitHash}:index.html"
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.CreateNoWindow = $true
$proc.StartInfo.StandardOutputEncoding = $latin1
$proc.Start() | Out-Null
$content = $proc.StandardOutput.ReadToEnd()
$proc.WaitForExit()

# Salva como UTF-8 sem BOM
[System.IO.File]::WriteAllText("index.html", $content, $utf8NoBom)
Write-Host "Feito! index.html restaurado do commit $CommitHash como UTF-8"
