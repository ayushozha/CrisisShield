#
# Pharmacy mock backend for the VoiceShield Forge demo agent.
#
# Mirrors the structure of mock_backend.py (the flower-shop starter), but for a
# pharmacy refill / intake line. All lookups are mocked so the bot runs with
# nothing but AI-service keys. This is the file to edit to add patients,
# medications, or wire a real backend from inside the tool functions.
#
# Patients are keyed by (last_name.lower(), dob) where dob is ISO "YYYY-MM-DD".
# Known callers map an E.164 phone number to a patient key (Twilio from_number).
#

# Patient records. medications carry refill eligibility + remaining refills.
PATIENTS = {
    ("ojha", "1999-07-20"): {
        "name": "Ayush Ojha",
        "medications": [
            {"name": "metformin", "strength": "500mg", "refills_remaining": 2, "eligible": True},
            {"name": "lisinopril", "strength": "10mg", "refills_remaining": 0, "eligible": False},
        ],
    },
    ("smith", "1985-03-12"): {
        "name": "Jordan Smith",
        "medications": [
            {"name": "atorvastatin", "strength": "20mg", "refills_remaining": 3, "eligible": True},
        ],
    },
    ("nguyen", "1992-11-05"): {
        "name": "Kim Nguyen",
        "medications": [
            {"name": "amlodipine", "strength": "5mg", "refills_remaining": 1, "eligible": True},
            {"name": "levothyroxine", "strength": "75mcg", "refills_remaining": 2, "eligible": True},
        ],
    },
}

# Formulary used for medication confirmation + neighbor-confusion handling.
# "neighbors" are sound-alikes the ASR commonly confuses (drives the demo's
# medication-drift failure and the word-boost repair).
FORMULARY = {
    "metformin": {"class": "biguanide", "neighbors": ["metoprolol", "metronidazole"]},
    "metoprolol": {"class": "beta-blocker", "neighbors": ["metformin"]},
    "atorvastatin": {"class": "statin", "neighbors": ["atenolol", "rosuvastatin"]},
    "lisinopril": {"class": "ace-inhibitor", "neighbors": ["lisdexamfetamine"]},
    "amlodipine": {"class": "calcium-channel-blocker", "neighbors": ["amiodarone"]},
    "levothyroxine": {"class": "thyroid", "neighbors": ["levofloxacin"]},
}

# Add a number here to test the bot as a known caller (Twilio from_number).
KNOWN_CALLERS = {
    "+14155551234": ("ojha", "1999-07-20"),
    "+14155555678": ("smith", "1985-03-12"),
}


def find_patient(last_name: str, dob: str) -> dict | None:
    """Look up a patient by last name + DOB. Case-insensitive on last name."""
    return PATIENTS.get((last_name.strip().lower(), dob.strip()))


def normalize_medication(name: str) -> str | None:
    """Resolve a spoken medication name to a canonical formulary entry."""
    n = name.strip().lower()
    if n in FORMULARY:
        return n
    return None
