import asyncio
import contextlib
import io
import logging
import sys
import threading
from typing import Optional

logger = logging.getLogger(__name__)

HAS_PLAYWRIGHT = False
HAS_WEASYPRINT = False

# Playwright singletons — only ever touched from the dedicated PDF engine loop.
_playwright = None
_browser = None

_engine_loop: Optional[asyncio.AbstractEventLoop] = None
_engine_thread: Optional[threading.Thread] = None
_engine_lock = threading.Lock()


def _playwright_available() -> bool:
    """Lazily detect Playwright so a running server picks up a late install."""
    global HAS_PLAYWRIGHT
    if not HAS_PLAYWRIGHT:
        try:
            import playwright.async_api  # noqa: F401
            HAS_PLAYWRIGHT = True
        except ImportError:
            return False
    return HAS_PLAYWRIGHT


try:
    import playwright.async_api as _playwright_api  # noqa: F401
    HAS_PLAYWRIGHT = True
except ImportError:
    logger.warning("playwright not installed — PDF generation via Playwright unavailable")

try:
    with contextlib.redirect_stderr(io.StringIO()):
        from weasyprint import HTML
    HAS_WEASYPRINT = True
except (ImportError, OSError):
    logger.warning("weasyprint not available (libraries missing) — PDF generation via WeasyPrint unavailable")


def _get_engine_loop() -> asyncio.AbstractEventLoop:
    """Return (creating if needed) a dedicated event loop in a worker thread.

    Uvicorn forces ``SelectorEventLoop`` when running with ``--reload`` on
    Windows, and that loop cannot spawn subprocesses — which Playwright's
    driver requires. The engine therefore runs on its own Proactor loop,
    decoupled from the server loop.
    """
    global _engine_loop, _engine_thread
    with _engine_lock:
        if _engine_loop is None or _engine_loop.is_closed():
            if sys.platform == "win32":
                _engine_loop = asyncio.ProactorEventLoop()
            else:
                _engine_loop = asyncio.new_event_loop()
            _engine_thread = threading.Thread(
                target=_engine_loop.run_forever, daemon=True, name="pdf-engine"
            )
            _engine_thread.start()
        return _engine_loop


def _submit(coro) -> "concurrent.futures.Future":
    loop = _get_engine_loop()
    return asyncio.run_coroutine_threadsafe(coro, loop)


async def _ensure_browser():
    global _playwright, _browser
    try:
        if _browser is not None and _browser.is_connected():
            return _browser
    except Exception:
        _browser = None
    from playwright.async_api import async_playwright

    if _playwright is not None:
        try:
            await _playwright.stop()
        except Exception:
            pass
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch()
    return _browser


async def _convert(html: str) -> Optional[bytes]:
    """Run on the dedicated PDF engine loop — real conversion logic."""
    if _playwright_available():
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
        except Exception:
            logger.exception("Playwright PDF generation failed")

    if HAS_WEASYPRINT:
        try:
            return HTML(string=html).write_pdf()
        except Exception:
            logger.exception("WeasyPrint conversion failed")

    logger.error("no PDF engine available — cannot generate PDF")
    return None


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
    future = _submit(_convert(html))
    return await asyncio.wrap_future(future)


async def warm_up() -> None:
    """Pre-launch the browser on the dedicated PDF engine loop (idempotent)."""
    future = _submit(_ensure_browser())
    await asyncio.wrap_future(future)


async def _cleanup():
    """Close the shared browser, Playwright controller, and engine loop."""
    global _playwright, _browser, _engine_loop, _engine_thread
    if _browser is not None:
        try:
            await asyncio.wrap_future(_submit(_browser.close()))
        except Exception:
            pass
        _browser = None
    if _playwright is not None:
        try:
            await asyncio.wrap_future(_submit(_playwright.stop()))
        except Exception:
            pass
        _playwright = None
    loop, thread = _engine_loop, _engine_thread
    _engine_loop, _engine_thread = None, None
    if loop is not None:
        loop.call_soon_threadsafe(loop.stop)
        if thread is not None:
            thread.join(timeout=5)
