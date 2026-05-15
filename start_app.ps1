# Infonote Startup Script
# This script sets up the portable Node.js environment and starts the development server.

$nodeDir = Get-ChildItem -Path node_portable -Directory | Select-Object -First 1
if ($null -eq $nodeDir) {
    Write-Error "Portable Node.js not found in 'node_portable'. Please run the installation steps first."
    exit 1
}

$env:Path += ";$($nodeDir.FullName)"
Write-Host "Node.js path set to: $($nodeDir.FullName)"
Write-Host "Starting development server..."

npm run dev
