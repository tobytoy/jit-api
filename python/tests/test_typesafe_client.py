import pytest
from jit_api.typesafe_client import TypeSafeClient


def test_typesafe_client_instantiation():
    client = TypeSafeClient(api_key="test_key")
    assert client.has_api_key() is True

    client_empty = TypeSafeClient(api_key="")
    assert client_empty.has_api_key() is False


def test_question_formulation():
    q_choice = TypeSafeClient.choice({"opt1": "Option 1", "opt2": "Option 2"})
    assert q_choice["type"] == "choice"
    assert q_choice["criteria"]["opt1"] == "Option 1"

    q_noul = TypeSafeClient.noul("Guardrail instructions")
    assert q_noul["type"] == "noul"

    q_score = TypeSafeClient.score({"1": "Low", "5": "High"})
    assert q_score["type"] == "score"


def test_live_typesafe_api_call():
    client = TypeSafeClient()
    if not client.has_api_key():
        pytest.skip("No TYPESAFE_API_KEY available for live test")

    res = client.system_one(
        state={"text": "I want to bill an invoice for 500 dollars"},
        questions={
            "intent": TypeSafeClient.choice(
                {
                    "create_invoice": "Generate, issue or bill invoice",
                    "check_status": "Check shipment or tracking status",
                }
            )
        },
    )

    assert "response" in res
    assert "answers" in res["response"]
    assert res["response"]["answers"]["intent"]["type"] == "choice"
    assert res["response"]["answers"]["intent"]["choice"] == "create_invoice"
