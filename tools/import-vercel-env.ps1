param(
  [string]$EnvFile = ".env",
  [string]$Scope = $env:VERCEL_SCOPE,
  [string[]]$Targets = @("preview", "production"),
  [switch]$IncludeDevelopment,
  [switch]$ApplyProductionWrites
)

if ($IncludeDevelopment) {
  $Targets = @("development") + $Targets
}

$allowedNames = @(
  "UPSTREAM_API_URL",
  "UPSTREAM_USERNAME",
  "UPSTREAM_PASSWORD",
  "UPSTREAM_BEARER_TOKEN",
  "GPRS_UPSTREAM_BEARER_TOKEN",
  "ADMIN_USERNAMES",
  "ADMIN_EMAILS",
  "JWT_SECRET",
  "NODE_ENV",
  "CORS_ORIGINS",
  "ENABLE_METRICS",
  "SESSION_STORE_MODE",
  "SUPABASE_AUTH_ENABLED",
  "SUPABASE_STORAGE_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIVE_API_PROXY_ENABLED",
  "LIVE_API_BASE_URL",
  "LIVE_API_BEARER_TOKEN",
  "STAGING_WRITE_APPROVED",
  "PROJECT_NAME",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_FROM_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_TOKEN_SMS_FROM_NUMBER",
  "TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID",
  "TWILIO_SMS_STATUS_CALLBACK_URL",
  "TWILIO_WEBHOOK_BASE_URL",
  "TWILIO_VALIDATE_WEBHOOKS",
  "WEBHOOK_SECRET",
  "VERCEL_PROTECTION_BYPASS",
  "SMOKE_AUTH_TOKEN",
  "SMOKE_USER_ID",
  "SMOKE_PASSWORD"
)

if ($ApplyProductionWrites) {
  $allowedNames += @("ALLOW_LIVE_WRITES", "APPROVED_LIVE_WRITES", "VITE_ALLOW_LIVE_WRITES")
}

$localOnlyNames = @(
  "LOCAL_DB_PATH",
  "TARGET_URL",
  "PREVIEW_TARGET_URL",
  "PRODUCTION_TARGET_URL",
  "STAGING_TARGET_URL"
)

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$lines = Get-Content $EnvFile
$pairs = @()

foreach ($line in $lines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $trim = $line.Trim()
  if ($trim.StartsWith('#')) { continue }
  $idx = $trim.IndexOf('=')
  if ($idx -lt 1) { continue }
  $name = $trim.Substring(0, $idx).Trim()
  $value = $trim.Substring($idx + 1)
  if ($localOnlyNames -contains $name) {
    Write-Host ("Skipping local-only {0}" -f $name)
    continue
  }
  if (-not ($allowedNames -contains $name)) {
    Write-Host ("Skipping unapproved {0}" -f $name)
    continue
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host ("Skipping blank {0}" -f $name)
    continue
  }
  $pairs += [PSCustomObject]@{
    Name = $name
    Value = $value
  }
}

foreach ($pair in $pairs) {
  foreach ($target in $Targets) {
    if ($target -eq "production" -and $pair.Name -eq "ALLOW_LIVE_WRITES" -and -not $ApplyProductionWrites) {
      throw "Refusing production live writes without -ApplyProductionWrites"
    }
    Write-Host ("Setting {0} for {1}" -f $pair.Name, $target)
    $args = @("env", "add", $pair.Name, $target, "--value", $pair.Value, "--yes", "--force")
    if (-not [string]::IsNullOrWhiteSpace($Scope)) {
      $args += @("--scope", $Scope)
    }
    vercel @args
    if ($LASTEXITCODE -ne 0) {
      throw ("vercel env add failed for {0} in {1}" -f $pair.Name, $target)
    }
  }
}
