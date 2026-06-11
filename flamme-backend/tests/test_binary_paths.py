"""PPT/PDF 摄入去重"""

import os
import tempfile
import unittest
from pathlib import Path

from src.vault.binary_paths import (
    dedupe_binary_queue,
    find_sibling_pdf,
    ppt_pdf_relpath,
)
from src.tools.paths import converted_dir
from src.vault.scanner import needs_binary_ingest


class BinaryPathsTest(unittest.TestCase):
    def test_ppt_pdf_relpath(self):
        self.assertEqual(ppt_pdf_relpath("course/a.pptx"), "course/a.pdf")

    def test_find_sibling_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            ppt = vault / "deck.pptx"
            pdf = vault / "deck.pdf"
            ppt.write_bytes(b"ppt")
            pdf.write_bytes(b"%PDF")
            found = find_sibling_pdf(ppt)
            self.assertEqual(found, pdf.resolve())

    def test_converted_dir_pdf_does_not_block_ppt(self):
        """仅 .flamme/converted 下有 PDF 时，PPT 仍应待摄入"""
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            course = vault / "course"
            course.mkdir()
            ppt = course / "deck.pptx"
            ppt.write_bytes(b"ppt")
            conv_pdf = converted_dir(course) / "deck.pdf"
            conv_pdf.parent.mkdir(parents=True, exist_ok=True)
            conv_pdf.write_bytes(b"%PDF")
            self.assertIsNone(find_sibling_pdf(ppt))
            self.assertTrue(needs_binary_ingest(vault, "course/deck.pptx", set()))

    def test_needs_binary_skips_ppt_when_pdf_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            ppt = vault / "deck.pptx"
            pdf = vault / "deck.pdf"
            ppt.write_bytes(b"ppt")
            pdf.write_bytes(b"%PDF")
            self.assertFalse(needs_binary_ingest(vault, "deck.pptx", set()))
            self.assertTrue(needs_binary_ingest(vault, "deck.pdf", set()))

    def test_dedupe_queue_drops_ppt_if_pdf_pending(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            out = dedupe_binary_queue(
                vault,
                ["a.pptx", "a.pdf"],
            )
            self.assertEqual(out, ["a.pdf"])


if __name__ == "__main__":
    unittest.main()
