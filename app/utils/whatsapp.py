from typing import Optional
from urllib.parse import quote
from app.config import settings


class DeepLinkProvider:
    def generate_link(self, phone: str, message: str = "") -> str:
        clean = phone.replace("+", "").replace(" ", "").replace("-", "")
        if not clean.startswith("1") and not clean.startswith("91"):
            if not clean.startswith("1") and len(clean) == 10:
                clean = "91" + clean
        encoded = quote(message)
        wa_link = f"https://wa.me/{clean}?text={encoded}" if message else f"https://wa.me/{clean}"
        web_link = f"https://web.whatsapp.com/send?phone={clean}&text={encoded}" if message else f"https://web.whatsapp.com/send?phone={clean}"
        return {"wa_link": wa_link, "web_link": web_link, "phone": clean}

    async def send_message(self, to: str, message: str) -> bool:
        return True


class WhatsAppProvider:
    def __init__(self):
        self.provider = settings.WHATSAPP_PROVIDER
        self.deeplink = DeepLinkProvider()
        self._twilio_client = None

    async def send_message(self, to: str, message: str) -> bool:
        if self.provider == "twilio":
            return await self._send_twilio(to, message)
        elif self.provider == "meta":
            return await self._send_meta(to, message)
        else:
            return await self._send_mock(to, message)

    def generate_deep_link(self, phone: str, message: str = "") -> dict:
        return self.deeplink.generate_link(phone, message)

    def _get_twilio_client(self):
        if self._twilio_client is None:
            from twilio.rest import Client
            self._twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        return self._twilio_client

    async def _send_twilio(self, to: str, message: str) -> bool:
        try:
            client = self._get_twilio_client()
            client.messages.create(body=message, from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}", to=f"whatsapp:{to}")
            return True
        except Exception:
            return False

    async def _send_meta(self, to: str, message: str) -> bool:
        return False

    async def _send_mock(self, to: str, message: str) -> bool:
        return True


whatsapp_provider = WhatsAppProvider()


def _brand(hospital_name: Optional[str] = None) -> str:
    name = hospital_name or "Appointin"
    return f"Warm Regards,\n{name}\nPatient Care Team | 9704702601"


async def send_appointment_reminder(phone: str, patient_name: str, appointment_date: str, appointment_time: str, hospital_name: Optional[str] = None, doctor_name: Optional[str] = None):
    doctor_line = f" with Dr. {doctor_name}" if doctor_name else ""
    message = (
        f"Dear {patient_name},\n\n"
        f"This is a friendly reminder about your upcoming dental appointment{doctor_line} on {appointment_date} at {appointment_time}.\n\n"
        f"Please arrive 15 minutes early for a smooth experience. If you need to reschedule, kindly inform us in advance.\n\n"
        f"{_brand(hospital_name)}"
    )
    return await whatsapp_provider.send_message(phone, message)


async def send_missed_appointment(phone: str, patient_name: str, hospital_name: Optional[str] = None):
    message = (
        f"Dear {patient_name},\n\n"
        f"We noticed you missed your recent dental appointment. Your health is important to us, so please call us to reschedule at your earliest convenience.\n\n"
        f"{_brand(hospital_name)}"
    )
    return await whatsapp_provider.send_message(phone, message)


async def send_follow_up_reminder(phone: str, patient_name: str, next_date: str, hospital_name: Optional[str] = None, doctor_name: Optional[str] = None):
    doctor_line = f" with Dr. {doctor_name}" if doctor_name else ""
    message = (
        f"Dear {patient_name},\n\n"
        f"This is a gentle follow-up reminder for your next dental visit{doctor_line} on {next_date}. Please confirm your appointment with us.\n\n"
        f"{_brand(hospital_name)}"
    )
    return await whatsapp_provider.send_message(phone, message)
