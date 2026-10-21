"""Shared test fixtures. Clears the forced password-change gate for seeded users
so legacy (pre-gate) test suites can call gated endpoints. Production unaffected."""
import os
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ca_ai_test")


@pytest.fixture(scope="session", autouse=True)
def clear_password_change_gate():
    try:
        from pymongo import MongoClient
        client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=10)
        db = client[os.environ["DB_NAME"]]
        db.users.update_many({}, {"$set": {"must_change_password": False}})
        client.close()
    except Exception:
        pass  # tests that need a live server will fail on their own with a clear error
    yield
