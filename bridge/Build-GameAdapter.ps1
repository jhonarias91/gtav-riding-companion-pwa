param([Parameter(Mandatory=$true)][string]$GtaDirectory,[switch]$Install)
$ErrorActionPreference='Stop'
$gtaRoot=(Resolve-Path -LiteralPath $GtaDirectory).Path
$reference=Join-Path $gtaRoot 'ScriptHookVDotNet3.dll'
if(-not(Test-Path -LiteralPath $reference -PathType Leaf)){throw "No se encontró $reference. Selecciona la carpeta real de GTA V con ScriptHookVDotNet3 instalado."}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not(Test-Path -LiteralPath $compiler)){throw 'Se requiere .NET Framework 4.8 de 64 bits para compilar el adaptador.'}
$outputDirectory=Join-Path $PSScriptRoot '..\outputs\game-adapter'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$output=Join-Path $outputDirectory 'GTBikeVCompanion.dll'
& $compiler /nologo /target:library /platform:x64 /optimize+ "/out:$output" "/reference:$reference" /reference:System.Web.Extensions.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'game-adapter\GTBikeApi.cs') (Join-Path $PSScriptRoot 'game-adapter\GameMenuApi.cs') (Join-Path $PSScriptRoot 'game-adapter\GTBikeVCompanion.cs')
if($LASTEXITCODE -ne 0){throw 'No se pudo compilar el adaptador.'}
Write-Host "Adaptador compilado: $output"
if($Install){
 $scriptsDirectory=Join-Path $gtaRoot 'scripts'
 if(-not(Test-Path -LiteralPath $scriptsDirectory -PathType Container)){throw 'No existe la carpeta scripts de GTA V. Verifica la instalación de ScriptHookVDotNet.'}
 $destination=Join-Path $scriptsDirectory 'GTBikeVCompanion.dll'
 if(Test-Path -LiteralPath $destination){Copy-Item -LiteralPath $destination -Destination ($destination+'.'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.bak')}
 Copy-Item -LiteralPath $output -Destination $destination -Force
 Write-Host "Instalado: $destination. Inicia GTA V en modo Historia."
}
