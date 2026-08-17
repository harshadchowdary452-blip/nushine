import sys; sys.path.insert(0, '.')
import asyncio
import uuid
from datetime import date, datetime, time, timezone, timedelta
from app.database import async_session_factory
from app.models.lead import Lead, LeadStatus, LeadSource
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.campaign import Campaign, CampaignStatus, CampaignType, CampaignChannel, CampaignTarget
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.billing import Billing, PaymentStatus
from app.models.communication_log import CommunicationLog, CommunicationChannel, CommunicationStatus, MessageType

HOSPITAL_ID = "fadd20f4-4173-423c-bfb0-a45d5435bc56"
DOCTOR_IDS = [
    "194fde09-fa5d-45ac-bcda-ce60c3dde91c",
    "0c47bfa5-d661-4f17-b75c-1dfb0907f706",
    "640981bd-0d4a-492d-b304-e63e785229ec",
    "a28c3b51-b13f-467d-bf18-6f5ef840494a",
]
ADMIN_ID = "778b6936-0f6d-469a-a72f-a9a764b95170"
PATIENT_UUIDS = [str(uuid.uuid4()) for _ in range(2)]
CASE_UUIDS = [str(uuid.uuid4()) for _ in range(2)]
BILLING_UUIDS = [str(uuid.uuid4()) for _ in range(2)]
LEAD_UUIDS = [str(uuid.uuid4()) for _ in range(5)]
CAMPAIGN_UUIDS = [str(uuid.uuid4()) for _ in range(3)]

async def seed():
    async with async_session_factory() as session:
        try:
            # 2 Patients (for converted leads)
            patients_data = [
                Patient(
                    id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[2],
                    full_name="Ravi Kumar", gender="MALE", age=32,
                    phone="9123456780", email="ravi.k@email.com",
                    patient_source="GOOGLE_MAPS", status=PatientStatus.ACTIVE,
                    created_at=datetime.now(timezone.utc) - timedelta(days=15),
                ),
                Patient(
                    id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[3],
                    full_name="Priya Sharma", gender="FEMALE", age=28,
                    phone="9988776655", email="priya.s@email.com",
                    patient_source="INSTAGRAM", status=PatientStatus.UNDER_TREATMENT,
                    created_at=datetime.now(timezone.utc) - timedelta(days=10),
                ),
            ]
            for p in patients_data:
                session.add(p)
            await session.flush()

            # 2 Cases for converted patients
            cases_data = [
                Case(id=CASE_UUIDS[0], patient_id=PATIENT_UUIDS[0], doctor_id=DOCTOR_IDS[2],
                     chief_complaint="Dental pain in lower right molar", diagnosis="Cavity in tooth 46",
                     status=CaseStatus.COMPLETED, is_active=False,
                     created_at=datetime.now(timezone.utc) - timedelta(days=12)),
                Case(id=CASE_UUIDS[1], patient_id=PATIENT_UUIDS[1], doctor_id=DOCTOR_IDS[3],
                     chief_complaint="Missing tooth - wants implant", diagnosis="Edentulous area in tooth 36",
                     status=CaseStatus.IN_PROGRESS, is_active=True,
                     created_at=datetime.now(timezone.utc) - timedelta(days=7)),
            ]
            for c in cases_data:
                session.add(c)
            await session.flush()

            # 2 Billings for cases
            billing_data = [
                Billing(id=BILLING_UUIDS[0], case_id=CASE_UUIDS[0], total_amount=12000, original_amount=15000,
                        paid_amount=12000, pending_amount=0, discount_percent=20, discount_amount=3000,
                        payment_status=PaymentStatus.PAID, payment_method="CASH",
                        invoice_number=f"INV-{date.today().strftime('%Y%m')}-001",
                        created_at=datetime.now(timezone.utc) - timedelta(days=10),
                        updated_at=datetime.now(timezone.utc) - timedelta(days=8)),
                Billing(id=BILLING_UUIDS[1], case_id=CASE_UUIDS[1], total_amount=45000, original_amount=45000,
                        paid_amount=15000, pending_amount=30000, discount_amount=0,
                        payment_status=PaymentStatus.PARTIAL, payment_method="UPI",
                        invoice_number=f"INV-{date.today().strftime('%Y%m')}-002",
                        created_at=datetime.now(timezone.utc) - timedelta(days=5)),
            ]
            for b in billing_data:
                session.add(b)
            await session.flush()

            # 5 Leads with various sources and statuses
            leads_data = [
                Lead(id=LEAD_UUIDS[0], hospital_id=HOSPITAL_ID, assigned_staff_id=ADMIN_ID, assigned_doctor_id=DOCTOR_IDS[0],
                     lead_name="Amit Verma", mobile="9012345678", email="amit.v@gmail.com", age=35, gender="MALE",
                     source=LeadSource.GOOGLE_MAPS.value, interested_treatment="Root Canal",
                     budget=8000, status=LeadStatus.CONVERTED.value, lead_score=85, priority="HIGH",
                     next_follow_up_date=date.today() + timedelta(days=7),
                     converted_patient_id=PATIENT_UUIDS[0],
                     created_at=datetime.now(timezone.utc) - timedelta(days=20),
                     updated_at=datetime.now(timezone.utc) - timedelta(days=15)),
                Lead(id=LEAD_UUIDS[1], hospital_id=HOSPITAL_ID, assigned_staff_id=ADMIN_ID, assigned_doctor_id=DOCTOR_IDS[1],
                     lead_name="Neha Gupta", mobile="9088776655", email="neha.g@yahoo.com", age=27, gender="FEMALE",
                     source=LeadSource.INSTAGRAM.value, interested_treatment="Teeth Whitening",
                     budget=5000, status=LeadStatus.APPOINTMENT_BOOKED.value, lead_score=70, priority="MEDIUM",
                     next_follow_up_date=date.today() + timedelta(days=3),
                     created_at=datetime.now(timezone.utc) - timedelta(days=10)),
                Lead(id=LEAD_UUIDS[2], hospital_id=HOSPITAL_ID, assigned_staff_id=ADMIN_ID,
                     lead_name="Suresh Reddy", mobile="8877665544", email="suresh.r@outlook.com", age=45, gender="MALE",
                     source=LeadSource.WEBSITE.value, interested_treatment="Dental Implant",
                     budget=40000, status=LeadStatus.INTERESTED.value, lead_score=60,
                     next_follow_up_date=date.today() + timedelta(days=2),
                     created_at=datetime.now(timezone.utc) - timedelta(days=5)),
                Lead(id=LEAD_UUIDS[3], hospital_id=HOSPITAL_ID, assigned_staff_id=ADMIN_ID, assigned_doctor_id=DOCTOR_IDS[2],
                     lead_name="Ananya Patel", mobile="7766554433", email="ananya.p@gmail.com", age=24, gender="FEMALE",
                     source=LeadSource.FACEBOOK.value, interested_treatment="Braces/Orthodontics",
                     budget=25000, status=LeadStatus.CONTACTED.value, lead_score=45, priority="MEDIUM",
                     next_follow_up_date=date.today() + timedelta(days=1),
                     created_at=datetime.now(timezone.utc) - timedelta(days=2)),
                Lead(id=LEAD_UUIDS[4], hospital_id=HOSPITAL_ID, assigned_staff_id=ADMIN_ID,
                     lead_name="Vikram Singh", mobile="6655443322",
                     source=LeadSource.REFERRAL.value, interested_treatment="General Checkup",
                     budget=2000, status=LeadStatus.NEW.value, lead_score=30,
                     created_at=datetime.now(timezone.utc) - timedelta(hours=6)),
            ]
            for l in leads_data:
                session.add(l)
            await session.flush()

            # 3 Campaigns
            campaigns_data = [
                Campaign(id=CAMPAIGN_UUIDS[0], hospital_id=HOSPITAL_ID, created_by=ADMIN_ID,
                         name="Summer Dental Checkup 2026", campaign_type=CampaignType.SEASONAL,
                         channel=CampaignChannel.WHATSAPP, target=CampaignTarget.ALL,
                         message="Get your summer dental checkup at 20% off!", status=CampaignStatus.ACTIVE,
                         start_date=date.today() - timedelta(days=5), end_date=date.today() + timedelta(days=25),
                         patients_targeted=120, messages_sent=98, messages_delivered=85,
                         messages_read=45, responses_count=12, appointments_generated=8,
                         revenue_generated=24000.0, is_active=True,
                         created_at=datetime.now(timezone.utc) - timedelta(days=5)),
                Campaign(id=CAMPAIGN_UUIDS[1], hospital_id=HOSPITAL_ID, created_by=ADMIN_ID,
                         name="Teeth Whitening Fest", campaign_type=CampaignType.PROMOTIONAL,
                         channel=CampaignChannel.WHATSAPP, target=CampaignTarget.ACTIVE,
                         message="Transform your smile! Teeth whitening at just ₹2999!", status=CampaignStatus.COMPLETED,
                         start_date=date.today() - timedelta(days=60), end_date=date.today() - timedelta(days=30),
                         patients_targeted=200, messages_sent=185, messages_delivered=160,
                         messages_read=92, responses_count=28, appointments_generated=15,
                         revenue_generated=45000.0, is_active=False,
                         created_at=datetime.now(timezone.utc) - timedelta(days=60)),
                Campaign(id=CAMPAIGN_UUIDS[2], hospital_id=HOSPITAL_ID, created_by=ADMIN_ID,
                         name="Implant Awareness Drive", campaign_type=CampaignType.AWARENESS,
                         channel=CampaignChannel.WHATSAPP, target=CampaignTarget.NOT_VISITED_6M,
                         message="Missing a tooth? Learn about our affordable implant options!", status=CampaignStatus.ACTIVE,
                         start_date=date.today() - timedelta(days=2), end_date=date.today() + timedelta(days=28),
                         patients_targeted=75, messages_sent=60, messages_delivered=55,
                         messages_read=30, responses_count=6, appointments_generated=3,
                         revenue_generated=9000.0, is_active=True,
                         created_at=datetime.now(timezone.utc) - timedelta(days=2)),
            ]
            for c_ in campaigns_data:
                session.add(c_)
            await session.flush()

            # 5 Enquiry follow-ups (follow-ups with OPEN/SCHEDULED status representing enquiries)
            today = date.today()
            fu_times = [time(9, 0), time(10, 30), time(11, 0), time(14, 0), time(15, 30), time(16, 0), time(9, 30), time(10, 0), time(11, 30), time(12, 0), time(13, 0), time(14, 30), time(15, 0)]
            enquiries_data = [
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[0],
                         case_id=CASE_UUIDS[0], follow_up_date=today + timedelta(days=1), follow_up_time=fu_times[0],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.SCHEDULED.value,
                         notes="Patient requesting follow-up on root canal sensitivity", created_at=datetime.now(timezone.utc)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[1],
                         case_id=CASE_UUIDS[1], follow_up_date=today + timedelta(days=2), follow_up_time=fu_times[1],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.SCHEDULED.value,
                         notes="Implant consultation follow-up requested", created_at=datetime.now(timezone.utc)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[2],
                         case_id=CASE_UUIDS[0], follow_up_date=today, follow_up_time=fu_times[2],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.OPEN.value,
                         notes="Post-treatment checkup - patient reported mild discomfort", created_at=datetime.now(timezone.utc) - timedelta(hours=4)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[3],
                         case_id=CASE_UUIDS[1], follow_up_date=today + timedelta(days=5), follow_up_time=fu_times[3],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.SCHEDULED.value,
                         notes="Payment plan discussion for implant procedure", created_at=datetime.now(timezone.utc)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[0],
                         case_id=CASE_UUIDS[0], follow_up_date=today - timedelta(days=1), follow_up_time=fu_times[4],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.OPEN.value,
                         notes="Missed appointment - reschedule requested", created_at=datetime.now(timezone.utc) - timedelta(days=1)),
            ]
            for e in enquiries_data:
                session.add(e)
            await session.flush()

            # 3 Completed follow-ups
            completed_data = [
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[0],
                         case_id=CASE_UUIDS[0], follow_up_date=today - timedelta(days=7), follow_up_time=fu_times[5],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.COMPLETED.value,
                         notes="Root canal completed successfully", treatment_name="Root Canal",
                         completed_date=datetime.now(timezone.utc) - timedelta(days=7), created_at=datetime.now(timezone.utc) - timedelta(days=8)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[1],
                         case_id=CASE_UUIDS[1], follow_up_date=today - timedelta(days=3), follow_up_time=fu_times[6],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.COMPLETED.value,
                         notes="Initial consultation done - implant plan discussed", treatment_name="Implant",
                         completed_date=datetime.now(timezone.utc) - timedelta(days=3), created_at=datetime.now(timezone.utc) - timedelta(days=5)),
                FollowUp(id=str(uuid.uuid4()), patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[2],
                         case_id=CASE_UUIDS[0], follow_up_date=today - timedelta(days=14), follow_up_time=fu_times[7],
                         follow_up_type=FollowUpType.MANUAL.value, status=FollowUpStatus.COMPLETED.value,
                         notes="Post-op checkup - healing well", treatment_name="Root Canal",
                         completed_date=datetime.now(timezone.utc) - timedelta(days=14), created_at=datetime.now(timezone.utc) - timedelta(days=15)),
            ]
            for f in completed_data:
                session.add(f)
            await session.flush()

            # Communication logs for WhatsApp analytics
            comm_data = [
                CommunicationLog(patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[0],
                                 channel=CommunicationChannel.WHATSAPP.value, message_type=MessageType.APPOINTMENT_CONFIRMATION.value,
                                 message="Your appointment has been confirmed for tomorrow at 10 AM.",
                                 status=CommunicationStatus.DELIVERED.value,
                                 sent_at=datetime.now(timezone.utc) - timedelta(hours=2), created_at=datetime.now(timezone.utc) - timedelta(hours=2)),
                CommunicationLog(patient_id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[1],
                                 channel=CommunicationChannel.WHATSAPP.value, message_type=MessageType.APPOINTMENT_REMINDER.value,
                                 message="Reminder: You have an appointment tomorrow at 11 AM with Dr. Eluru.",
                                 status=CommunicationStatus.SENT.value,
                                 sent_at=datetime.now(timezone.utc) - timedelta(hours=1), created_at=datetime.now(timezone.utc) - timedelta(hours=1)),
                CommunicationLog(patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[2],
                                 channel=CommunicationChannel.WHATSAPP.value, message_type=MessageType.FOLLOW_UP.value,
                                 message="How is your recovery going? Please let us know if you have any concerns.",
                                 status=CommunicationStatus.DELIVERED.value,
                                 sent_at=datetime.now(timezone.utc) - timedelta(days=1), created_at=datetime.now(timezone.utc) - timedelta(days=1)),
                CommunicationLog(patient_id=PATIENT_UUIDS[1], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[3],
                                 channel=CommunicationChannel.WHATSAPP.value, message_type=MessageType.GENERAL.value,
                                 message="Thank you for visiting Appointin! We hope to see you again.",
                                 status=CommunicationStatus.DELIVERED.value,
                                 sent_at=datetime.now(timezone.utc) - timedelta(hours=12), created_at=datetime.now(timezone.utc) - timedelta(hours=12)),
                CommunicationLog(patient_id=PATIENT_UUIDS[0], hospital_id=HOSPITAL_ID, doctor_id=DOCTOR_IDS[1],
                                 channel=CommunicationChannel.WHATSAPP.value, message_type=MessageType.PAYMENT_REMINDER.value,
                                 message="Your payment of ₹3,000 is due. Please pay at your earliest convenience.",
                                 status=CommunicationStatus.DELIVERED.value,
                                 sent_at=datetime.now(timezone.utc) - timedelta(days=2), created_at=datetime.now(timezone.utc) - timedelta(days=2)),
            ]
            for c in comm_data:
                session.add(c)

            await session.commit()
            print("Test CRM data seeded successfully!")
            print(f"  5 Leads created (statuses: CONVERTED, APPOINTMENT_BOOKED, INTERESTED, CONTACTED, NEW)")
            print(f"  3 Campaigns created (2 ACTIVE, 1 COMPLETED)")
            print(f"  2 Patients created (converted from leads)")
            print(f"  2 Cases created (for converted patients)")
            print(f"  2 Billings created (1 PAID, 1 PARTIAL)")
            print(f"  5 Enquiry follow-ups created (SCHEDULED/OPEN)")
            print(f"  3 Completed follow-ups created")
            print(f"  5 Communication logs created")

        except Exception as e:
            await session.rollback()
            print(f"Error seeding test data: {e}")
            raise

asyncio.run(seed())
