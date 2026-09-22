import os
import time
from typing import Any, Dict, Optional
from dotenv import load_dotenv
import requests

load_dotenv()


class TypeSafeClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout_sec: float = 10.0,
    ):
        self.api_key = (
            api_key if api_key is not None else os.getenv("TYPESAFE_API_KEY", "")
        )
        self.base_url = base_url or "https://api.typesafe.ai/v1/systemone"
        self.default_model = model or "jev-latest"
        self.timeout_sec = timeout_sec

        if not self.has_api_key():
            # Will trigger Needle fallback automatically
            pass

    def has_api_key(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    @staticmethod
    def choice(criteria: Dict[str, str]) -> Dict[str, Any]:
        return {"type": "choice", "criteria": criteria}

    @staticmethod
    def noul(instructions: str) -> Dict[str, Any]:
        return {"type": "noul", "instructions": instructions}

    @staticmethod
    def score(levels: Dict[str, str]) -> Dict[str, Any]:
        return {"type": "score", "levels": levels}

    def system_one(
        self,
        state: Dict[str, Any],
        questions: Dict[str, Any],
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        start_time = time.time()
        payload = {
            "model": model or self.default_model,
            "state": state,
            "questions": questions,
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        resp = requests.post(
            self.base_url,
            json=payload,
            headers=headers,
            timeout=self.timeout_sec,
        )
        latency_ms = round((time.time() - start_time) * 1000, 2)

        if not resp.ok:
            raise RuntimeError(
                f"TypeSafe Jev API error ({resp.status_code}): {resp.text}"
            )

        return {"response": resp.json(), "latency_ms": latency_ms}
