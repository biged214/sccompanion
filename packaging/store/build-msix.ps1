param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name = $env:STORE_IDENTITY_NAME
$publisher = $env:STORE_IDENTITY_PUBLISHER
$publisherDisplay = $env:STORE_PUBLISHER_DISPLAY_NAME
if ($name -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Enter the exact Package/Identity/Name from Partner Center.' }
if ([string]::IsNullOrWhiteSpace($publisher) -or !$publisher.StartsWith('CN=')) { throw 'Enter the full Package/Identity/Publisher from Partner Center (CN=...).' }
if ([string]::IsNullOrWhiteSpace($publisherDisplay)) { throw 'Enter Package/Properties/PublisherDisplayName from Partner Center.' }
$config = Get-Content -LiteralPath (Join-Path $root 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
if ($config.version -notmatch '^([0-9]+)\.([0-9]+)\.([0-9]+)$') { throw 'Store builds require a stable three-part app version.' }
$parts = @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
if ($parts.Where({ $_ -gt 65535 }).Count) { throw 'MSIX version components must not exceed 65535.' }
# Store submissions reserve the fourth component; keep it zero.
$version = "$($config.version).0"
if ($ValidateOnly) { Write-Output "Store identity validated; package version $version"; return }
$exe = Join-Path $root 'src-tauri/target/release/sc-companion-store.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Store binary is missing. Build with tauri.store.conf.json first.' }
$output = Join-Path $root 'store-output'
New-Item -ItemType Directory -Path $output -Force | Out-Null
# A fresh directory avoids accidentally carrying old files into a new package.
$stage = Join-Path $output ('staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'sc-companion-store.exe')
foreach ($asset in @('Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png')) {
  Copy-Item -LiteralPath (Join-Path $root "src-tauri/icons/$asset") -Destination (Join-Path $stage "Assets/$asset")
}
[xml]$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="PLACEHOLDER" Publisher="CN=PLACEHOLDER" Version="1.0.0.0" ProcessorArchitecture="x64" />
  <Properties><DisplayName>SC Companion</DisplayName><PublisherDisplayName>PLACEHOLDER</PublisherDisplayName><Description>Star Citizen news, guides, reference data, trade planning, and local gameplay history.</Description><Logo>Assets\StoreLogo.png</Logo></Properties>
  <Resources><Resource Language="en-US" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Applications><Application Id="App" Executable="sc-companion-store.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="SC Companion" Description="Star Citizen desktop companion" BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" /></Application></Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
'@
$manifest.Package.Identity.SetAttribute('Name', $name)
$manifest.Package.Identity.SetAttribute('Publisher', $publisher)
$manifest.Package.Identity.SetAttribute('Version', $version)
$manifest.Package.Properties.PublisherDisplayName = $publisherDisplay
$manifest.Save((Join-Path $stage 'AppxManifest.xml'))
$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeappx = Get-ChildItem -Path "$sdk/*/x64/makeappx.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (!$makeappx) { throw 'Windows SDK MakeAppx.exe was not found.' }
$package = Join-Path $output "SC-Companion-Store_$($version)_x64.msix"
& $makeappx.FullName pack /d $stage /p $package /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with exit code $LASTEXITCODE" }
Write-Output "Created $package for Partner Center upload (not signed for local installation)."
