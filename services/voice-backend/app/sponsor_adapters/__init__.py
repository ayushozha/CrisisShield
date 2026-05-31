"""
VoiceShield Forge — sponsor adapters.

Every sponsor (Daily, Pipecat, Cekura, Twilio, NVIDIA, AWS) is reached ONLY
through an adapter that implements the uniform mode contract in base.py. The
harness never special-cases a sponsor: it asks each adapter to `run()` and gets
back the same AdapterContract shape. Live and fixture differ only inside the
adapter, never in the product code path (spec.md §2, §7).
"""

from .aws_adapter import AwsAdapter
from .base import AdapterContext, SponsorAdapter
from .cekura_adapter import CekuraAdapter
from .daily_adapter import DailyAdapter
from .nvidia_adapter import NvidiaAdapter
from .pipecat_adapter import PipecatAdapter
from .twilio_adapter import TwilioAdapter

# The mandatory sponsor set. The smoke harness FAILS if any of these is absent
# (spec.md §7: "the final harness command must fail if any sponsor adapter is
# absent").
REQUIRED_SPONSORS = ["daily", "pipecat", "cekura", "twilio", "nvidia", "aws"]


def build_adapters() -> dict[str, SponsorAdapter]:
    return {
        "daily": DailyAdapter(),
        "pipecat": PipecatAdapter(),
        "cekura": CekuraAdapter(),
        "twilio": TwilioAdapter(),
        "nvidia": NvidiaAdapter(),
        "aws": AwsAdapter(),
    }


__all__ = [
    "AdapterContext",
    "SponsorAdapter",
    "AwsAdapter",
    "CekuraAdapter",
    "DailyAdapter",
    "NvidiaAdapter",
    "PipecatAdapter",
    "TwilioAdapter",
    "REQUIRED_SPONSORS",
    "build_adapters",
]
