
// Captured Moments List Component
import type { CapturedMoment } from '@/types/schema';
import { getEmotionConfig, formatTimestamp } from '@/utils';

export class CapturedMomentsList {
  private element: HTMLElement;

  constructor() {
    this.element = this.create();
  }

  private create(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'drama-sentiment-moments-list';
    return div;
  }

  update(moments: CapturedMoment[]): void {
    if (moments.length === 0) {
      this.element.innerHTML = `
        <div class="moments-empty">
          <div class="moments-empty-icon">🎬</div>
          <p class="moments-empty-text">No moments captured yet</p>
          <p class="moments-empty-hint">Click the floating bar to start tracking</p>
        </div>
      `;
      return;
    }

    const momentsList = moments.map(moment => {
      const config = getEmotionConfig(moment.emotion);
      
      return `
        <div class="moment-item ${config.className}">
          <span class="moment-emoji">${moment.emoji}</span>
          <div class="moment-details">
            <div class="moment-meta">
              <span class="moment-timestamp">${formatTimestamp(moment.timestamp)}</span>
              <span class="moment-separator">•</span>
              <span class="moment-emotion">${moment.emotion}</span>
              <span class="moment-separator">•</span>
              <span class="moment-intensity">${Math.round(moment.intensity * 100)}%</span>
            </div>
            ${moment.note ? `
              <p class="moment-note">${this.escapeHtml(moment.note)}</p>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.element.innerHTML = `
      <div class="moments-header">
        <h3 class="moments-title">Captured Moments</h3>
        <span class="moments-count">${moments.length} total</span>
      </div>
      <div class="moments-list">
        ${momentsList}
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.element);
  }

  unmount(): void {
    this.element.remove();
  }
}
