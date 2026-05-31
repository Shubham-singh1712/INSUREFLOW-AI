"""
llm_extractor.py
-----------------
Few-shot LLM prompt for extracting structured fields from messy,
column-merging Tesseract OCR output of medical claim forms.

Features
--------
- Few-shot examples that demonstrate fuzzy / garbled input handling
- Field-level confidence scoring instructions
- Explicit rules for handling merged columns (the core problem)
- Returns validated Pydantic model or raw dict fallback

Usage
-----
    from llm_extractor import ClaimExtractor

    raw_cells = {
        "R0C0": "BHIKAJI BABAN GOPALE CUSTOMER ID ME",
        "R1C0": "DOB 12/08/197 POLICY NO 4521873B",
        ...
    }
    extractor = ClaimExtractor()
    claim = extractor.extract(raw_cells)
    print(claim)
"""

from __future__ import annotations

import json
import logging
import re
import textwrap
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schema (mirrors what you want the LLM to return)
# ---------------------------------------------------------------------------

@dataclass
class ExtractedClaim:
    patient_name: str = ""
    customer_id: str = ""
    date_of_birth: str = ""
    policy_number: str = ""
    diagnosis_code: str = ""
    procedure_code: str = ""
    treating_doctor: str = ""
    hospital_name: str = ""
    admission_date: str = ""
    discharge_date: str = ""
    claim_amount: str = ""
    # confidence: per-field score 0-1 assigned by the LLM
    confidence: dict[str, float] = field(default_factory=dict)
    # fields the LLM flagged as needing human review
    needs_review: list[str] = field(default_factory=list)
    # the raw LLM JSON string for audit
    raw_llm_response: str = ""


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = textwrap.dedent("""\
You are a medical claims data extraction specialist. You receive RAW TEXT
produced by Tesseract OCR from scanned Indian health insurance claim forms.
Tesseract often reads across columns, producing merged garbage such as
"BHIKAJI BABAN GOPALE CUSTOMER ID ME" instead of keeping the patient name
and the customer-ID label in separate fields.

YOUR JOB: untangle those merges, apply fuzzy / pattern-based reasoning, and
return a clean JSON object with the fields listed below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIELDS TO EXTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
patient_name      Full name of the insured patient (Title Case)
customer_id       Alphanumeric policy-holder ID (often 6-12 chars)
date_of_birth     DD/MM/YYYY or DD-MM-YYYY
policy_number     Insurer's policy number
diagnosis_code    ICD-10 code (letter + digits, e.g. J18.0)
procedure_code    NABH / CPT procedure code
treating_doctor   Name of treating physician (Dr. Prefix common)
hospital_name     Full hospital / clinic name
admission_date    DD/MM/YYYY
discharge_date    DD/MM/YYYY
claim_amount      Numeric amount in INR (digits only, no commas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. COLUMN MERGE DETECTION
   Look for field-label keywords embedded inside what appears to be a
   value string. Keywords include (case-insensitive):
     CUSTOMER ID, POLICY NO, DOB, DATE OF BIRTH, DR., HOSPITAL,
     DIAGNOSIS, PROCEDURE, ADMISSION, DISCHARGE, AMOUNT, CLAIM
   When you find a label inside a value, split on that label:
     • Everything BEFORE the label → belongs to the preceding field.
     • Everything AFTER the label → belongs to the new field.

2. NAME RECONSTRUCTION
   Patient names in Indian forms follow:
     SURNAME GIVEN_NAME [FATHER/HUSBAND_NAME]
   Names consist of 2–4 ALL-CAPS words. If a name string is immediately
   followed by a field label, everything before the label is the name.

3. DATE NORMALISATION
   Accept D/M/YY, DD-MM-YYYY, DD.MM.YYYY, DDMMYYYY, etc.
   Always output as DD/MM/YYYY. If only partial (e.g. "12/08/197"),
   attempt reconstruction using context; mark confidence ≤ 0.5.

4. ICD-10 / PROCEDURE CODES
   Codes match: [A-Z][0-9]{2}(\.[0-9]{1,2})?
   Procedure codes are purely numeric or alphanumeric 4-6 chars.
   Extract directly; do NOT infer if absent.

5. AMOUNTS
   Strip Rs., INR, ₹, commas, spaces. Output plain integer string.
   Example: "Rs. 1,24,500/-" → "124500"

6. CONFIDENCE SCORING
   For every field, include a confidence score 0.0–1.0:
     1.0 = extracted from clean, unambiguous text
     0.7 = reconstructed from a merge split, likely correct
     0.5 = partial / inferred value, may need review
     0.0 = not found or cannot be determined

7. NEEDS REVIEW
   List field names where confidence < 0.7 in the "needs_review" array.

8. MISSING VALUES
   Use empty string "" — never "null", "N/A", or invented data.

9. OUTPUT FORMAT
   Return ONLY a valid JSON object. No markdown fences, no commentary.
""")


# 3 few-shot examples that demonstrate the merge-splitting logic
FEW_SHOT_EXAMPLES: list[dict] = [
    {
        "role": "user",
        "content": textwrap.dedent("""\
            CELL GRID (row × col → OCR text):
            R0C0: BHIKAJI BABAN GOPALE CUSTOMER ID ME
            R0C1: MB-00456721 DOB 12/08/1972
            R1C0: POLICY NO 4521873-B BAJAJ ALLIANZ
            R1C1: NANAVATI SUPER SPECIALITY HOSPITAL MU
            R2C0: DIAGNOSIS J18.0 PNEUMONIA PROC 99213
            R2C1: ADMISSION 03/04/2024 DISCHARGE 10/04/2024
            R3C0: TOTAL CLAIM AMOUNT Rs. 1,24,500/-
            R3C1: DR. SUNITA RAJAN MD PULMONOLOGY
        """),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "patient_name": "Bhikaji Baban Gopale",
            "customer_id": "MB-00456721",
            "date_of_birth": "12/08/1972",
            "policy_number": "4521873-B",
            "diagnosis_code": "J18.0",
            "procedure_code": "99213",
            "treating_doctor": "Dr. Sunita Rajan",
            "hospital_name": "Nanavati Super Speciality Hospital",
            "admission_date": "03/04/2024",
            "discharge_date": "10/04/2024",
            "claim_amount": "124500",
            "confidence": {
                "patient_name": 0.7,
                "customer_id": 0.7,
                "date_of_birth": 1.0,
                "policy_number": 1.0,
                "diagnosis_code": 1.0,
                "procedure_code": 1.0,
                "treating_doctor": 0.9,
                "hospital_name": 0.7,
                "admission_date": 1.0,
                "discharge_date": 1.0,
                "claim_amount": 1.0,
            },
            "needs_review": ["patient_name", "customer_id", "hospital_name"],
        }, indent=2),
    },
    # --- Example 2: heavily garbled with partial dates ---
    {
        "role": "user",
        "content": textwrap.dedent("""\
            CELL GRID (row × col → OCR text):
            R0C0: RAMESH KUMAR VERMA CUST lD RKV-9981
            R0C1: D0B 07/1 1/198 POLICYNO 88-ZZ-4432
            R1C0: HOSPITA APOLLO DELHI ADMN 15/06/2023
            R1C1: DISCH 22/06/2023 AMT INR 87OOO
            R2C0: DX Z87.39 DR ANIL MEHTA CARDIOLOG
            R2C1: PROC 93458
        """),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "patient_name": "Ramesh Kumar Verma",
            "customer_id": "RKV-9981",
            # D0B has a zero-for-O OCR error; 11 is split across "1 1";
            # year "198" is partial — flag it
            "date_of_birth": "07/11/198?",
            "policy_number": "88-ZZ-4432",
            "diagnosis_code": "Z87.39",
            "procedure_code": "93458",
            "treating_doctor": "Dr. Anil Mehta",
            "hospital_name": "Apollo Delhi",
            "admission_date": "15/06/2023",
            "discharge_date": "22/06/2023",
            # 87OOO → O is OCR for 0
            "claim_amount": "87000",
            "confidence": {
                "patient_name": 0.7,
                "customer_id": 0.7,
                "date_of_birth": 0.4,
                "policy_number": 1.0,
                "diagnosis_code": 1.0,
                "procedure_code": 1.0,
                "treating_doctor": 0.8,
                "hospital_name": 0.7,
                "admission_date": 1.0,
                "discharge_date": 1.0,
                "claim_amount": 0.7,
            },
            "needs_review": [
                "patient_name", "customer_id", "date_of_birth",
                "hospital_name", "claim_amount",
            ],
        }, indent=2),
    },
    # --- Example 3: mostly clean cells, one merge ---
    {
        "role": "user",
        "content": textwrap.dedent("""\
            CELL GRID (row × col → OCR text):
            R0C0: PRIYA SHANKAR MENON
            R0C1: CUST ID PS-771234
            R1C0: DOB 22/03/1985
            R1C1: POLICY NO HDFC-2024-88812
            R2C0: DIAGNOSIS E11.9 PROC 99214 DR. KAVITA PILLAI
            R2C1: HOLY FAMILY HOSPITAL
            R3C0: ADM 01/01/2024  DIS 05/01/2024
            R3C1: CLAIM AMT 45000
        """),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "patient_name": "Priya Shankar Menon",
            "customer_id": "PS-771234",
            "date_of_birth": "22/03/1985",
            "policy_number": "HDFC-2024-88812",
            "diagnosis_code": "E11.9",
            "procedure_code": "99214",
            "treating_doctor": "Dr. Kavita Pillai",
            "hospital_name": "Holy Family Hospital",
            "admission_date": "01/01/2024",
            "discharge_date": "05/01/2024",
            "claim_amount": "45000",
            "confidence": {
                "patient_name": 1.0,
                "customer_id": 1.0,
                "date_of_birth": 1.0,
                "policy_number": 1.0,
                "diagnosis_code": 1.0,
                "procedure_code": 1.0,
                "treating_doctor": 0.7,
                "hospital_name": 1.0,
                "admission_date": 1.0,
                "discharge_date": 1.0,
                "claim_amount": 1.0,
            },
            "needs_review": ["treating_doctor"],
        }, indent=2),
    },
]


def build_messages(cell_grid: dict[str, str]) -> list[dict]:
    """
    Assembles the full message list:
      system prompt → few-shot pairs → live user turn
    """
    grid_text = "\n".join(f"{k}: {v}" for k, v in sorted(cell_grid.items()))
    user_turn = f"CELL GRID (row × col → OCR text):\n{grid_text}"

    messages = list(FEW_SHOT_EXAMPLES)  # copy the shots
    messages.append({"role": "user", "content": user_turn})
    return messages


# ---------------------------------------------------------------------------
# Extractor
# ---------------------------------------------------------------------------

class ClaimExtractor:
    """
    Wraps the prompt builder and calls the Anthropic API.

    Parameters
    ----------
    model : str
        Anthropic model string. Claude 3 Sonnet is recommended for this task
        (good JSON reliability + cost efficiency).
    max_tokens : int
        Upper bound for the completion. 1 024 is plenty for a single claim.
    """

    DEFAULT_MODEL = "claude-sonnet-4-20250514"
    DEFAULT_MAX_TOKENS = 1024

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        anthropic_api_key: str | None = None,
    ):
        # MODIFIED
        import os # MODIFIED
        self.api_key = anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENROUTER_API_KEY") # MODIFIED
        self.model = model # MODIFIED
        self.max_tokens = max_tokens # MODIFIED
        self._client = None # MODIFIED
        try: # MODIFIED
            import anthropic # MODIFIED
            if self.api_key and not self.api_key.startswith("sk-or-"): # MODIFIED
                self._client = anthropic.Anthropic(api_key=self.api_key) # MODIFIED
        except ImportError: # MODIFIED
            logger.info("anthropic package not installed. Standard SDK will be bypassed.") # MODIFIED

    def extract(self, cell_grid: dict[str, str]) -> ExtractedClaim:
        """
        Parameters
        ----------
        cell_grid : dict[str, str]
            Keys like "R0C0", "R1C2", etc. → raw OCR text for that cell.

        Returns
        -------
        ExtractedClaim
        """
        import os # MODIFIED
        messages = build_messages(cell_grid)
        logger.info("Sending %d cells to LLM (%s)", len(cell_grid), self.model)

        api_key = self.api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENROUTER_API_KEY") # MODIFIED
        if not api_key: # MODIFIED
            raise ValueError("No API key found in ANTHROPIC_API_KEY or OPENROUTER_API_KEY environment variables.") # MODIFIED

        use_openrouter = api_key.startswith("sk-or-") or os.environ.get("OPENROUTER_API_KEY") is not None # MODIFIED
        raw = "" # MODIFIED

        if use_openrouter: # MODIFIED
            logger.info("Using OpenRouter direct urllib call") # MODIFIED
            raw = self._call_openrouter(messages, api_key) # MODIFIED
        elif self._client is not None: # MODIFIED
            try: # MODIFIED
                response = self._client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=SYSTEM_PROMPT,
                    messages=messages,
                )
                raw = response.content[0].text
            except Exception as e: # MODIFIED
                logger.warning("Anthropic SDK call failed: %s. Trying direct urllib fallback.", e) # MODIFIED
                raw = self._call_anthropic_direct(messages, api_key) # MODIFIED
        else: # MODIFIED
            logger.info("Using Anthropic direct urllib call (no SDK)") # MODIFIED
            raw = self._call_anthropic_direct(messages, api_key) # MODIFIED

        logger.debug("LLM raw response:\n%s", raw)
        return self._parse(raw)

    def _call_openrouter(self, messages: list[dict], api_key: str) -> str: # MODIFIED
        import urllib.request # MODIFIED
        import urllib.error # MODIFIED
        import os # MODIFIED
        url = "https://openrouter.ai/api/v1/chat/completions" # MODIFIED
        formatted_messages = [{"role": "system", "content": SYSTEM_PROMPT}] # MODIFIED
        for m in messages: # MODIFIED
            formatted_messages.append({"role": m["role"], "content": m["content"]}) # MODIFIED
        model = os.environ.get("OPENROUTER_MODEL") or "anthropic/claude-3-sonnet:beta" # MODIFIED
        payload = { # MODIFIED
            "model": model, # MODIFIED
            "messages": formatted_messages, # MODIFIED
            "max_tokens": self.max_tokens, # MODIFIED
        } # MODIFIED
        req = urllib.request.Request( # MODIFIED
            url, # MODIFIED
            data=json.dumps(payload).encode("utf-8"), # MODIFIED
            headers={ # MODIFIED
                "Content-Type": "application/json", # MODIFIED
                "Authorization": f"Bearer {api_key}", # MODIFIED
                "HTTP-Referer": "https://insureflowai.com", # MODIFIED
                "X-Title": "InsureFlow AI", # MODIFIED
            }, # MODIFIED
            method="POST" # MODIFIED
        ) # MODIFIED
        try: # MODIFIED
            with urllib.request.urlopen(req, timeout=60) as response: # MODIFIED
                res_data = json.loads(response.read().decode("utf-8")) # MODIFIED
                return res_data["choices"][0]["message"]["content"] # MODIFIED
        except urllib.error.HTTPError as e: # MODIFIED
            err_body = e.read().decode("utf-8") # MODIFIED
            logger.error("OpenRouter HTTP Error %d: %s", e.code, err_body) # MODIFIED
            raise RuntimeError(f"OpenRouter call failed: {e.code} - {err_body}") # MODIFIED
        except Exception as e: # MODIFIED
            logger.error("OpenRouter connection failed: %s", e) # MODIFIED
            raise RuntimeError(f"OpenRouter connection failed: {e}") # MODIFIED

    def _call_anthropic_direct(self, messages: list[dict], api_key: str) -> str: # MODIFIED
        import urllib.request # MODIFIED
        import urllib.error # MODIFIED
        url = "https://api.anthropic.com/v1/messages" # MODIFIED
        payload = { # MODIFIED
            "model": self.model, # MODIFIED
            "system": SYSTEM_PROMPT, # MODIFIED
            "messages": messages, # MODIFIED
            "max_tokens": self.max_tokens, # MODIFIED
        } # MODIFIED
        req = urllib.request.Request( # MODIFIED
            url, # MODIFIED
            data=json.dumps(payload).encode("utf-8"), # MODIFIED
            headers={ # MODIFIED
                "Content-Type": "application/json", # MODIFIED
                "x-api-key": api_key, # MODIFIED
                "anthropic-version": "2023-06-01", # MODIFIED
            }, # MODIFIED
            method="POST" # MODIFIED
        ) # MODIFIED
        try: # MODIFIED
            with urllib.request.urlopen(req, timeout=60) as response: # MODIFIED
                res_data = json.loads(response.read().decode("utf-8")) # MODIFIED
                return res_data["content"][0]["text"] # MODIFIED
        except urllib.error.HTTPError as e: # MODIFIED
            err_body = e.read().decode("utf-8") # MODIFIED
            logger.error("Anthropic Direct HTTP Error %d: %s", e.code, err_body) # MODIFIED
            raise RuntimeError(f"Anthropic Direct call failed: {e.code} - {err_body}") # MODIFIED
        except Exception as e: # MODIFIED
            logger.error("Anthropic Direct connection failed: %s", e) # MODIFIED
            raise RuntimeError(f"Anthropic Direct connection failed: {e}") # MODIFIED

    # ------------------------------------------------------------------

    @staticmethod
    def _parse(raw: str) -> ExtractedClaim:
        """Parse the LLM JSON response into an ExtractedClaim."""
        # strip accidental markdown fences
        cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            data: dict[str, Any] = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error("JSON parse failed: %s\nRaw:\n%s", exc, raw)
            return ExtractedClaim(raw_llm_response=raw)

        scalar_fields = [
            "patient_name", "customer_id", "date_of_birth", "policy_number",
            "diagnosis_code", "procedure_code", "treating_doctor",
            "hospital_name", "admission_date", "discharge_date", "claim_amount",
        ]
        kwargs: dict[str, Any] = {"raw_llm_response": raw}
        for f in scalar_fields:
            kwargs[f] = str(data.get(f, ""))
        kwargs["confidence"] = data.get("confidence", {})
        kwargs["needs_review"] = data.get("needs_review", [])
        return ExtractedClaim(**kwargs)


# ---------------------------------------------------------------------------
# Standalone demo (no API key needed — prints the prompt only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(message)s")

    sample_grid = {
        "R0C0": "BHIKAJI BABAN GOPALE CUSTOMER ID ME",
        "R0C1": "MB-00456721 DOB 12/08/1972",
        "R1C0": "POLICY NO 4521873-B BAJAJ ALLIANZ",
        "R1C1": "NANAVATI SUPER SPECIALITY HOSPITAL MU",
        "R2C0": "DIAGNOSIS J18.0 PNEUMONIA PROC 99213",
        "R2C1": "ADMISSION 03/04/2024 DISCHARGE 10/04/2024",
        "R3C0": "TOTAL CLAIM AMOUNT Rs. 1,24,500/-",
        "R3C1": "DR. SUNITA RAJAN MD PULMONOLOGY",
    }

    print("=" * 60)
    print("SYSTEM PROMPT")
    print("=" * 60)
    print(SYSTEM_PROMPT)
    print()
    print("=" * 60)
    print("USER TURN (live cells)")
    print("=" * 60)
    msgs = build_messages(sample_grid)
    print(msgs[-1]["content"])
    print()
    print("(Set ANTHROPIC_API_KEY and call ClaimExtractor().extract(sample_grid)"
          " to get the live extraction.)")
