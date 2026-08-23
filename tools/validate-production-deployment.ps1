[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

$composePath = Join-Path $RepositoryRoot 'compose.prod.yml'
$caddyPath = Join-Path $RepositoryRoot 'deploy/Caddyfile'
$envExamplePath = Join-Path $RepositoryRoot 'deploy/production.env.example'
$servicePath = Join-Path $RepositoryRoot 'deploy/roleimpact.service'
$runbookPath = Join-Path $RepositoryRoot 'docs/production-deployment.md'
$gitignorePath = Join-Path $RepositoryRoot '.gitignore'

@($composePath, $caddyPath, $envExamplePath, $servicePath, $runbookPath, $gitignorePath) | ForEach-Object { Require-Path $_ }

if ($failures.Count -eq 0) {
    $compose = Get-Content -Raw -LiteralPath $composePath
    $caddy = Get-Content -Raw -LiteralPath $caddyPath
    $envExample = Get-Content -Raw -LiteralPath $envExamplePath
    $service = Get-Content -Raw -LiteralPath $servicePath
    $runbook = Get-Content -Raw -LiteralPath $runbookPath
    $gitignore = Get-Content -Raw -LiteralPath $gitignorePath

    Require-Text $compose '(?m)^\s+api:\r?$' 'an api service'
    Require-Text $compose 'context:\s*\./backend' 'the API Docker build context'
    Require-Text $compose '(?m)^\s+caddy:\r?$' 'a Caddy service'
    Require-Text $compose 'restart:\s*unless-stopped' 'restart policies'
    Require-Text $compose '"80:80"' 'public HTTP exposure'
    Require-Text $compose '"443:443"' 'public HTTPS exposure'
    if ($compose -match '"?8080:8080"?') {
        $failures.Add('The API must not publish port 8080 directly.')
    }
    Require-Text $compose 'internal:\s*true' 'an internal API network'
    Require-Text $compose 'PRODUCTION_ENV_FILE' 'production environment-file mapping'
    Require-Text $compose 'caddy_data:' 'persistent Caddy certificate storage'
    Require-Text $compose 'caddy_config:' 'persistent Caddy runtime storage'
    Require-Text $compose 'API_DOMAIN:\s*\$\{API_DOMAIN' 'Caddy API_DOMAIN environment mapping'
    Require-Text $compose '(?m)^\s+- egress\r?$' 'an API outbound network attachment'
    Require-Text $compose '(?m)^  egress:\r?$' 'an outbound network declaration'
    $caddySection = [regex]::Match($compose, '(?ms)^  caddy:\r?\n(?<content>.*?)(?=^  [a-z_]+:|^networks:)').Groups['content'].Value
    if ($caddySection -match '(?m)^\s+env_file:') {
        $failures.Add('Caddy must not receive the API database environment file.')
    }

    Require-Text $caddy '\{\$API_DOMAIN\}' 'API_DOMAIN Caddy address'
    Require-Text $caddy 'reverse_proxy\s+api:8080' 'internal API reverse proxy'
    Require-Text $caddy 'health_uri\s+/actuator/health' 'API upstream health checks'

    @('API_DOMAIN=', 'DB_URL=', 'DB_USERNAME=', 'DB_PASSWORD=', 'CORS_ALLOWED_ORIGIN=', 'SPRING_PROFILES_ACTIVE=prod') | ForEach-Object {
        Require-Text $envExample ([regex]::Escape($_)) "production environment variable $_"
    }
    if ($envExample -match '(?m)^DB_PASSWORD=(?!<[^>]+>\r?$).+') {
        $failures.Add('The production environment example must not contain a database password.')
    }
    Require-Text $gitignore '(?m)^deploy/production\.env\r?$' 'Git exclusion for the real production environment file'

    Require-Text $service 'WorkingDirectory=/opt/roleimpact' 'the server deployment directory'
    Require-Text $service 'compose\.prod\.yml' 'the production Compose file'
    Require-Text $service '--env-file' 'the production environment file'

    @('Ubuntu', 'ARM', 'Docker', 'DNS', 'TLS', 'OCI', 'UFW', 'egress', 'rollback', '/actuator/health') | ForEach-Object {
        Require-Text $runbook ("(?i)" + [regex]::Escape($_)) "runbook coverage for $_"
    }
}

if ($failures.Count -gt 0) {
    Write-Error ("Production deployment validation failed:`n - " + ($failures -join "`n - "))
    exit 1
}

$previousEnvFile = $env:PRODUCTION_ENV_FILE
try {
    $env:PRODUCTION_ENV_FILE = './deploy/production.env.example'
    Push-Location $RepositoryRoot
    & docker compose --env-file deploy/production.env.example -f compose.prod.yml config --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose rejected compose.prod.yml.'
    }
}
finally {
    Pop-Location
    $env:PRODUCTION_ENV_FILE = $previousEnvFile
}

Write-Host 'Production deployment validation passed.'
