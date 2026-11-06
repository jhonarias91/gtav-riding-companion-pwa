param([ValidateRange(1024,65535)][int]$Port=8787,[switch]$Remove)
$ErrorActionPreference='Stop'
$ruleName="GTBikeVCompanion-LAN-$Port"
if($Remove){Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule;Write-Host 'Regla del puente eliminada.';exit}
$nodeExecutable=(Get-Command node -ErrorAction Stop).Source
if(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue){Write-Host 'La regla del puente ya existe.';exit}
New-NetFirewallRule -Name $ruleName -DisplayName "GTBikeV Companion Wi-Fi ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $nodeExecutable -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host 'Permitido solo en el perfil Privado y la subred local.'
