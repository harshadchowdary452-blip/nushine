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

    async def send_message(self, to: str, message: str) -> bool:
        if self.provider == "twilio":
            return await self._send_twilio(to, message)
        elif self.provider == "meta":
            return await self._send_meta(to, message)
        else:
            return await self._send_mock(to, message)

    def generate_deep_link(self, phone: str, message: str = "") -> dict:
        return self.deeplink.generate_link(phone, message)

    async def _send_twilio(self, to: str, message: str) -> bool:
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            client.messages.create(body=message, from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}", to=f"whatsapp:{to}")
            return True
        except Exception:
            return False

    async def _send_meta(self, to: str, message: str) -> bool:
        return False

    async def _send_mock(self, to: str, message: str) -> bool:
        return True


whatsapp_provider = WhatsAppProvider()


async def send_appointment_reminder(phone: str, patient_name: str, appointment_date: str, appointment_time: str):
    message = f"Reminder: Dear {patient_name}, you have a dental appointment on {appointment_date} at {appointment_time}. Please arrive 15 minutes early. - NuShine Dental"
    return await whatsapp_provider.send_message(phone, message)


async def send_missed_appointment(phone: str, patient_name: str):
    message = f"Dear {patient_name}, you missed your dental appointment. Please reschedule at your earliest convenience. - NuShine Dental"
    return await whatsapp_provider.send_message(phone, message)


async def send_follow_up_reminder(phone: str, patient_name: str, next_date: str):
    message = f"Dear {patient_name}, this is a follow-up reminder for your next dental visit on {next_date}. - NuShine Dental"
    return await whatsapp_provider.send_message(phone, message)
