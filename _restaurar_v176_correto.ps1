# _restaurar_v176_correto.ps1
# Restaura o index.html do commit v176 correto (d130609)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = "git"
$proc.StartInfo.Arguments = "show d130609:index.html"
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.CreateNoWindow = $true
$proc.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$proc.Start() | Out-Null
$content = $proc.StandardOutput.ReadToEnd()
$proc.WaitForExit()

if ($content.Length -gt 0) {
    [System.IO.File]::WriteAllText("index.html", $content, $utf8NoBom)
    Write-Host "OK: index.html restaurado da v176 correta ($([math]::Round($content.Length/1024,1)) KB)"
} else {
    Write-Error "ERRO: conteudo vazio"
}
