Add-Type -AssemblyName System.Drawing

$destination = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'
foreach ($iconSize in @(192, 512)) {
    $canvas = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $scale = $iconSize / 64.0
    $graphics.ScaleTransform($scale, $scale)
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#100c1a'))
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc(0, 0, 36, 36, 180, 90)
    $path.AddArc(28, 0, 36, 36, 270, 90)
    $path.AddArc(28, 28, 36, 36, 0, 90)
    $path.AddArc(0, 28, 36, 36, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($background, $path)
    $orange = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#ff9a4d'), 5)
    $white = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#f4effa'), 5)
    $orange.StartCap = $orange.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $white.StartCap = $white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawEllipse($orange, 9, 34, 18, 18)
    $graphics.DrawEllipse($orange, 37, 34, 18, 18)
    $graphics.DrawLine($white, 18, 43, 29, 21)
    $graphics.DrawLine($white, 29, 21, 46, 43)
    $graphics.DrawLine($white, 26, 22, 36, 22)
    $canvas.Save((Join-Path $destination "icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $white.Dispose(); $orange.Dispose(); $path.Dispose(); $background.Dispose(); $graphics.Dispose(); $canvas.Dispose()
}
