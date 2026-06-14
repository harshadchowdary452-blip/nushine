$r = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"superadmin@dental.com","password":"SuperAdmin@123"}' -UseBasicParsing
$headers = @{"Authorization"="Bearer $($r.access_token)"}

$sittingId = "2c05460b-d20c-49f8-a45a-7a32600dad57"

# Complete the sitting
$updateBody = "{`"status`":`"COMPLETED`",`"work_done`":`"Root canal completed`",`"doctor_notes`":`"Procedure successful`"}"
try {
    $result = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/treatment-sittings/$sittingId" -Method PUT -ContentType "application/json" -Headers $headers -Body $updateBody -UseBasicParsing
    Write-Host "SITTING UPDATED: status=$($result.status)"
} catch {
    Write-Host "ERROR: $($_.Exception.Response.StatusCode.value__)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    Write-Host $reader.ReadToEnd()
}

# Verify plan auto-completed
$plan = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/treatment-plans/e6267b5d-bf77-4f4a-9dd2-9bede2846567" -Method GET -Headers $headers -UseBasicParsing
Write-Host "`nPLAN: status=$($plan.status) | total=$($plan.total_sittings) | completed=$($plan.completed_sittings) | remaining=$($plan.remaining_sittings) | progress=$($plan.progress)%"

# Check if enquiries were created
$enquiries = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/crm/enquiry/today?tab=all" -Method GET -Headers $headers -UseBasicParsing
Write-Host "`nENQUIRIES today: $($enquiries.Count)"
$enquiries | ForEach-Object { Write-Host "  $($_.id) | type=$($_.follow_up_type) | patient=$($_.patient_name) | date=$($_.follow_up_date) | status=$($_.status)" }

# Also check tomorrow's enquiries
$enqTomorrow = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/crm/enquiry/today?tab=tomorrow" -Method GET -Headers $headers -UseBasicParsing
Write-Host "`nENQUIRIES tomorrow: $($enqTomorrow.Count)"
$enqTomorrow | ForEach-Object { Write-Host "  $($_.id) | type=$($_.follow_up_type) | patient=$($_.patient_name) | date=$($_.follow_up_date)" }
