from app.routers.crm_rules import _rule_to_dict, _LEAD_TRIGGER_BE2FE, _LEAD_ACTION_BE2FE, _to_delay_str, _parse_delay

class FakeRule:
    id='x'; hospital_id='h'; rule_name='Test'; rule_type='LEAD'
    trigger_event='PATIENT_REGISTERED'; treatment_type_id=None; visit_stage=None
    delay_value=2; delay_unit='DAYS'; action='GENERAL_FOLLOW_UP'
    assign_to='RECEPTION'; send_whatsapp=True; send_notification=False; is_active=True
    created_at=None; created_by=None; updated_at=None; description=None

d = _rule_to_dict(FakeRule())
print("Lead rule:", d)
assert d["trigger"] == "NEW_ENQUIRY", "trigger mismatch"
assert d["action"] == "FOLLOW_UP_ENQUIRY", "action mismatch"
assert d["wait_time"] == "2_DAYS", "wait_time mismatch"

# Treatment rule
FakeRule.rule_type = "TREATMENT"
FakeRule.trigger_event = "VISIT_COMPLETED"
FakeRule.action = "GENERAL_FOLLOW_UP"
FakeRule.visit_stage = "ANY"
d2 = _rule_to_dict(FakeRule())
print("Treatment rule:", d2)
assert d2["trigger"] == "VISIT_COMPLETED"
assert d2["action"] == "GENERAL_FOLLOW_UP"

# Parse delay roundtrip
dv, du = _parse_delay("3_DAYS")
assert (dv, du) == (3, "DAYS")
s = _to_delay_str(dv, du)
assert s == "3_DAYS"

print("ALL OK")
