"""
pipeline.py
-----------
Thin orchestrator wiring layout_segmenter → llm_extractor together.

Usage
-----
    python pipeline.py claim_scan.png --debug-dir ./debug --output result.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from layout_segmenter import FormSegmenter
from llm_extractor import ClaimExtractor, ExtractedClaim


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_pipeline(
    image_path: str | Path,
    debug_dir: str | None = None,
    api_key: str | None = None,
) -> ExtractedClaim:
    logger.info("Step 1/2 — Layout segmentation + per-cell OCR")
    segmenter = FormSegmenter(image_path, debug_dir=debug_dir)
    cells = segmenter.run()

    # Build the cell_grid dict expected by ClaimExtractor
    cell_grid = {f"R{c.row}C{c.col}": c.text for c in cells if c.text.strip()}

    logger.info("Step 2/2 — LLM extraction over %d non-empty cells", len(cell_grid))
    extractor = ClaimExtractor(anthropic_api_key=api_key)
    claim = extractor.extract(cell_grid)

    if claim.needs_review:
        logger.warning(
            "Fields flagged for human review: %s", ", ".join(claim.needs_review)
        )
    return claim


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Medical claim extraction pipeline")
    ap.add_argument("image", help="Path to scanned claim form image")
    ap.add_argument("--debug-dir", default=None,
                    help="Save OpenCV debug images to this directory")
    ap.add_argument("--output", default=None,
                    help="Write JSON result to file (default: stdout)")
    ap.add_argument("--api-key", default=os.environ.get("ANTHROPIC_API_KEY"),
                    help="Anthropic API key (defaults to $ANTHROPIC_API_KEY)")
    args = ap.parse_args()

    claim = run_pipeline(args.image, debug_dir=args.debug_dir, api_key=args.api_key)

    result = {
        "patient_name":    claim.patient_name,
        "customer_id":     claim.customer_id,
        "date_of_birth":   claim.date_of_birth,
        "policy_number":   claim.policy_number,
        "diagnosis_code":  claim.diagnosis_code,
        "procedure_code":  claim.procedure_code,
        "treating_doctor": claim.treating_doctor,
        "hospital_name":   claim.hospital_name,
        "admission_date":  claim.admission_date,
        "discharge_date":  claim.discharge_date,
        "claim_amount":    claim.claim_amount,
        "confidence":      claim.confidence,
        "needs_review":    claim.needs_review,
    }

    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
        logger.info("Result written → %s", args.output)
    else:
        print(payload)
