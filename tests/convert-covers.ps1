Add-Type -AssemblyName System.Drawing
$dir = "D:\shimais-daming\frontend\images\qinli"
$map = @{
  "q1380" = "1000045281_5_dgb2.png"
  "q1402" = "1000045282_4_h4df.png"
  "q1449" = "1000045283_2_0gzu.png"
  "q1548" = "1000045284_3_vvj0.png"
  "q1581" = "1000045285_1_6p73.png"
  "q1644" = "1000045286_0_rld4.jpg"
}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 86)
foreach ($id in $map.Keys) {
  $src = Join-Path $dir $map[$id]
  $dst = Join-Path $dir ($id + ".jpg")
  if ($map[$id].ToLower().EndsWith(".jpg")) {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  } else {
    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
    $g.Dispose()
    $bmp.Save($dst, $codec, $params)
    $bmp.Dispose()
    $img.Dispose()
  }
  $check = [System.Drawing.Image]::FromFile($dst)
  Write-Output ("{0} <- {1}  {2}x{3}  {4:N0} KB" -f $id, $map[$id], $check.Width, $check.Height, ((Get-Item $dst).Length / 1KB))
  $check.Dispose()
}
