/* Cronômetro de voltas — cada volta é PHI vezes a anterior. */

const PHI = (Math.sqrt(5) + 1) / 2; // 1.618033988749895
const DEFAULT_SECONDS = 10;
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;
const STORAGE_NOTIFY = 'voltas:notify';
const BASE_TITLE = document.title;

const LABEL_COLORS = [
  { id: 'none', name: 'sem cor', value: null },
  { id: 'green', name: 'verde', value: '#34d07f' },
  { id: 'amber', name: 'âmbar', value: '#f2b33d' },
  { id: 'red', name: 'vermelho', value: '#ef4a52' },
  { id: 'blue', name: 'azul', value: '#5aa9f5' },
  { id: 'violet', name: 'violeta', value: '#b07cf6' },
];
const LABEL_BY_ID = new Map(LABEL_COLORS.map((color) => [color.id, color]));

const el = {
  dial: document.getElementById('dial'),
  meta: document.getElementById('meta'),
  time: document.getElementById('time'),
  setup: document.getElementById('setup'),
  base: document.getElementById('base'),
  presets: document.getElementById('presets'),
  mode: document.getElementById('mode'),
  ready: document.getElementById('ready'),
  readyQ: document.getElementById('readyQ'),
  readyTime: document.getElementById('readyTime'),
  stop: document.getElementById('stop'),
  notify: document.getElementById('notify'),
  keysOpen: document.getElementById('keysOpen'),
  keys: document.getElementById('keys'),
  keysClose: document.getElementById('keysClose'),
  keysBody: document.getElementById('keysBody'),
  list: document.getElementById('list'),
  total: document.getElementById('total'),
  empty: document.getElementById('empty'),
  logHint: document.getElementById('logHint'),
  label: document.getElementById('label'),
  labelForm: document.getElementById('labelForm'),
  labelSub: document.getElementById('labelSub'),
  labelClose: document.getElementById('labelClose'),
  labelClear: document.getElementById('labelClear'),
  labelColors: document.getElementById('labelColors'),
  labelNote: document.getElementById('labelNote'),
  labelCount: document.getElementById('labelCount'),
  toast: document.getElementById('toast'),
  proj: document.getElementById('proj'),
  projOpen: document.getElementById('projOpen'),
  projClose: document.getElementById('projClose'),
  projSub: document.getElementById('projSub'),
  projMax: document.getElementById('projMax'),
  projChart: document.getElementById('projChart'),
  projBody: document.getElementById('projBody'),
};

const state = {
  phase: 'setup', // setup | running | awaiting
  mode: 'direct', // direct: ×φ | inverse: ÷φ
  round: 0,
  duration: 0,
  next: 0,
  deadline: 0,
  raf: 0,
  endTimer: 0,
  rounds: [],
  labelIndex: -1,
};

/* ---------- preferências ---------- */

function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* modo privado */ }
}

/* ---------- formatação ---------- */

const pad2 = (n) => String(n).padStart(2, '0');

function formatTenths(tenths) {
  const t = Math.max(0, Math.round(tenths));
  return `${Math.floor(t / 600)}:${pad2(Math.floor((t % 600) / 10))}.${t % 10}`;
}

const formatSeconds = (seconds) => formatTenths(seconds * 10);
const formatRemaining = (ms) => formatTenths(Math.ceil(ms / 100));

function paintTime(text) {
  if (el.time.textContent !== text) el.time.textContent = text;
}

/* ---------- entrada do usuário ---------- */

function parseBase() {
  const raw = el.base.value.trim().replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(value * 10) / 10));
}

// espelha o valor no mostrador e marca o preset correspondente
function syncBase() {
  const seconds = parseBase();
  paintTime(formatSeconds(seconds ?? 0));
  for (const button of el.presets.querySelectorAll('.preset')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.seconds) === seconds));
  }
}

/* ---------- som ---------- */

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// criado/retomado dentro de um gesto do usuário para vencer o autoplay
function enableAudio() {
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// duas notas curtas (A5 -> E6) no fim da volta
function playChime() {
  if (!enableAudio()) return;
  const ctx = audioCtx;
  const start = ctx.currentTime + 0.01;

  [[0, 880], [0.15, 1318.5]].forEach(([offset, freq]) => {
    const at = start + offset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.36);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

/* ---------- notificações ---------- */

const notifySupported = 'Notification' in window;
let notifyEnabled = notifySupported && readPref(STORAGE_NOTIFY) !== 'off';
let notifyAsked = false;
let toastTimer = 0;

function showToast(message, duration = 4200) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, duration);
}

function renderNotify() {
  if (!notifySupported) {
    el.notify.hidden = true;
    return;
  }
  el.notify.hidden = false;
  const granted = Notification.permission === 'granted';
  const on = notifyEnabled && granted;
  el.notify.setAttribute('aria-pressed', String(on));
  el.notify.title = Notification.permission === 'denied'
    ? 'notificações bloqueadas pelo navegador'
    : on ? 'notificações ativadas' : 'notificações desativadas';
}

function askNotify() {
  if (!notifySupported || !notifyEnabled) return;
  if (notifyAsked || Notification.permission !== 'default') return;
  notifyAsked = true;
  Notification.requestPermission()
    .then((permission) => {
      notifyEnabled = permission === 'granted';
      writePref(STORAGE_NOTIFY, notifyEnabled ? 'on' : 'off');
      renderNotify();
    })
    .catch(renderNotify);
}

function toggleNotify() {
  if (!notifySupported) return;
  if (Notification.permission === 'denied') {
    showToast('notificações bloqueadas pelo navegador');
    return;
  }
  if (Notification.permission === 'default') {
    notifyAsked = true;
    Notification.requestPermission()
      .then((permission) => {
        notifyEnabled = permission === 'granted';
        writePref(STORAGE_NOTIFY, notifyEnabled ? 'on' : 'off');
        renderNotify();
        showToast(notifyEnabled ? 'notificações ativadas' : 'permissão de notificação não concedida');
      })
      .catch(renderNotify);
    return;
  }
  notifyEnabled = !notifyEnabled;
  writePref(STORAGE_NOTIFY, notifyEnabled ? 'on' : 'off');
  renderNotify();
  showToast(notifyEnabled ? 'notificações ativadas' : 'notificações desativadas');
}

function announceRound() {
  const title = `Volta ${state.round} concluída`;
  const body = `Tempo esgotado · próxima volta em ${formatSeconds(state.next)}`;
  let delivered = false;

  if (notifyEnabled && notifySupported && Notification.permission === 'granted') {
    try {
      const note = new Notification(title, {
        body,
        tag: 'voltas-round',
        renotify: true,
        silent: true,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
      delivered = true;
    } catch {
      delivered = false;
    }
  }

  if (!delivered) {
    showToast(`${title} · ${body}`);
    if (document.hidden) document.title = `⏰ ${title}`;
  }
}

/* ---------- projeção ---------- */

const PROJECTED_ROUNDS = 12;
const MIN_TENTHS = MIN_SECONDS * 10;

// próximo tempo, em décimos — mesma conta para o relógio e para a projeção
function stepTenths(tenths) {
  const scaled = state.mode === 'inverse' ? tenths / PHI : tenths * PHI;
  return Math.max(MIN_TENTHS, Math.round(scaled));
}

function projectTenths(baseTenths, count) {
  const rows = [];
  let tenths = baseTenths;
  let total = 0;
  for (let n = 1; n <= count; n += 1) {
    if (n > 1) tenths = stepTenths(tenths);
    total += tenths;
    rows.push({ n, tenths, total });
  }
  return rows;
}

function renderProjection() {
  const baseTenths = Math.round((parseBase() ?? DEFAULT_SECONDS) * 10);
  const rows = projectTenths(baseTenths, PROJECTED_ROUNDS);
  const max = Math.max(...rows.map((row) => row.tenths));
  const W = 640;
  const baseY = 158;
  const top = 12;
  const slot = W / rows.length;
  const barW = Math.min(30, slot * 0.54);

  const bars = rows.map((row, index) => {
    const height = Math.max(2, (row.tenths / max) * (baseY - top));
    const x = (index * slot + (slot - barW) / 2).toFixed(1);
    const y = (baseY - height).toFixed(1);
    const hue = Math.round(145 - (index / (rows.length - 1)) * 145);
    const tip = `volta ${row.n} · ${formatTenths(row.tenths)} · acumulado ${formatTenths(row.total)}`;
    return `<g><title>${tip}</title>`
      + `<rect class="bar" x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}"`
      + ` rx="3" opacity=".82" fill="hsl(${hue}, 52%, 46%)"/>`
      + `<text x="${(index * slot + slot / 2).toFixed(1)}" y="${baseY + 18}"`
      + ` text-anchor="middle" font-size="11" fill="currentColor">${row.n}</text></g>`;
  }).join('');

  el.projChart.innerHTML = `<line x1="0" y1="${baseY + 0.5}" x2="${W}" y2="${baseY + 0.5}"`
    + ` stroke="currentColor" stroke-opacity=".15"/>${bars}`;

  el.projBody.innerHTML = rows.map((row) => `<tr><td>${pad2(row.n)}</td>`
    + `<td>${formatTenths(row.tenths)}</td><td>${formatTenths(row.total)}</td></tr>`).join('');

  el.projSub.textContent = `${PROJECTED_ROUNDS} voltas · base ${formatTenths(baseTenths)}`
    + ` · ${state.mode === 'inverse' ? 'φ inversa ÷1,618' : 'φ direta ×1,618'}`;
  el.projMax.textContent = `máx ${formatTenths(max)}`;
}

/* ---------- desenho do estado ---------- */

function setProgress(p) {
  el.dial.style.setProperty('--p', Math.min(1, Math.max(0, p)));
}

function cancelTimers() {
  cancelAnimationFrame(state.raf);
  clearTimeout(state.endTimer);
  state.raf = 0;
  state.endTimer = 0;
}

function renderSetup() {
  state.phase = 'setup';
  state.round = 0;
  cancelTimers();
  setProgress(0);
  el.meta.textContent = state.rounds.length ? 'nova sessão' : 'primeira volta';
  syncBase();
  el.setup.hidden = false;
  el.ready.hidden = true;
  el.stop.hidden = true;
}

function renderLog({ keepScroll = false } = {}) {
  const scrollTop = el.list.scrollTop;

  el.list.replaceChildren(...state.rounds.map((round, index) => {
    const color = LABEL_BY_ID.get(round.color);
    const li = document.createElement('li');
    const button = document.createElement('button');
    const dot = document.createElement('span');
    const body = document.createElement('span');
    const line = document.createElement('span');
    const n = document.createElement('span');
    const t = document.createElement('span');

    button.type = 'button';
    button.className = 'log__item';
    button.dataset.index = String(index);
    button.title = round.note || 'etiquetar volta';
    button.setAttribute('aria-label',
      `volta ${pad2(round.n)}, ${formatSeconds(round.seconds)}${round.note ? `, ${round.note}` : ''}`);

    dot.className = 'log__dot';
    if (color?.value) {
      button.style.setProperty('--label', color.value);
    } else {
      button.classList.add('log__item--plain');
    }

    body.className = 'log__body';
    line.className = 'log__line';
    n.className = 'log__n';
    t.className = 'log__t';
    n.textContent = pad2(round.n);
    t.textContent = formatSeconds(round.seconds);
    line.append(n, t);
    body.append(line);

    if (round.note) {
      const note = document.createElement('span');
      note.className = 'log__note';
      note.textContent = round.note;
      body.append(note);
    }

    button.append(dot, body);
    li.append(button);
    return li;
  }));

  const total = state.rounds.reduce((sum, round) => sum + round.seconds, 0);
  el.total.textContent = formatSeconds(total);
  el.empty.hidden = state.rounds.length > 0;
  el.logHint.hidden = state.rounds.length === 0;
  el.list.scrollTop = keepScroll ? scrollTop : el.list.scrollHeight;
}

/* ---------- etiquetas ---------- */

function buildLabelColors() {
  for (const color of LABEL_COLORS) {
    const option = document.createElement('label');
    const input = document.createElement('input');
    const swatch = document.createElement('span');

    option.className = 'label__opt';
    option.title = color.name;
    input.type = 'radio';
    input.name = 'color';
    input.value = color.id;
    input.setAttribute('aria-label', color.name);
    swatch.className = 'label__swatch';
    if (color.value) {
      swatch.style.setProperty('--swatch', color.value);
    } else {
      swatch.classList.add('label__swatch--none');
    }

    option.append(input, swatch);
    el.labelColors.append(option);
  }
}

function updateLabelCount() {
  el.labelCount.textContent = String(el.labelNote.value.length);
}

function openLabel(index) {
  const round = state.rounds[index];
  if (!round) {
    showToast('nenhuma volta para etiquetar');
    return;
  }
  state.labelIndex = index;
  el.labelSub.textContent = `volta ${pad2(round.n)} · ${formatSeconds(round.seconds)}`;
  el.labelNote.value = round.note ?? '';
  updateLabelCount();
  const value = round.color ?? 'none';
  for (const input of el.labelColors.querySelectorAll('input[name="color"]')) {
    input.checked = input.value === value;
  }
  el.label.showModal();
  el.labelNote.focus();
}

function saveLabel() {
  const round = state.rounds[state.labelIndex];
  if (round) {
    const picked = el.labelForm.querySelector('input[name="color"]:checked');
    const color = picked ? LABEL_BY_ID.get(picked.value) : null;
    round.color = color?.value ? color.id : null;
    round.note = el.labelNote.value.trim();
    renderLog({ keepScroll: true });
  }
  el.label.close();
}

/* ---------- ciclo da volta ---------- */

function startSession(seconds) {
  state.rounds = [];
  renderLog();
  startRound(seconds);
}

function startRound(seconds) {
  cancelTimers();
  enableAudio();
  askNotify();
  state.phase = 'running';
  state.round += 1;
  state.duration = seconds;
  state.next = 0;
  state.deadline = performance.now() + seconds * 1000;

  setProgress(0);
  el.meta.textContent = `volta ${state.round} · ${formatSeconds(seconds)}`;
  paintTime(formatRemaining(seconds * 1000));
  el.setup.hidden = true;
  el.ready.hidden = true;
  el.stop.hidden = false;

  el.stop.blur();
  state.raf = requestAnimationFrame(tick);
  state.endTimer = setTimeout(finishRound, seconds * 1000);
}

function tick() {
  if (state.phase !== 'running') return;
  const remaining = state.deadline - performance.now();
  if (remaining <= 0) {
    setProgress(1);
    paintTime(formatTenths(0));
    finishRound();
    return;
  }
  setProgress(1 - remaining / (state.duration * 1000));
  paintTime(formatRemaining(remaining));
  state.raf = requestAnimationFrame(tick);
}

function finishRound() {
  if (state.phase !== 'running') return;
  cancelTimers();
  state.phase = 'awaiting';
  playChime();

  setProgress(1);
  paintTime(formatTenths(0));
  el.meta.textContent = `volta ${state.round} concluída`;

  state.rounds.push({ n: state.round, seconds: state.duration, color: null, note: '' });
  state.next = stepTenths(Math.round(state.duration * 10)) / 10;
  renderLog();

  el.readyQ.textContent = `Pronto para a volta ${state.round + 1}?`;
  el.readyTime.textContent = formatSeconds(state.next);
  el.ready.hidden = false;
  el.setup.hidden = true;
  el.stop.hidden = false;

  announceRound();
}

function confirmNext() {
  if (state.phase !== 'awaiting') return;
  startRound(state.next);
}

function stopSession() {
  if (state.phase === 'setup') return;
  renderSetup();
}

/* ---------- atalhos ---------- */

function startOrConfirm() {
  if (state.phase === 'setup') {
    const seconds = parseBase() ?? DEFAULT_SECONDS;
    el.base.value = seconds;
    startSession(seconds);
  } else if (state.phase === 'awaiting') {
    confirmNext();
  }
}

function selectPreset(index) {
  if (state.phase !== 'setup') return;
  const preset = el.presets.querySelectorAll('.preset')[index];
  if (!preset) return;
  el.base.value = preset.dataset.seconds;
  syncBase();
}

function nudgeBase(event) {
  if (state.phase !== 'setup') return;
  const step = event.shiftKey ? 10 : 1;
  const delta = event.code === 'ArrowUp' ? step : -step;
  const current = parseBase() ?? DEFAULT_SECONDS;
  const next = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round((current + delta) * 10) / 10));
  el.base.value = next;
  syncBase();
}

function setMode(mode) {
  if (state.phase === 'running') return;
  state.mode = mode;
  for (const button of el.mode.querySelectorAll('.mode__opt')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  }
}

const SHORTCUTS = [
  {
    group: 'reprodução',
    keys: ['espaço'],
    codes: ['Space'],
    label: 'iniciar · confirmar próxima volta',
    action: 'start-next',
  },
  {
    group: 'reprodução',
    keys: ['P'],
    codes: ['KeyP'],
    label: 'parar sessão',
    action: 'stop',
  },
  {
    group: 'ajustes',
    keys: ['↑', '↓'],
    codes: ['ArrowUp', 'ArrowDown'],
    shift: 'any',
    repeat: true,
    label: 'ajustar a primeira volta',
    note: '±1 s · Shift ±10 s',
    action: 'nudge',
  },
  {
    group: 'ajustes',
    keys: ['1', '2', '3', '4'],
    codes: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    label: 'presets 30s · 1 · 2 · 5 min',
    action: 'preset',
  },
  {
    group: 'ajustes',
    keys: ['D'],
    codes: ['KeyD'],
    label: 'progressão direta ×φ',
    action: 'direct',
  },
  {
    group: 'ajustes',
    keys: ['I'],
    codes: ['KeyI'],
    label: 'progressão inversa ÷φ',
    action: 'inverse',
  },
  {
    group: 'etiquetas',
    keys: ['E'],
    codes: ['KeyE'],
    label: 'etiquetar a última volta',
    action: 'label-last',
  },
  {
    group: 'sistema',
    keys: ['N'],
    codes: ['KeyN'],
    label: 'notificações liga/desliga',
    action: 'notify',
    available: () => notifySupported,
  },
  {
    group: 'sistema',
    keys: ['?'],
    codes: ['Slash'],
    shift: true,
    label: 'mostrar estes atalhos',
    action: 'keys',
  },
  {
    group: 'sistema',
    keys: ['Esc'],
    codes: [],
    label: 'fechar diálogo',
    action: 'close',
  },
];

function matchesShortcut(shortcut, event) {
  if (shortcut.action === 'keys' && event.key === '?') return true;
  if (!shortcut.codes.includes(event.code)) return false;
  if (shortcut.shift === 'any') return true;
  return event.shiftKey === Boolean(shortcut.shift);
}

function renderShortcuts() {
  const groups = new Map();
  for (const shortcut of SHORTCUTS) {
    if (shortcut.available && !shortcut.available()) continue;
    if (!groups.has(shortcut.group)) groups.set(shortcut.group, []);
    groups.get(shortcut.group).push(shortcut);
  }

  el.keysBody.replaceChildren(...[...groups].map(([name, shortcuts]) => {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    const list = document.createElement('dl');

    section.className = 'keys__group';
    title.textContent = name;
    list.className = 'keys__list';

    for (const shortcut of shortcuts) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const desc = document.createElement('dd');

      row.className = 'keys__row';
      for (const key of shortcut.keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        term.append(kbd);
      }
      desc.textContent = shortcut.label;
      if (shortcut.note) {
        const note = document.createElement('span');
        note.className = 'keys__note';
        note.textContent = shortcut.note;
        desc.append(note);
      }
      row.append(term, desc);
      list.append(row);
    }

    section.append(title, list);
    return section;
  }));
}

function dialogs() {
  return [el.proj, el.label, el.keys].filter((dialog) => dialog.open);
}

function closeDialogs() {
  for (const dialog of dialogs()) dialog.close();
}

function openShortcuts() {
  renderShortcuts();
  el.keys.showModal();
}

function performAction(action, event) {
  switch (action) {
    case 'start-next': startOrConfirm(); break;
    case 'stop': stopSession(); break;
    case 'nudge': nudgeBase(event); break;
    case 'preset': selectPreset(Number(event.code.slice(-1)) - 1); break;
    case 'direct': setMode('direct'); break;
    case 'inverse': setMode('inverse'); break;
    case 'label-last': openLabel(state.rounds.length - 1); break;
    case 'notify': toggleNotify(); break;
    case 'keys': openShortcuts(); break;
    case 'close': closeDialogs(); break;
    default: break;
  }
}

/* ---------- eventos ---------- */

el.setup.addEventListener('submit', (event) => {
  event.preventDefault();
  const seconds = parseBase() ?? DEFAULT_SECONDS;
  el.base.value = seconds;
  startSession(seconds);
});

el.base.addEventListener('input', () => {
  if (state.phase === 'setup') syncBase();
});

el.presets.addEventListener('click', (event) => {
  const preset = event.target.closest('.preset');
  if (!preset) return;
  el.base.value = preset.dataset.seconds;
  syncBase();
});

el.stop.addEventListener('click', stopSession);
el.notify.addEventListener('click', toggleNotify);

el.mode.addEventListener('click', (event) => {
  const option = event.target.closest('.mode__opt');
  if (!option) return;
  setMode(option.dataset.mode);
});

el.projOpen.addEventListener('click', () => {
  if (el.proj.open) return;
  renderProjection();
  el.proj.showModal();
});

el.projClose.addEventListener('click', () => el.proj.close());
el.keysOpen.addEventListener('click', openShortcuts);
el.keysClose.addEventListener('click', () => el.keys.close());
el.labelClose.addEventListener('click', () => el.label.close());

el.list.addEventListener('click', (event) => {
  const item = event.target.closest('.log__item');
  if (item) openLabel(Number(item.dataset.index));
});

el.labelNote.addEventListener('input', updateLabelCount);

el.labelForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveLabel();
});

el.labelClear.addEventListener('click', () => {
  const round = state.rounds[state.labelIndex];
  if (round) {
    round.color = null;
    round.note = '';
    renderLog({ keepScroll: true });
  }
  el.label.close();
});

// espaço é reservado ao cronômetro: só inputs de texto o consomem
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target) {
  return target instanceof Element
    && (TYPING.has(target.tagName) || target.isContentEditable);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDialogs();
    return;
  }

  if (dialogs().length) {
    // espaço dentro do modal não aciona o botão focado nem o cronômetro
    if (event.code === 'Space' && !isTyping(event.target)) event.preventDefault();
    return;
  }

  if (isTyping(event.target)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const shortcut = SHORTCUTS.find((entry) => matchesShortcut(entry, event));
  if (!shortcut) return;
  if (event.repeat && !shortcut.repeat) return;

  event.preventDefault();
  performAction(shortcut.action, event);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  document.title = BASE_TITLE;
  if (state.phase === 'running' && performance.now() >= state.deadline) {
    finishRound();
  }
});

buildLabelColors();
renderNotify();
renderShortcuts();
renderSetup();
