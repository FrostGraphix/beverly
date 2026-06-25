$lines = Get-Content ".env"
$pairs = @()

foreach ($line in $lines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $trim = $line.Trim()
  if ($trim.StartsWith('#')) { continue }
  $idx = $trim.IndexOf('=')
  if ($idx -lt 1) { continue }
  $name = $trim.Substring(0, $idx).Trim()
  $value = $trim.Substring($idx + 1)
  $pairs += [PSCustomObject]@{
    Name = $name
    Value = $value
  }
}

$targets = @('preview', 'production', 'development')

foreach ($pair in $pairs) {
  foreach ($target in $targets) {
    Write-Host ("Setting {0} for {1}" -f $pair.Name, $target)
    vercel env add $pair.Name $target --value $pair.Value --yes --force
  }
}
