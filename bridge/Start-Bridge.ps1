param([string]$IniPath,[string]$FitDirectory,[ValidateRange(1024,65535)][int]$Port=8787)
$ErrorActionPreference='Stop'
$nodeCommand=Get-Command node -ErrorAction Stop
$bridgeArguments=@((Join-Path $PSScriptRoot 'start.mjs'),'--port',"$Port")
if($IniPath){$bridgeArguments+=@('--ini',(Resolve-Path -LiteralPath $IniPath).Path)}
if($FitDirectory){$bridgeArguments+=@('--fit-directory',(Resolve-Path -LiteralPath $FitDirectory).Path)}
& $nodeCommand.Source @bridgeArguments
exit $LASTEXITCODE
