"""
NVIDIA adapter — model / ASR / guardrail repair target (spec.md §4, §8).

Emits Riva/NIM/NeMo-compatible repair artifacts:
  * Riva ASR word boost  -> RecognitionConfig.speech_contexts (phrases + boost),
    the runtime customization surface confirmed in the Riva ASR docs.
  * NeMo Guardrails config -> config.yml (models/rails/prompts) + Colang flows.
  * model routing metadata -> which NIM model serves ASR/LLM/TTS.

Live mode queries the NIM endpoint for model metadata; fixture mode produces
the identically-shaped artifact so the repair pack is real either way.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from ..config import credential_state
from ..models import CredentialState
from .base import AdapterContext, SponsorAdapter

# Default domain vocabulary for the pharmacy-refill scenario. The compiler can
# extend this from observed entity drift.
DEFAULT_BOOST_TERMS = [
    "Ojha",
    "metformin",
    "atorvastatin",
    "lisinopril",
    "amlodipine",
    "levothyroxine",
]


class NvidiaAdapter(SponsorAdapter):
    sponsor = "nvidia"

    def credential_vars(self) -> list[str]:
        return ["NVIDIA_API_KEY", "NVIDIA_NIM_BASE_URL"]

    def credential_state(self) -> CredentialState:
        """Accept either the generic NVIDIA NIM pair or the Nemotron voice pair."""
        states = [
            credential_state("NVIDIA_API_KEY", "NVIDIA_NIM_BASE_URL"),
            credential_state("NVIDIA_API_KEY", "NEMOTRON_LLM_URL"),
            credential_state("NEMOTRON_LLM_API_KEY", "NEMOTRON_LLM_URL"),
        ]
        if CredentialState.present in states:
            return CredentialState.present
        if all(state == CredentialState.missing for state in states):
            return CredentialState.missing
        return CredentialState.placeholder

    def _api_key(self) -> str:
        return os.getenv("NVIDIA_API_KEY") or os.getenv("NEMOTRON_LLM_API_KEY") or "EMPTY"

    def _base_url(self) -> str:
        return (
            os.getenv("NVIDIA_NIM_BASE_URL")
            or os.getenv("NEMOTRON_LLM_URL")
            or "http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1"
        ).rstrip("/")

    @staticmethod
    def _models_url(base: str) -> str:
        return f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"

    # ── artifact compiler (used by run_demo / repair compiler) ────────────────
    def compile_artifacts(
        self,
        terms: Optional[list[str]] = None,
        guardrail_rules: Optional[list[str]] = None,
        tool_gates: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        terms = terms or DEFAULT_BOOST_TERMS
        guardrail_rules = guardrail_rules or [
            "block patient_lookup until identity is confirmed",
            "require medication confirmation before refill routing",
        ]
        asr_model = os.getenv("NVIDIA_NEMOTRON_STREAMING_ASR_MODEL", "nvidia/parakeet-ctc-1.1b-asr")
        llm_model = os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super")
        tts_model = os.getenv("NVIDIA_MAGPIE_TTS_MODEL", "nvidia/magpie_tts_multilingual_357m")
        riva_word_boost = {
            "format": "riva_recognition_config.speech_contexts",
            "speech_contexts": [{"phrases": terms, "boost": 80.0}],
            "note": "Riva runtime word boost; boost range 20-100, sent per request.",
        }
        nemo_guardrail = {
            "format": "nemo_guardrails_config",
            "config_yml": {
                "models": [{"type": "main", "engine": "nim", "model": llm_model}],
                "rails": {
                    "input": {"flows": ["self check input", "pharmacy identity gate"]},
                    "output": {"flows": ["self check output", "no unsafe medical advice"]},
                },
                "prompts": [
                    {
                        "task": "pharmacy_identity_gate",
                        "content": "Refuse any patient_lookup or refill action until "
                        "last name, DOB, and medication are explicitly confirmed.",
                    }
                ],
            },
            "colang": {
                "define flow pharmacy identity gate": [
                    "user request refill",
                    "if not $identity_confirmed",
                    '  bot "Before I continue, can I confirm your last name spelling?"',
                ]
            },
            "rules": guardrail_rules,
        }
        return {
            "artifact_type": "riva_asr_word_boost_and_nemo_guardrail_patch",
            "riva_asr_word_boost": riva_word_boost,
            "nemo_guardrail": nemo_guardrail,
            "tool_gates": tool_gates or [],
            "model_routing": {
                "asr": f"{asr_model} (streaming ASR)",
                "llm": f"{llm_model} (Nemotron/vLLM)",
                "tts": f"{tts_model} (reference TTS model)",
            },
        }

    # ── fixture ───────────────────────────────────────────────────────────────
    def run_fixture(self, ctx: AdapterContext) -> dict[str, Any]:
        terms = ctx.payload.get("boost_terms")
        artifact = self.compile_artifacts(terms=terms)
        return {
            "mode_detail": "nvidia-compatible artifact generated offline",
            "artifact_type": artifact["artifact_type"],
            "artifact_path": f"demo/repair-packs/{ctx.run_id}/nvidia-repair.json",
            "riva_speech_contexts": artifact["riva_asr_word_boost"]["speech_contexts"],
            "nemo_rails": artifact["nemo_guardrail"]["config_yml"]["rails"],
            "model_routing": artifact["model_routing"],
            "artifact": artifact,
        }

    # ── live ───────────────────────────────────────────────────────────────────
    def run_live(self, ctx: AdapterContext) -> dict[str, Any]:
        api_key = self._api_key()
        base = self._base_url()
        # Confirm the NIM endpoint is reachable and list available models.
        resp = httpx.get(
            self._models_url(base),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15.0,
        )
        resp.raise_for_status()
        models = resp.json()
        terms = ctx.payload.get("boost_terms")
        artifact = self.compile_artifacts(terms=terms)
        return {
            "mode_detail": "nvidia NIM endpoint reachable; artifact generated",
            "artifact_type": artifact["artifact_type"],
            "artifact_path": f"demo/repair-packs/{ctx.run_id}/nvidia-repair.json",
            "riva_endpoint": os.getenv("NVIDIA_RIVA_ENDPOINT", ""),
            "available_models": models.get("data", models),
            "model_routing": artifact["model_routing"],
            "artifact": artifact,
        }
