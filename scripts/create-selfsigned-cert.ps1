# create-selfsigned-cert.ps1
# Generates a self-signed code-signing certificate for local/development builds.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/create-selfsigned-cert.ps1
#   npm run create-cert
#
# Then build with:
#   $env:CSC_LINK="code-signing-cert.pfx"; $env:CSC_KEY_PASSWORD="YourPassword"; npm run build:win-signed
#
# NOTE: Self-signed certificates will still show a SmartScreen warning for end users.
# For production releases, obtain an OV or EV certificate from a trusted CA
# (DigiCert, Sectigo, Certum, etc.). EV certificates bypass SmartScreen immediately.
# Open-source projects can apply for free signing at https://signpath.io/

param(
    [string]$CertPassword = "MarkdownConverter2025",
    [string]$OutputFile   = "code-signing-cert.pfx",
    [string]$Subject      = "CN=ConcreteInfo, O=ConcreteInfo, L=India, C=IN"
)

Write-Host "Creating self-signed code-signing certificate..." -ForegroundColor Cyan

# Create the certificate in the current user's certificate store
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(3) `
    -HashAlgorithm SHA256 `
    -KeyLength 4096 `
    -KeyUsage DigitalSignature

if (-not $cert) {
    Write-Error "Failed to create certificate."
    exit 1
}

Write-Host "Certificate created: $($cert.Thumbprint)" -ForegroundColor Green

# Export to PFX
$securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
$exportPath = Join-Path (Get-Location) $OutputFile

Export-PfxCertificate -Cert $cert -FilePath $exportPath -Password $securePassword | Out-Null

if (Test-Path $exportPath) {
    Write-Host "Certificate exported to: $exportPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "To build a signed release:" -ForegroundColor Yellow
    Write-Host '  $env:CSC_LINK="code-signing-cert.pfx"' -ForegroundColor White
    Write-Host "  `$env:CSC_KEY_PASSWORD=`"$CertPassword`"" -ForegroundColor White
    Write-Host "  npm run build:win-signed" -ForegroundColor White
    Write-Host ""
    Write-Host "IMPORTANT: Add code-signing-cert.pfx to .gitignore!" -ForegroundColor Red
} else {
    Write-Error "Export failed."
    exit 1
}
