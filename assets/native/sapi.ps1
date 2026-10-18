param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$request = Get-Content -LiteralPath $RequestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($request.operation -eq 'list') {
    $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
      $info = $_.VoiceInfo
      [pscustomobject]@{ name=$info.Name; locale=$info.Culture.Name; gender=$info.Gender.ToString() }
    })
    ConvertTo-Json -InputObject $voices -Compress
  } elseif ($request.operation -eq 'speak') {
    $synth.SelectVoice([string]$request.name)
    $synth.SetOutputToWaveFile([string]$request.output)
    $synth.SpeakSsml([string]$request.ssml)
  } else { throw 'Operación de voz desconocida.' }
} finally { $synth.Dispose() }
