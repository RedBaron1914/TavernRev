$ErrorActionPreference = "Stop"
$onnxVersion = "1.23.0"
$url = "https://github.com/microsoft/onnxruntime/releases/download/v$onnxVersion/onnxruntime-win-x64-$onnxVersion.zip"
$zipPath = "onnx.zip"
$extractPath = "onnx_extracted"
$targetDllPath = "src-tauri\target\debug\onnxruntime.dll"

# Check if we are on Windows
if ($IsWindows -eq $false -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Host "Not on Windows. Skipping ONNX DLL download."
    exit 0
}

# Ensure target directories exist
$targetDir = Split-Path $targetDllPath
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

if (-not (Test-Path $targetDllPath)) {
    Write-Host "Downloading ONNX Runtime v$onnxVersion..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath
    
    Write-Host "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    
    Write-Host "Copying DLL to target directories..."
    Copy-Item "$extractPath\onnxruntime-win-x64-$onnxVersion\lib\onnxruntime.dll" -Destination "src-tauri\target\debug\onnxruntime.dll" -Force
    
    # Ensure release dir exists and copy there too
    $releaseDir = "src-tauri\target\release"
    if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null }
    Copy-Item "$extractPath\onnxruntime-win-x64-$onnxVersion\lib\onnxruntime.dll" -Destination "$releaseDir\onnxruntime.dll" -Force
    
    Copy-Item "$extractPath\onnxruntime-win-x64-$onnxVersion\lib\onnxruntime.dll" -Destination "src-tauri\onnxruntime.dll" -Force
    
    Write-Host "Cleaning up..."
    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
    
    Write-Host "ONNX Runtime DLL downloaded and setup successfully."
} else {
    Write-Host "ONNX Runtime DLL already exists. Skipping download."
}
