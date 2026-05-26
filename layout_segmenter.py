"""
layout_segmenter.py
--------------------
OpenCV-based layout segmentation for structured medical claim forms.

Pipeline:
  1. Pre-process image (deskew, denoise, binarise)
  2. Detect horizontal + vertical ruling lines
  3. Reconstruct the grid of cells from those lines
  4. Crop each cell and hand it to Tesseract individually
  5. Return a dict[label -> text] ready for the LLM extraction step

Usage:
    from layout_segmenter import FormSegmenter

    seg = FormSegmenter("claim_scan.png")
    cells = seg.run()           # list[CellResult]
    for c in cells:
        print(c.row, c.col, repr(c.text))
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class CellRegion:
    """A bounding box for one detected form cell (in pixel coords)."""
    x: int
    y: int
    w: int
    h: int
    row: int = 0
    col: int = 0

    @property
    def slice(self):
        return slice(self.y, self.y + self.h), slice(self.x, self.x + self.w)

    @property
    def area(self) -> int:
        return self.w * self.h


@dataclass
class CellResult:
    """OCR result for one cell."""
    row: int
    col: int
    x: int
    y: int
    w: int
    h: int
    text: str
    confidence: float           # mean Tesseract word-level confidence 0-100
    psm_used: int
    raw_data: dict = field(default_factory=dict)   # full pytesseract df row


# ---------------------------------------------------------------------------
# Pre-processing helpers
# ---------------------------------------------------------------------------

class ImagePreprocessor:
    """
    Cleans up a scanned claim form before line detection.

    Steps
    -----
    1. Grayscale conversion
    2. Optional deskew (rotation correction up to ±5°)
    3. Adaptive binarisation (Otsu after Gaussian blur)
    4. Light morphological closing to join broken strokes
    """

    def __init__(
        self,
        deskew: bool = True,
        max_skew_angle: float = 5.0,
        blur_ksize: int = 5,
        close_ksize: int = 3,
    ):
        self.deskew = deskew
        self.max_skew_angle = max_skew_angle
        self.blur_ksize = blur_ksize
        self.close_ksize = close_ksize

    def __call__(self, img_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Returns (gray, binary) both as uint8 arrays, same spatial size as input.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        if self.deskew:
            gray = self._correct_skew(gray)

        blurred = cv2.GaussianBlur(gray, (self.blur_ksize, self.blur_ksize), 0)
        _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (self.close_ksize, self.close_ksize)
        )
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        return gray, binary

    def _correct_skew(self, gray: np.ndarray) -> np.ndarray:
        coords = np.column_stack(np.where(gray < 128))
        if len(coords) < 5:
            return gray
        angle = cv2.minAreaRect(coords)[-1]
        # minAreaRect returns angle in (-90, 0]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > self.max_skew_angle:
            logger.debug("Skew angle %.2f° exceeds limit; skipping deskew", angle)
            return gray
        logger.debug("Correcting skew by %.2f°", angle)
        (h, w) = gray.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)


# ---------------------------------------------------------------------------
# Line detection
# ---------------------------------------------------------------------------

class LineDetector:
    """
    Finds horizontal and vertical ruling lines using morphological erosion.

    The trick: erode with a very wide horizontal kernel → only horizontal lines
    survive; erode with a tall vertical kernel → only vertical lines survive.
    """

    def __init__(
        self,
        h_line_min_width_frac: float = 0.3,   # line must span ≥30% of image width
        v_line_min_height_frac: float = 0.05,  # line must span ≥5% of image height
        line_thickness: int = 2,               # morphological kernel thickness
    ):
        self.h_line_min_width_frac = h_line_min_width_frac
        self.v_line_min_height_frac = v_line_min_height_frac
        self.line_thickness = line_thickness

    def detect(self, binary: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Returns (h_mask, v_mask) — binary images marking ruling lines.
        """
        h, w = binary.shape[:2]

        # --- horizontal lines ---
        h_kernel_w = max(int(w * self.h_line_min_width_frac), 20)
        h_kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (h_kernel_w, self.line_thickness)
        )
        h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

        # --- vertical lines ---
        v_kernel_h = max(int(h * self.v_line_min_height_frac), 20)
        v_kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (self.line_thickness, v_kernel_h)
        )
        v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

        return h_mask, v_mask

    @staticmethod
    def mask_to_coords(mask: np.ndarray, axis: int) -> list[int]:
        """
        Projects a line mask onto one axis and returns the pixel positions
        where lines were detected (sorted, deduplicated with a 10-px gap).
        """
        projection = mask.sum(axis=axis)
        threshold = projection.max() * 0.1
        positions = np.where(projection > threshold)[0].tolist()
        return LineDetector._cluster(positions)

    @staticmethod
    def _cluster(positions: list[int], gap: int = 10) -> list[int]:
        if not positions:
            return []
        result = []
        group = [positions[0]]
        for p in positions[1:]:
            if p - group[-1] <= gap:
                group.append(p)
            else:
                result.append(int(np.mean(group)))
                group = [p]
        result.append(int(np.mean(group)))
        return result


# ---------------------------------------------------------------------------
# Cell reconstruction
# ---------------------------------------------------------------------------

class GridReconstructor:
    """
    Given lists of detected row-separators (y-values) and column-separators
    (x-values), produces a list of CellRegion objects.

    Also handles the fall-back case where no lines are found: it falls back
    to OpenCV contour-based region detection.
    """

    MIN_CELL_W = 40   # px — ignore slivers
    MIN_CELL_H = 15

    def from_lines(
        self,
        y_lines: list[int],
        x_lines: list[int],
        img_h: int,
        img_w: int,
    ) -> list[CellRegion]:
        cells: list[CellRegion] = []
        rows = self._boundaries(y_lines, 0, img_h)
        cols = self._boundaries(x_lines, 0, img_w)

        for ri, (y0, y1) in enumerate(rows):
            for ci, (x0, x1) in enumerate(cols):
                cell = CellRegion(x=x0, y=y0, w=x1 - x0, h=y1 - y0, row=ri, col=ci)
                if cell.w >= self.MIN_CELL_W and cell.h >= self.MIN_CELL_H:
                    cells.append(cell)
        return cells

    def from_contours(self, binary: np.ndarray) -> list[CellRegion]:
        """Fall-back: detect rectangular regions via contour analysis."""
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cells: list[CellRegion] = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w >= self.MIN_CELL_W and h >= self.MIN_CELL_H:
                cells.append(CellRegion(x=x, y=y, w=w, h=h))
        # sort top-to-bottom, left-to-right
        cells.sort(key=lambda c: (c.y, c.x))
        return cells

    @staticmethod
    def _boundaries(lines: list[int], lo: int, hi: int) -> list[tuple[int, int]]:
        """Turn a list of separator positions into (start, end) intervals."""
        coords = sorted(set([lo] + lines + [hi]))
        return [(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]


# ---------------------------------------------------------------------------
# Tesseract OCR with PSM selection
# ---------------------------------------------------------------------------

class TesseractEngine:
    """
    Runs Tesseract on a cropped cell image, automatically selecting the best
    Page Segmentation Mode (PSM) based on cell geometry.

    PSM recommendations for form cells
    ------------------------------------
    PSM 6  – "Assume a single uniform block of text."
               Best for multi-word, multi-line cells (e.g. address fields).
    PSM 7  – "Treat the image as a single text line."
               Best for single-line fields (name, date, ID number).
    PSM 8  – "Treat the image as a single word."
               Best for narrow single-value cells (tick-box labels, codes).
    PSM 13 – "Raw line. Treat the image as a single text line, bypassing hacks."
               Useful for numeric fields or cells with mixed fonts.

    The engine picks PSM 7 for wide, short cells (aspect ratio > 4:1) and
    PSM 6 otherwise, then optionally retries with PSM 13 when confidence < 60.
    """

    LANG = "eng"
    BASE_CONFIG = "--oem 3"           # LSTM engine

    PSM_SINGLE_LINE   = 7
    PSM_UNIFORM_BLOCK = 6
    PSM_SINGLE_WORD   = 8
    PSM_RAW_LINE      = 13

    CONF_RETRY_THRESHOLD = 60.0       # retry with PSM 13 below this confidence

    def ocr_cell(self, crop: np.ndarray, cell: CellRegion) -> tuple[str, float, int]:
        """
        Returns (text, mean_confidence, psm_used).
        """
        psm = self._choose_psm(cell)
        text, conf = self._run(crop, psm)

        # Low-confidence retry with a raw-line pass
        if conf < self.CONF_RETRY_THRESHOLD and psm != self.PSM_RAW_LINE:
            alt_text, alt_conf = self._run(crop, self.PSM_RAW_LINE)
            if alt_conf > conf:
                logger.debug(
                    "Cell(%d,%d): PSM %d conf=%.1f → PSM 13 conf=%.1f (accepted)",
                    cell.row, cell.col, psm, conf, alt_conf,
                )
                return alt_text.strip(), alt_conf, self.PSM_RAW_LINE

        return text.strip(), conf, psm

    def _choose_psm(self, cell: CellRegion) -> int:
        aspect = cell.w / max(cell.h, 1)
        if cell.h < 30 and cell.w < 80:
            return self.PSM_SINGLE_WORD
        if aspect >= 4.0:
            return self.PSM_SINGLE_LINE
        return self.PSM_UNIFORM_BLOCK

    def _run(self, crop: np.ndarray, psm: int) -> tuple[str, float]:
        config = f"{self.BASE_CONFIG} --psm {psm}"
        # Upscale tiny crops — Tesseract accuracy degrades below 20px height
        crop = self._maybe_upscale(crop)
        try:
            df = pytesseract.image_to_data(
                crop,
                lang=self.LANG,
                config=config,
                output_type=pytesseract.Output.DATAFRAME,
            )
            words = df[(df["conf"] > 0) & (df["text"].str.strip() != "")]
            if words.empty:
                return "", 0.0
            text = " ".join(words["text"].astype(str).tolist())
            mean_conf = float(words["conf"].mean())
            return text, mean_conf
        except Exception as exc:
            logger.warning("Tesseract error (PSM %d): %s", psm, exc)
            return "", 0.0

    @staticmethod
    def _maybe_upscale(crop: np.ndarray, min_h: int = 40) -> np.ndarray:
        h, w = crop.shape[:2]
        if h < min_h:
            scale = min_h / h
            crop = cv2.resize(crop, (int(w * scale), int(h * scale)),
                              interpolation=cv2.INTER_CUBIC)
        return crop


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

class FormSegmenter:
    """
    End-to-end form segmentation pipeline.

    Parameters
    ----------
    image_path : str | Path | np.ndarray
        Path to the scanned form, or a BGR numpy array.
    padding : int
        Pixels of whitespace to add around each cropped cell before OCR
        (avoids cutting off ascenders/descenders).
    debug_dir : str | None
        If set, saves intermediate images (binary, line masks, annotated cells)
        into this directory for visual debugging.
    """

    def __init__(
        self,
        image_path: str | Path | np.ndarray,
        padding: int = 4,
        debug_dir: str | None = None,
    ):
        if isinstance(image_path, np.ndarray):
            self.img_bgr = image_path
        else:
            self.img_bgr = cv2.imread(str(image_path))
            if self.img_bgr is None:
                raise FileNotFoundError(f"Cannot load image: {image_path}")

        self.padding = padding
        self.debug_dir = Path(debug_dir) if debug_dir else None
        if self.debug_dir:
            self.debug_dir.mkdir(parents=True, exist_ok=True)

        self._preprocessor = ImagePreprocessor()
        self._line_detector = LineDetector()
        self._reconstructor = GridReconstructor()
        self._ocr = TesseractEngine()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> list[CellResult]:
        """
        Full pipeline. Returns a list of CellResult objects, one per detected
        cell, in reading order (top-to-bottom, left-to-right).
        """
        gray, binary = self._preprocessor(self.img_bgr)
        self._save_debug("01_binary.png", binary)

        h_mask, v_mask = self._line_detector.detect(binary)
        self._save_debug("02_h_lines.png", h_mask)
        self._save_debug("03_v_lines.png", v_mask)

        y_lines = self._line_detector.mask_to_coords(h_mask, axis=1)  # project cols
        x_lines = self._line_detector.mask_to_coords(v_mask, axis=0)  # project rows

        img_h, img_w = gray.shape[:2]
        logger.info(
            "Detected %d horizontal lines, %d vertical lines",
            len(y_lines), len(x_lines),
        )

        if len(y_lines) >= 2 and len(x_lines) >= 2:
            cells = self._reconstructor.from_lines(y_lines, x_lines, img_h, img_w)
            logger.info("Grid reconstruction → %d cells", len(cells))
        else:
            # Fall back to contour detection when the form has no ruling lines
            logger.warning(
                "Insufficient lines found; falling back to contour detection"
            )
            cells = self._reconstructor.from_contours(binary)
            logger.info("Contour detection → %d cells", len(cells))

        results = list(self._ocr_all_cells(gray, cells))
        self._save_annotated(results)
        return results

    def to_dict(self) -> dict[str, str]:
        """
        Convenience wrapper: returns {\"R{row}C{col}\": text} for all cells.
        Useful for quick inspection or passing to the LLM extraction prompt.
        """
        return {f"R{r.row}C{r.col}": r.text for r in self.run()}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ocr_all_cells(
        self, gray: np.ndarray, cells: list[CellRegion]
    ) -> Iterator[CellResult]:
        img_h, img_w = gray.shape[:2]
        for cell in cells:
            crop = self._safe_crop(gray, cell, img_h, img_w)
            text, conf, psm = self._ocr.ocr_cell(crop, cell)
            logger.debug(
                "Cell(%d,%d) PSM=%d conf=%.1f text=%r",
                cell.row, cell.col, psm, conf, text,
            )
            yield CellResult(
                row=cell.row,
                col=cell.col,
                x=cell.x,
                y=cell.y,
                w=cell.w,
                h=cell.h,
                text=text,
                confidence=conf,
                psm_used=psm,
            )

    def _safe_crop(
        self, gray: np.ndarray, cell: CellRegion, img_h: int, img_w: int
    ) -> np.ndarray:
        p = self.padding
        x0 = max(cell.x - p, 0)
        y0 = max(cell.y - p, 0)
        x1 = min(cell.x + cell.w + p, img_w)
        y1 = min(cell.y + cell.h + p, img_h)
        return gray[y0:y1, x0:x1]

    def _save_debug(self, name: str, img: np.ndarray) -> None:
        if self.debug_dir:
            cv2.imwrite(str(self.debug_dir / name), img)

    def _save_annotated(self, results: list[CellResult]) -> None:
        if not self.debug_dir:
            return
        annotated = self.img_bgr.copy()
        for r in results:
            cv2.rectangle(annotated, (r.x, r.y), (r.x + r.w, r.y + r.h),
                          (0, 200, 0), 1)
            cv2.putText(
                annotated,
                f"R{r.row}C{r.col}",
                (r.x + 2, r.y + 12),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (0, 0, 220),
                1,
            )
        cv2.imwrite(str(self.debug_dir / "04_annotated_cells.png"), annotated)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse, json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    ap = argparse.ArgumentParser(description="Segment a scanned form and OCR each cell")
    ap.add_argument("image", help="Path to scanned form image")
    ap.add_argument("--debug-dir", default=None,
                    help="Save debug images to this directory")
    ap.add_argument("--output", default=None,
                    help="Write JSON result to this file (default: stdout)")
    args = ap.parse_args()

    seg = FormSegmenter(args.image, debug_dir=args.debug_dir)
    cells = seg.run()
    output = [
        {
            "row": c.row, "col": c.col,
            "bbox": [c.x, c.y, c.w, c.h],
            "text": c.text,
            "confidence": round(c.confidence, 1),
            "psm": c.psm_used,
        }
        for c in cells
    ]
    payload = json.dumps(output, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(payload)
        print(f"Wrote {len(cells)} cells → {args.output}")
    else:
        print(payload)
