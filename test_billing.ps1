$r = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"superadmin@dental.com","password":"SuperAdmin@123"}' -UseBasicParsing
$headers = @{"Authorization"="Bearer $($r.access_token)"}
try {
    $result = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/billings/" -Method POST -ContentType "application/json" -Headers $headers -Body '{"case_id":"4d7dc143-0773-41d5-826d-1a6a8d45f3f5","total_amount":5000,"paid_amount":0,"payment_method":"","notes":"","discount_type":"PERCENTAGE","discount_percent":0,"discount_amount":0,"discount_reason":""}' -UseBasicParsing
    Write-Host "SUCCESS:"
    $result | ConvertTo-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $responseBody = $reader.ReadToEnd()
    Write-Host "ERROR $statusCode : $responseBody"
}
