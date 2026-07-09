import logging
from typing import Optional

logger = logging.getLogger(__name__)

HAS_PLAYWRIGHT = False
_playwright = None  # singleton Playwright controller
_browser = None     # singleton Chromium browser

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    logger.warning("playwright not installed — PDF generation via Playwright unavailable")

HAS_WEASYPRINT = False
try:
    from weasyprint import HTML
    HAS_WEASYPRINT = True
except (ImportError, OSError):
    logger.warning("weasyprint not available (libraries missing) — PDF generation via WeasyPrint unavailable")


async def _ensure_browser():
    global _playwright, _browser
    try:
        if _browser is not None and _browser.is_connected():
            return _browser
    except Exception:
        _browser = None
    if _playwright is not None:
        try:
            await _playwright.stop()
        except Exception:
            pass
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch()
    return _browser


async def html_to_pdf(html: str) -> Optional[bytes]:
    """Convert a complete HTML document to a real PDF.

    Uses Playwright (Chromium) as the primary engine — produces pixel-perfect
    PDFs that match browser Print output exactly. Falls back to WeasyPrint if
    Playwright is not available (e.g. in Docker where WeasyPrint's GTK deps
    are already installed via Dockerfile).

    The HTML should be a full document (<html><head>…</head><body>…</body></html>)
    with embedded CSS.

    Returns raw PDF bytes, or None if no PDF engine is available.
    """
    if HAS_PLAYWRIGHT:
        try:
            browser = await _ensure_browser()
            page = await browser.new_page()
            await page.set_content(html, wait_until="domcontentloaded")
            pdf_bytes = await page.pdf(
                format="A4",
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                print_background=True,
            )
            await page.close()
            return pdf_bytes
        except Exception as exc:
            logger.exception("Playwright PDF generation failed")

    if HAS_WEASYPRINT:
        try:
            pdf_bytes = HTML(string=html).write_pdf()
            return pdf_bytes
        except Exception as exc:
            logger.exception("WeasyPrint conversion failed")

    logger.error("no PDF engine available — cannot generate PDF")
    return None


async def _cleanup():
    """Close the shared browser and Playwright controller on shutdown."""
    global _playwright, _browser
    if _browser is not None:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _playwright is not None:
        try:
            await _playwright.stop()
        except Exception:
            pass
        _playwright = None
