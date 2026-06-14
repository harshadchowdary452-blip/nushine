$r = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"superadmin@dental.com","password":"SuperAdmin@123"}' -UseBasicParsing
$headers = @{"Authorization"="Bearer $($r.access_token)"}

$plans = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/treatment-plans/" -Method GET -Headers $headers -UseBasicParsing
Write-Host "Plans:"
$plans | ForEach-Object { Write-Host "  $($_.id) | $($_.treatment_name) | $($_.status)" }

$planId = $plans[0].id
$sittings = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/treatment-sittings/by-plan/$planId" -Method GET -Headers $headers -UseBasicParsing
Write-Host "Sittings:"
$sittings | ForEach-Object { Write-Host "  $($_.id) | $($_.status)" }

if ($sittings.Count -gt 0) {
    $sid = $sittings[0].id
    Write-Host "Completing sitting: $sid"
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/treatment-sittings/$sid" -Method PUT -ContentType "application/json" -Headers $headers -Body '{"status":"COMPLETED"}' -UseBasicParsing
        Write-Host "OK: $($result.status)"
    } catch {
        $resp = $_.Exception.Response
        $sc = [int]$resp.StatusCode
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "ERROR $sc : $body"
    }
}
