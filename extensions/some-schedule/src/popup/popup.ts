
/**
 *
 * Popup script — drives popup.html.
 *
 * Three UI states:
 *   IDLE       → last capture summary + capture buttons
 *   CAPTURING  → progress bar
 *   DONE       → result summary + copy/download buttons
 *
 * Firefox MV2: browser.runtime.sendMessage returns a Promise.
 * All message sends use async/await — no callbacks.
 */

import type {
  CaptureSession,
  MessageFromBackground,
  MessageToBackground,
} from '@schedule/shared/types';

// ── DOM refs ───────────────────────────────────────────────────────────────

const btnCaptureAll    = document.getElementById('btn-capture-all')    as HTMLButtonElement;
const btnCaptureActive = document.getElementById('btn-capture-active') as HTMLButtonElement;
const btnCopy          = document.getElementById('btn-copy')           as HTMLButtonElement;
const btnDownload      = document.getElementById('btn-download')       as HTMLButtonElement;
const progressBar      = document.getElementById('progress-bar')       as HTMLDivElement;
const progressFill     = document.getElementById('progress-fill')      as HTMLDivElement;
const statusText       = document.getElementById('status-text')        as HTMLParagraphElement;
const resultSection    = document.getElementById('result-section')     as HTMLDivElement;
const summaryText      = document.getElementById('summary-text')       as HTMLParagraphElement;

// ── State ──────────────────────────────────────────────────────────────────

let lastSession: CaptureSession | null = null;

// ── Helper: typed sendMessage ──────────────────────────────────────────────

async function sendToBackground(
  msg: MessageToBackground
): Promise<MessageFromBackground> {
  return browser.runtime.sendMessage(msg) as Promise<MessageFromBackground>;
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    const response = await sendToBackground({ kind: 'GET_CAPTURE_STATUS' });
    if (response.kind === 'STATUS') {
      if (response.capturing) {
        setCapturing();
      } else if (response.last_session != null) {
        showResult(response.last_session);
      } else {
        setIdle();
      }
    }
  } catch {
    setIdle();
  }

  // Listen for progress broadcasts from background.
  browser.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as MessageFromBackground;
    if (msg.kind === 'CAPTURE_PROGRESS') {
      setProgress(msg.completed, msg.total);
    }
  });
}

// ── Button handlers ────────────────────────────────────────────────────────

btnCaptureAll.addEventListener('click', () => {
  setCapturing();
  sendToBackground({ kind: 'CAPTURE_ALL_TABS' })
    .then(response => {
      if (response.kind === 'CAPTURE_COMPLETE') {
        showResult(response.session);
      } else if (response.kind === 'CAPTURE_ERROR') {
        setError(response.error);
      }
    })
    .catch(e => setError(String(e)));
});

btnCaptureActive.addEventListener('click', () => {
  setCapturing();
  sendToBackground({ kind: 'CAPTURE_ACTIVE_TAB' })
    .then(response => {
      if (response.kind === 'CAPTURE_COMPLETE') {
        showResult(response.session);
      } else if (response.kind === 'CAPTURE_ERROR') {
        setError(response.error);
      }
    })
    .catch(e => setError(String(e)));
});

btnCopy.addEventListener('click', () => {
  if (lastSession == null) return;
  navigator.clipboard.writeText(JSON.stringify(lastSession, null, 2))
    .then(() => {
      btnCopy.textContent = 'Copied ✓';
      setTimeout(() => { btnCopy.textContent = 'Copy JSON'; }, 2000);
    })
    .catch(() => undefined);
});

btnDownload.addEventListener('click', () => {
  if (lastSession == null) return;
  const blob = new Blob(
    [JSON.stringify(lastSession, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `tabsched-capture-${lastSession.captured_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── State transitions ──────────────────────────────────────────────────────

function setIdle(): void {
  statusText.textContent       = 'Ready to capture';
  progressBar.style.display    = 'none';
  resultSection.style.display  = 'none';
  btnCaptureAll.disabled       = false;
  btnCaptureActive.disabled    = false;
}

function setCapturing(): void {
  statusText.textContent       = 'Capturing…';
  progressBar.style.display    = 'block';
  progressFill.style.width     = '0%';
  resultSection.style.display  = 'none';
  btnCaptureAll.disabled       = true;
  btnCaptureActive.disabled    = true;
}

function setProgress(completed: number, total: number): void {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFill.style.width  = `${pct}%`;
  statusText.textContent    = `Capturing… ${completed}/${total}`;
}

function setError(error: string): void {
  statusText.textContent    = `Error: ${error}`;
  progressBar.style.display = 'none';
  btnCaptureAll.disabled    = false;
  btnCaptureActive.disabled = false;
}

function showResult(session: CaptureSession): void {
  lastSession = session;

  const okCount      = session.captures.filter(c => c.extraction_ok).length;
  const failCount    = session.captures.filter(c => !c.extraction_ok).length;
  const skippedCount = session.skipped.length;

  summaryText.textContent =
    `${okCount} captured  ·  ${failCount} failed  ·  ${skippedCount} skipped` +
    `  ·  ${session.total_open_tabs} total tabs`;

  progressBar.style.display   = 'none';
  resultSection.style.display = 'block';
  statusText.textContent      = `Done — ${session.captured_at.slice(0, 10)}`;
  btnCaptureAll.disabled      = false;
  btnCaptureActive.disabled   = false;
}

// ── Boot ───────────────────────────────────────────────────────────────────

init();
