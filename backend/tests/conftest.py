"""Shared test fixtures. Clears the forced password-change gate for seeded users
so legacy (pre-gate) test suites can call gated endpoints. Production unaffected."""
import os
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ca_ai_test")

# The canonical shared partner credential every test file uses.
PARTNER_EMAIL = "srinivas.anup@gmail.com"
PARTNER_PASSWORD = "nn123456"


@pytest.fixture(scope="session", autouse=True)
def clean_test_environment():
    """Before the suite: (1) clear the forced password-change gate on seeded users;
    (2) re-pin the shared partner hash to the canonical password (self-healing when
    any other writer changed it); (3) purge test-generated tasks — repeated runs
    otherwise accumulate 200+ tasks and saturate the reminders cap, cutting off the
    reminders of newly created tasks. Local test DB only; production unaffected."""
    try:
        from pymongo import MongoClient
        client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=10)
        db = client[os.environ["DB_NAME"]]
        db.users.update_many({}, {"$set": {"must_change_password": False}})
        try:
            from core import hash_password
            db.users.update_one(
                {"email": PARTNER_EMAIL},
                {"$set": {"password": hash_password(PARTNER_PASSWORD)}})
        except Exception:
            pass
        db.tasks.delete_many({"title": {"$regex": r"^(TEST_|PROBE_|TEST\.)"}})
        client.close()
    except Exception:
        pass  # tests that need a live server will fail on their own with a clear error
    yield
