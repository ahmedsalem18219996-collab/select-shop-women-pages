// Staff-friendly colour picker for the product wizard.
// Pure DOM enhancement: the existing data-d-name input remains the source of truth for draft saves.
// A pair like "أسود × أبيض" is ONE colour value and ONE photo group, not two separate SKUs.
import { PALETTE, normName, namedColour, splitColourPair, pairName } from '../../js/colour-palette.js?v=20261106-colourpicker';

const groups = [...new Set(PALETTE.map((c) => c.group))];

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function field(label, ariaLabel) {
  const wrap = element('label', 'field');
  const title = element('span', '', label);
  const select = element('select', 'select');
  select.setAttribute('aria-label', ariaLabel || label);
  wrap.append(title, select);
  return { wrap, select };
}

function setOptions(select, current = '', filter = '') {
  const searched = normName(filter);
  const selected = namedColour(current)?.name || '';
  const filtered = PALETTE.filter((c) => !searched || normName(c.name).includes(searched));
  if (selected && !filtered.some((c) => c.name === selected)) {
    const previous = namedColour(selected);
    if (previous) filtered.unshift(previous);
  }
  const first = element('option', '', filtered.length ? 'اختيار اللون' : 'مفيش نتيجة — كتابة لون مخصص');
  first.value = '';
  select.replaceChildren(first);
  for (const group of groups) {
    const inGroup = filtered.filter((c) => c.group === group);
    if (!inGroup.length) continue;
    const optgroup = element('optgroup');
    optgroup.label = group;
    for (const colour of inGroup) {
      const option = element('option', '', colour.name);
      option.value = colour.name;
      optgroup.append(option);
    }
    select.append(optgroup);
  }
  select.value = selected;
}

export function mountDraftColourPickers(root) {
  for (const card of root.querySelectorAll('[data-draft]')) {
    const input = card.querySelector('[data-d-name]');
    const slot = card.querySelector('[data-colour-picker-slot]');
    if (!input || !slot) continue;

    const mode = field('نوع اللون', 'اختيار لون واحد أو لونين مع بعض');
    mode.select.dataset.colourMode = '1';
    for (const [value, label] of [['single', 'لون واحد'], ['pair', 'لونين مع بعض (لون مزدوج)']]) {
      const option = element('option', '', label);
      option.value = value;
      mode.select.append(option);
    }

    const one = element('div', 'colour-picker-single');
    const search = element('input', 'input');
    search.type = 'search';
    search.placeholder = 'كتابة جزء من اسم اللون — مثال: بيبي';
    search.setAttribute('aria-label', 'البحث عن اللون');
    const singleField = field('اختيار لون المنتج من القائمة');
    one.append(search, singleField.wrap);

    const pair = element('div', 'colour-picker-pair');
    const pairHelp = element('p', 'muted', 'اختيار اللونين الموجودين في نفس القطعة. صورها هتتربط بالتركيبة دي كاختيار واحد.');
    const pairGrid = element('div', 'grid2');
    const firstField = field('اللون الأول');
    const secondField = field('اللون الثاني');
    pairGrid.append(firstField.wrap, secondField.wrap);
    pair.append(pairHelp, pairGrid);
    const error = element('small', 'err');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    pair.append(error);

    slot.replaceChildren(mode.wrap, one, pair);
    const write = (name) => {
      input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const sync = () => {
      const value = input.value.trim();
      const duo = splitColourPair(value);
      const chosen = namedColour(value);
      mode.select.value = duo ? 'pair' : 'single';
      one.hidden = !!duo;
      pair.hidden = !duo;
      setOptions(singleField.select, chosen?.name || '');
      if (duo) {
        firstField.select.value = duo.first;
        secondField.select.value = duo.second;
      }
    };

    setOptions(firstField.select, 'أسود');
    setOptions(secondField.select, 'أبيض');
    sync();
    mode.select.addEventListener('change', () => {
      if (mode.select.value === 'pair') {
        one.hidden = true;
        pair.hidden = false;
        if (!firstField.select.value) firstField.select.value = 'أسود';
        if (!secondField.select.value) secondField.select.value = 'أبيض';
        write(pairName(firstField.select.value, secondField.select.value));
      } else {
        pair.hidden = true;
        one.hidden = false;
        write(singleField.select.value || '');
        search.focus();
      }
    });
    search.addEventListener('input', () => {
      const currentlySelected = singleField.select.value;
      setOptions(singleField.select, currentlySelected, search.value);
    });
    singleField.select.addEventListener('change', () => {
      if (singleField.select.value) write(singleField.select.value);
    });
    const updatePair = () => {
      if (firstField.select.value === secondField.select.value) {
        error.textContent = 'اختيار لونين مختلفين للقطعة.';
        error.hidden = false;
        // Keep the actual invalid combination so checkDrafts blocks Save as well.
        // Blank is allowed for a single-colour, one-size legacy model, so blank here is unsafe.
        write(pairName(firstField.select.value, secondField.select.value));
      } else {
        error.textContent = '';
        error.hidden = true;
        write(pairName(firstField.select.value, secondField.select.value));
      }
      mode.select.value = 'pair';
      one.hidden = true;
      pair.hidden = false;
    };
    firstField.select.addEventListener('change', updatePair);
    secondField.select.addEventListener('change', updatePair);
    input.addEventListener('input', () => {
      // Do not collapse the pair panel while the staff member is correcting identical colours.
      if (mode.select.value === 'pair' && !splitColourPair(input.value)) return;
      sync();
    });
  }
}
