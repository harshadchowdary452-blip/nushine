$r = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"superadmin@dental.com","password":"SuperAdmin@123"}' -UseBasicParsing
$headers = @{"Authorization"="Bearer $($r.access_token)"}

# Get cases
$cases = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/cases/" -Method GET -Headers $headers -UseBasicParsing
Write-Host "CASES:"
$cases | ForEach-Object { Write-Host "  $($_.id) | complaint=$($_.chief_complaint) | status=$($_.status)" }

# Test billing creation for each case
foreach ($c in $cases) {
    $body = "{`"case_id`":`"$($c.id)`",`"total_amount`":5000,`"paid_amount`":0,`"payment_method`":`"`",`"notes`":`"`",`"discount_type`":`"PERCENTAGE`",`"discount_percent`":0,`"discount_amount`":0,`"discount_reason`":`"`"}"
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/billings/" -Method POST -ContentType "application/json" -Headers $headers -Body $body -UseBasicParsing
        Write-Host "SUCCESS for $($c.id): created billing $($result.id)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $responseBody = $reader.ReadToEnd()
        Write-Host "ERROR $statusCode for $($c.id): $responseBody"
    }
}
