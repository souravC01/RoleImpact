[CmdletBinding()]
param(
    [string]$RepositoryRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}

$failures = [System.Collections.Generic.List[string]]::new()

function Require-Path {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        $script:failures.Add("Missing required file: $Path")
    }
}

function Require-Text {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Description
    )

    if ($Content -notmatch $Pattern) {
        $script:failures.Add("Missing contract: $Description")
    }
}

$renderPath = Join-Path $RepositoryRoot 'render.yaml'
$dockerfilePath = Join-Path $RepositoryRoot 'backend/Dockerfile'
$prodConfigPath = Join-Path $RepositoryRoot 'backend/src/main/resources/application-prod.yml'
$vercelPath = Join-Path $RepositoryRoot 'frontend/vercel.json'
$runbookPath = Join-Path $RepositoryRoot 'docs/production-deployment.md'

@($renderPath, $dockerfilePath, $prodConfigPath, $vercelPath, $runbookPath) | ForEach-Object { Require-Path $_ }

if ($failures.Count -eq 0) {
    $render = Get-Content -Raw -LiteralPath $renderPath
    $dockerfile = Get-Content -Raw -LiteralPath $dockerfilePath
    $prodConfig = Get-Content -Raw -LiteralPath $prodConfigPath
    $vercel = Get-Content -Raw -LiteralPath $vercelPath
    $runbook = Get-Content -Raw -LiteralPath $runbookPath

    Require-Text $render '(?m)^\s*- type: web\r?$' 'a Render web service'
    Require-Text $render '(?m)^\s+name: roleimpact-api\r?$' 'the production API service name'
    Require-Text $render '(?m)^\s+runtime: docker\r?$' 'the Docker runtime'
    Require-Text $render '(?m)^\s+plan: free\r?$' 'the Free service plan'
    Require-Text $render '(?m)^\s+region: oregon\r?$' 'the Neon-adjacent Oregon region'
    Require-Text $render '(?m)^\s+branch: main\r?$' 'main as the production branch'
    Require-Text $render '(?m)^\s+autoDeploy: true\r?$' 'automatic reviewed deployments'
    Require-Text $render 'dockerfilePath:\s*\./backend/Dockerfile' 'the backend Dockerfile path'
    Require-Text $render 'dockerContext:\s*\./backend' 'the backend Docker build context'
    Require-Text $render 'healthCheckPath:\s*/actuator/health' 'the API health check'

    @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'CORS_ALLOWED_ORIGIN') | ForEach-Object {
        $secretPattern = '(?ms)- key:\s*' + [regex]::Escape($_) + '\s+sync:\s*false'
        Require-Text $render $secretPattern "dashboard-managed secret $_"
    }

    Require-Text $dockerfile '(?m)^FROM .* AS build\r?$' 'a multi-stage container build'
    Require-Text $dockerfile '(?m)^USER 10001:10001\r?$' 'a non-root runtime user'
    Require-Text $dockerfile 'ENTRYPOINT \["java", "-jar", "/app/app.jar"\]' 'the API container entry point'

    Require-Text $prodConfig 'port:\s*\$\{PORT:8080\}' 'Render PORT binding'
    Require-Text $prodConfig 'allowed-origin:\s*\$\{CORS_ALLOWED_ORIGIN\}' 'production CORS isolation'
    Require-Text $prodConfig '(?ms)bootui:\s+enabled:\s*false' 'disabled production BootUI'
    Require-Text $prodConfig '(?ms)include:\s*health,info' 'minimal actuator exposure'

    Require-Text $vercel '"source":\s*"/:path\*"' 'Vercel SPA route matching'
    Require-Text $vercel '"destination":\s*"/index.html"' 'Vercel SPA fallback'

    @('Render', 'Vercel', 'Neon', 'Flyway', 'DB_URL', 'CORS_ALLOWED_ORIGIN', '/actuator/health', 'rollback') | ForEach-Object {
        Require-Text $runbook ("(?i)" + [regex]::Escape($_)) "runbook coverage for $_"
    }
}

if ($failures.Count -gt 0) {
    Write-Error ("Production deployment validation failed:`n - " + ($failures -join "`n - "))
    exit 1
}

Write-Host 'Production deployment validation passed.'
