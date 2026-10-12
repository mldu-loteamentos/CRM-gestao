# _restaurar_v195.ps1
# Restaura todos os arquivos da v195 (a5b7530) com encoding UTF-8 correto
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File "_restaurar_v195.ps1"

$commitHash = "a5b7530"
$utf8NoBom  = New-Object System.Text.UTF8Encoding $false
$latin1     = [System.Text.Encoding]::GetEncoding(1252)

function Restore-FileFromCommit {
    param(
        [string]$CommitHash,
        [string]$FilePath,
        [string]$OutputPath
    )

    Write-Host "  Restaurando: $FilePath ..."

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo.FileName = "git"
    $proc.StartInfo.Arguments = "show ${CommitHash}:${FilePath}"
    $proc.StartInfo.RedirectStandardOutput = $true
    $proc.StartInfo.UseShellExecute = $false
    $proc.StartInfo.CreateNoWindow = $true
    $proc.StartInfo.StandardOutputEncoding = $latin1
    $proc.Start() | Out-Null
    $content = $proc.StandardOutput.ReadToEnd()
    $proc.WaitForExit()

    if ($proc.ExitCode -ne 0 -or $content.Length -eq 0) {
        Write-Warning "  AVISO: nao foi possivel restaurar $FilePath (arquivo pode nao existir no commit)"
        return
    }

    # Garante que o diretorio existe
    $dir = Split-Path $OutputPath -Parent
    if ($dir -and !(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    [System.IO.File]::WriteAllText($OutputPath, $content, $utf8NoBom)
    $kb = [math]::Round($content.Length / 1024, 1)
    Write-Host "  OK ($kb KB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  RESTAURACAO v195 COM ENCODING CORRETO" -ForegroundColor Cyan
Write-Host "  Commit: $commitHash" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path $MyInvocation.MyCommand.Path -Parent

# Lista de arquivos a restaurar do commit v195
$files = @(
    @{ Src = "index.html";                    Dst = "index.html" },
    @{ Src = "verificar-construcao.js";       Dst = "verificar-construcao.js" },
    @{ Src = "construcao.js";                 Dst = "construcao.js" },
    @{ Src = "dashboard-inadimplencia.js";    Dst = "dashboard-inadimplencia.js" },
    @{ Src = "sienge-api.js";                 Dst = "sienge-api.js" },
    @{ Src = "app.js";                        Dst = "app.js" },
    @{ Src = "api/sienge-builder-proxy.js";   Dst = "api/sienge-builder-proxy.js" },
    @{ Src = "api/sienge-proxy.js";           Dst = "api/sienge-proxy.js" }
)

foreach ($f in $files) {
    Restore-FileFromCommit -CommitHash $commitHash `
                           -FilePath $f.Src `
                           -OutputPath (Join-Path $baseDir $f.Dst)
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  CORRIGINDO SCRIPTS DUPLICADOS NO index.html" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Le o index.html restaurado
$indexPath = Join-Path $baseDir "index.html"
$content = [System.IO.File]::ReadAllText($indexPath, $utf8NoBom)

# Verifica se ha scripts duplicados (bloco defer carregado 2x)
$countDataJs = ([regex]::Matches($content, 'src="data\.js\?')).Count
if ($countDataJs -gt 1) {
    Write-Host "  Detectado: $countDataJs referencias a data.js - removendo duplicatas..." -ForegroundColor Yellow

    # Remove o primeiro bloco duplicado de scripts (manter apenas o segundo, que e o completo)
    # Estrategia: remover o bloco entre os comentarios de scripts antes do firebase-config
    # O padrao: primeiro bloco de <script defer ... termina antes do <!-- Scripts de Negocio -->
    # Remove o primeiro bloco de scripts defer duplicado
    $pattern = '(?s)(<script defer src="data\.js\?v=\d+"[^>]*>\s*</script>[\s\S]*?<script defer src="verificar-construcao\.js\?v=\d+"[^>]*>\s*</script>)\s*\n\s*(<script src="https://unpkg\.com/lucide)'
    if ($content -match $pattern) {
        # Remove o primeiro bloco, mantem o segundo
        $content = $content -replace $pattern, "`$2"
        Write-Host "  OK - Primeiro bloco de scripts removido" -ForegroundColor Green
    } else {
        Write-Host "  INFO - Padrao de duplicata nao encontrado, mantendo arquivo como esta" -ForegroundColor Gray
    }
} else {
    Write-Host "  OK - Nao ha scripts duplicados" -ForegroundColor Green
}

# Atualiza version badge para 177
$today = Get-Date -Format "dd/MM/yyyy"
$content = $content -replace 'v\d+\.\d+\.\d+\s*&nbsp;.+?\d{2}/\d{2}/\d{4}', "v1.0.177 &nbsp;&middot;&nbsp; $today"
$content = $content -replace '\?v=\d+', "?v=177"

[System.IO.File]::WriteAllText($indexPath, $content, $utf8NoBom)

Write-Host ""
Write-Host "  Versao atualizada para v1.0.177 ($today)" -ForegroundColor Green
Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  CONCLUIDO! Arquivos restaurados da v195 com" -ForegroundColor Green
Write-Host "  encoding UTF-8 correto e versao 177." -ForegroundColor Green
Write-Host "  Verifique o CRM e execute deploy.bat." -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""
