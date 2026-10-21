"""Portable Gemini client — replaces the Emergent-platform `emergentintegrations` package.

Same minimal surface the app needs: a chat with system message + history that
returns plain text. Uses google-generativeai (public PyPI) with GEMINI_API_KEY.
"""
import logging
import os

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


class LlmChat:
    """Drop-in compatible with the old LlmChat usage in routes/ai.py."""

    def __init__(self, api_key=None, session_id=None, system_message=None, **kwargs):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.session_id = session_id
        self.system_message = system_message
        self._model = GEMINI_MODEL

    def with_model(self, provider: str, model: str):
        """Compat shim: old code called .with_model("gemini", "...")."""
        self._model = model
        return self

    async def send_message(self, message) -> str:
        text = getattr(message, "text", None) or str(message)
        if not self.api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured. Set it in backend/.env "
                "(free key: https://aistudio.google.com/apikey)."
            )
        # google-generativeai is sync; run in a thread so the event loop isn't blocked
        import asyncio
        return await asyncio.to_thread(self._send_sync, text)

    def _send_sync(self, text: str) -> str:
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            self._model,
            system_instruction=self.system_message,
        )
        result = model.generate_content(text)
        return result.text


class UserMessage:
    """Compat shim: old code constructed UserMessage(text=...)."""

    def __init__(self, text: str, name: str = "user"):
        self.text = text
        self.name = name
