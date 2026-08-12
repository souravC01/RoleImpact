$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\soura\.codex\.chatgpt-projects\g-p-6a7be822d72c81919ff60a55d05d082e'
$wordPath = 'C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE'
$documents = @(
    "$workspace\deliverables\RoleImpact_Low_Fidelity_Wireframes_v1.0.docx",
    "$workspace\deliverables\RoleImpact_Technical_Design_v1.0.docx"
)
$pdfDirectory = "$workspace\qa\roleimpact_design_docs\pdf"
New-Item -ItemType Directory -Path $pdfDirectory -Force | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    foreach ($inputPath in $documents) {
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($inputPath)
        $pdfPath = Join-Path $pdfDirectory ($stem + '.pdf')
        $doc = $word.Documents.Open($inputPath, $false, $true)
        try {
            $doc.ExportAsFixedFormat($pdfPath, 17)
        }
        finally {
            $doc.Close($false)
        }
        Write-Output $pdfPath
    }
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
