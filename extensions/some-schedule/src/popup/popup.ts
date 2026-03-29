
/**
 *
 * Three UI states: IDLE → CAPTURING → DONE.
 * The popup no longer holds a full CaptureSession — only the
 * CaptureSummary returned by the background after POSTing to the
 * localhost pipeline endpoint.
 */

import type {
  CaptureSummary,
  MessageFromBackground,
  MessageToBackground,
} from '@schedule/shared/types';

// ── DOM refs ───────────────────────────────────────────────────────────────

const btnCaptureAll    = document.getElementById('btn-capture-all')    as HTMLButtonElement;
const btnCaptureActive = document.getElementById('btn-capture-active') as HTMLButtonElement;
const progressBar      = document.getElementById('progress-bar')       as HTMLDivElement;
const progressFill     = document.getElementById('progress-fill')      as HTMLDivElement;
const statusText       = document.getElementById('status-text')        as HTMLParagraphElement;
const resultSection    = document.getElementById('result-section')     as HTMLDivElement;
const summaryText      = document.getElementById('summary-text')       as HTMLParagraphElement;

// ── Helper ─────────────────────────────────────────────────────────────────

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
      } else if (response.last_summary != null) {
        showResult(response.last_summary, false);
      } else {
        setIdle();
      }
    }
  } catch {
    setIdle();
  }

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
        showResult(response.summary, true);
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
        showResult(response.summary, true);
      } else if (response.kind === 'CAPTURE_ERROR') {
        setError(response.error);
      }
    })
    .catch(e => setError(String(e)));
});

// ── State transitions ──────────────────────────────────────────────────────

function setIdle(): void {
  statusText.textContent      = 'Ready to capture';
  progressBar.style.display   = 'none';
  resultSection.style.display = 'none';
  btnCaptureAll.disabled      = false;
  btnCaptureActive.disabled   = false;
}

function setCapturing(): void {
  statusText.textContent      = 'Capturing…';
  progressBar.style.display   = 'block';
  progressFill.style.width    = '0%';
  resultSection.style.display = 'none';
  btnCaptureAll.disabled      = true;
  btnCaptureActive.disabled   = true;
}

function setProgress(completed: number, total: number): void {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  statusText.textContent   = `Capturing… ${completed}/${total}`;
}

function setError(error: string): void {
  statusText.textContent    = `Error: ${error}`;
  progressBar.style.display = 'none';
  btnCaptureAll.disabled    = false;
  btnCaptureActive.disabled = false;
}

function showResult(summary: CaptureSummary, justFinished: boolean): void {
  summaryText.textContent =
    `${summary.captured_ok} captured  ·  ${summary.captured_fail} failed` +
    `  ·  ${summary.skipped} skipped  ·  ${summary.total_tabs} total`;

  progressBar.style.display   = 'none';
  resultSection.style.display = 'block';
  statusText.textContent = justFinished
    ? `Sent to pipeline  ·  ${summary.captured_at.slice(0, 10)}`
    : `Last run  ·  ${summary.captured_at.slice(0, 10)}`;

  btnCaptureAll.disabled    = false;
  btnCaptureActive.disabled = false;
}

// ── Boot ───────────────────────────────────────────────────────────────────

init();
