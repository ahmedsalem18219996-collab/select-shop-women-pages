import { call } from './api.js';
import { done, fail, html, island, render, withBusy } from './ui.js';

const MAX_LINES = 8;
const MAX_LENGTH = 60;

export function mountStudioMarqueeSettings(form, initial) {
  const rows = form.querySelector('[data-marquee-lines]');
  const enabled = form.querySelector('[data-marquee-enabled]');
  const speed = form.querySelector('[data-marquee-speed]');
  const seconds = form.querySelector('[data-marquee-seconds]');
  const add = form.querySelector('[data-marquee-add]');
  const save = form.querySelector('[data-marquee-save]');
  const readLines = () => [...rows.children].map(row => ({
    text: row.querySelector('[data-marquee-copy]').value.trim(),
    hidden: row.querySelector('[data-marquee-hidden]').checked,
  }));
  function paintLines(lines) {
    render(rows, html`${lines.map((line, index) => html`
      <div class="studio-marquee-row">
        <label class="field"><span>سطر ${index + 1}</span>
          <input class="input" data-marquee-copy required value="${line.text}" autocomplete="off">
        </label>
        <div class="row wrap">
          <label class="studio-marquee-check"><input type="checkbox" data-marquee-hidden ${line.hidden ? 'checked' : ''}> <span>إخفاء السطر</span></label>
          <button type="button" class="btn btn-ghost" data-marquee-remove="${index}">حذف السطر</button>
        </div>
      </div>`)}`);
    add.disabled = lines.length >= MAX_LINES;
  }
  function paint(config) {
    enabled.checked = config.enabled;
    speed.value = config.speed;
    seconds.textContent = speed.value;
    paintLines(config.lines);
  }
  const read = () => ({ enabled: enabled.checked, speed: Number(speed.value), lines: readLines() });
  paint(initial);
  speed.oninput = () => { seconds.textContent = speed.value; };
  add.onclick = () => {
    const lines = readLines();
    if (lines.length >= MAX_LINES) return;
    paintLines([...lines, { text: '', hidden: false }]);
    rows.lastElementChild.querySelector('input').focus();
  };
  rows.onclick = event => {
    const button = event.target.closest('[data-marquee-remove]');
    if (!button) return;
    const lines = readLines();
    const index = Number(button.dataset.marqueeRemove);
    lines.splice(index, 1);
    paintLines(lines);
    (rows.children[Math.min(index, lines.length - 1)]?.querySelector('input') || add).focus();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const config = read();
    if (config.lines.some(line => !line.text || [...line.text].length > MAX_LENGTH)) {
      island('error', 'اكتب من حرف واحد لـ60 حرف لكل سطر، أو احذفه.');
      return;
    }
    const result = await withBusy(save, () => call('settings.studio_marquee_save', config));
    if (!form.isConnected) return;
    if (result.outcome === 'saved') {
      if (JSON.stringify(read()) === JSON.stringify(config)) paint(result);
      done('اتحفظ الشريط المتحرك.');
    } else if (result.field === 'restrictedCopy') {
      island('error', 'راجع نصوص الشريط الظاهرة واحذف عبارات الوعود أو العروض الممنوعة.');
    } else fail(result);
  };
}
