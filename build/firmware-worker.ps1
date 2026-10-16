param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
try {
  $job = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
  if ($job.expectedProduct -notin @('GS_G7_Pro_CE_DV','GS_T3CE')) { throw 'Unsupported expected firmware family' }
  if ($job.expectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid expected firmware version' }
  if ($job.action -notin @('inspect','ready','flash')) { throw 'Invalid firmware action' }
  if ($job.action -ne 'inspect' -and @(Get-Process | Where-Object { $_.ProcessName -eq 'GameSir Connect' }).Count -gt 0) { throw 'Fully quit GameSir Connect, including its tray process, before flashing.' }
  if (-not (Test-Path -LiteralPath $job.dll)) { throw 'GameSir updater library is missing' }
  $dllName = $job.dll.Replace('"','""')
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FirmwareNative {
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void Progress(int percent);
 [DllImport(@"$dllName",CallingConvention=CallingConvention.Cdecl)] private static extern int JL_loadUfwData(IntPtr bytes,int size);
 private static GCHandle firmwarePin;
 public static int LoadImage(byte[] bytes) {
   // Keep the native image pointer stable until this worker exits, even if
   // the vendor loader retains it for the later upgrade call.
   firmwarePin=GCHandle.Alloc(bytes,GCHandleType.Pinned);
   return JL_loadUfwData(firmwarePin.AddrOfPinnedObject(),bytes.Length);
 }
 [DllImport(@"$dllName",CallingConvention=CallingConvention.Cdecl)] public static extern int JL_getUfwPidVid([Out] byte[] pid,int psize,[Out] byte[] vid,int vsize);
 [DllImport(@"$dllName",CallingConvention=CallingConvention.Cdecl)] public static extern int JL_queryDevicePidVid(byte disk,[Out] byte[] pid,int psize,[Out] byte[] vid,int vsize);
 [DllImport(@"$dllName",CallingConvention=CallingConvention.Cdecl)] public static extern int JL_setDualBackupBurning(int enabled);
 [DllImport(@"$dllName",CallingConvention=CallingConvention.Cdecl)] public static extern int JL_upgradeDevice(byte disk,[MarshalAs(UnmanagedType.I1)] bool flag1,[MarshalAs(UnmanagedType.I1)] bool flag2,Progress callback);
 private static readonly Progress callback = OnProgress;
 private static void OnProgress(int percent) {
   try { Console.WriteLine("{\"event\":\"progress\",\"ret\":1,\"progress\":"+percent+",\"message\":\"GameSir controller firmware update\"}"); Console.Out.Flush(); } catch { }
 }
 public static int Upgrade(byte disk) {
   Console.WriteLine("{\"event\":\"writeStarted\",\"message\":\"Update-mode controller identity matched. Starting GameSir firmware write.\"}"); Console.Out.Flush();
   int ret=JL_upgradeDevice(disk,false,true,callback);
   GC.KeepAlive(callback);
   return ret;
 }
}
"@
  $bytes = [IO.File]::ReadAllBytes($job.image)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $hash = ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
  if ($hash -ne $job.sha256) { throw 'Firmware changed since validation' }
  $ret = [FirmwareNative]::LoadImage($bytes)
  if ($ret -ne 0) { throw "GameSir rejected firmware: $ret" }
  $firmwarePid = New-Object byte[] 16; $vid = New-Object byte[] 4
  $ret = [FirmwareNative]::JL_getUfwPidVid($firmwarePid,16,$vid,4)
  if ($ret -ne 0) { throw "Firmware identity read failed: $ret" }
  $product = [Text.Encoding]::ASCII.GetString($firmwarePid).Trim([char]0)
  $version = [Text.Encoding]::ASCII.GetString($vid).Trim([char]0)
  if ($product -ne $job.expectedProduct) { throw "Wrong controller firmware: expected $($job.expectedProduct), got $product" }
  $normalizedVersion = ($version -replace '[^0-9]','').TrimStart('0')
  $expectedVersion = ($job.expectedVersion -replace '[^0-9]','').TrimStart('0')
  if ($normalizedVersion -ne $expectedVersion) { throw "Firmware version mismatch: expected $($job.expectedVersion), got $version" }
  if ($job.action -eq 'ready') {
    # NUL is not a drive letter. Exercise the formerly crashing native query
    # before the app sends any update-mode command to a real controller.
    $probePid = New-Object byte[] 16; $probeVid = New-Object byte[] 4
    $probeRet = [FirmwareNative]::JL_queryDevicePidVid(0,$probePid,16,$probeVid,4)
    if ($probeRet -ne -5) { throw "Native worker self-check returned unexpected result: $probeRet. No controller update command sent." }
  }
  if ($job.action -ne 'flash') { @{success=$true;product=$product;version=$version} | ConvertTo-Json -Compress; exit 0 }
  $matches = @(); $observed = @()
  Write-Output '{"event":"progress","ret":1,"progress":0,"message":"Waiting up to 15 seconds for Windows to detect the controller update drive. No firmware write started."}'
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $matches = @(); $observed = @()
    foreach ($disk in @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2')) {
      $p = New-Object byte[] 16; $v = New-Object byte[] 4
      $letter = [byte][char]$disk.DeviceID[0]
      @{event='progress';ret=1;progress=0;message="Checking update-mode identity on $($disk.DeviceID). No firmware write started."} | ConvertTo-Json -Compress
      $ret = [FirmwareNative]::JL_queryDevicePidVid($letter,$p,16,$v,4)
      $name = [Text.Encoding]::ASCII.GetString($p).Trim([char]0)
      $observed += "$($disk.DeviceID):ret=$ret,pid=$name"
      if ($ret -eq 0 -and $name -eq $product) { $matches += $letter }
    }
    if ($matches.Count -gt 1) { throw 'Multiple matching update-mode controllers found. No firmware write started.' }
    if ($matches.Count -eq 1) { break }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($matches.Count -ne 1) { throw "No matching controller update drive detected. No firmware write started. Observed: $($observed -join '; ')" }
  $ret = [FirmwareNative]::JL_setDualBackupBurning(1)
  if ($ret -ne 0) { throw "Dual backup setup failed: $ret" }
  $ret = [FirmwareNative]::Upgrade($matches[0])
  if ($ret -ne 0) { throw "GameSir flashing returned $ret. Recovery may be needed; do not assume the controller is unchanged." }
  @{success=$true;product=$product;version=$version;message='GameSir updater completed. Reconnect and verify the running version.'} | ConvertTo-Json -Compress
} catch { @{success=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
