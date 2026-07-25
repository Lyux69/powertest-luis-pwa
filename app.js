import { APPS_SCRIPT_API_URL, REFRESH_SECONDS } from './config.js?v=4';

const $ = (id) => document.getElementById(id);

const state = {
  view: 'hoy',
  tests: [],
  fallos: [],
  temas: [],
  summary: {},
  loading: false,
  timer: null,
  lastUpdate: null
};

function setStatus(text, ok = true) {
  const el = $('connectionStatus');
  el.textContent = text;
  el.className = ok ? 'status-pill ok' : 'status-pill error';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function fmtPercent(value) {
  const n = numberValue(value);
  if (n === null) return '-';
  return `${Math.round(n * 100) / 100}%`;
}

function fmtDate(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePayload(payload) {
  const tests = normalizeArray(payload.tests || payload.ultimosTests || payload.powerTest || payload.rows);
  const fallos = normalizeArray(payload.fallos || payload.errores || payload.failed || payload.preguntasFalladas);
  const temas = normalizeArray(payload.temas || payload.temas_progreso || payload.temasDebiles || payload.progress);
  const summary = payload.summary || payload.resumen || payload.estado || {};
  return { tests, fallos, temas, summary };
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  renderContent();
}

async function init() {
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  $('refreshBtn').addEventListener('click', () => loadData(true));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=4').catch(() => {});
  }

  $('autoRefreshText').textContent = `Auto: cada ${REFRESH_SECONDS} s`;

  await loadData(false);
  state.timer = window.setInterval(() => loadData(false), REFRESH_SECONDS * 1000);
}

async function loadData(manual = false) {
  if (state.loading) return;

  if (!APPS_SCRIPT_API_URL) {
    setStatus('Pendiente URL Apps Script', false);
    $('setupWarning').hidden = false;
    renderEmptyPreparedState();
    return;
  }

  state.loading = true;
  $('refreshBtn').disabled = true;
  setStatus(manual ? 'Actualizando…' : 'Leyendo Sheet…');

  try {
    const url = new URL(APPS_SCRIPT_API_URL);
    url.searchParams.set('modo', 'pwa');
    url.searchParams.set('t', Date.now().toString());

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Apps Script respondió ${response.status}`);

    const payload = await response.json();
    const data = normalizePayload(payload);

    state.tests = data.tests;
    state.fallos = data.fallos;
    state.temas = data.temas;
    state.summary = data.summary;
    state.lastUpdate = new Date();

    $('setupWarning').hidden = true;
    renderDashboard();
    renderContent();
    setStatus('Conectado a Google Sheets');
    $('lastUpdateText').textContent = `Última actualización: ${state.lastUpdate.toLocaleTimeString('es-ES')}`;
  } catch (error) {
    setStatus('Error leyendo Apps Script', false);
    $('contentArea').innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  } finally {
    state.loading = false;
    $('refreshBtn').disabled = false;
  }
}

function renderEmptyPreparedState() {
  state.tests = [];
  state.fallos = [];
  state.temas = [];
  renderDashboard();
  renderContent();
  $('lastUpdateText').textContent = 'Esperando URL de Apps Script';
}

function getTestPercent(test) {
  return numberValue(test.porcentaje ?? test.percent ?? test.media ?? test.score ?? test.nota);
}

function getAciertos(test) {
  return numberValue(test.aciertos ?? test.correctas ?? test.correct ?? test.ok);
}

function getFallos(test) {
  return numberValue(test.fallos ?? test.incorrectas ?? test.failed ?? test.errores);
}

function getNoRespondidas(test) {
  return numberValue(test.no_respondidas ?? test.sinResponder ?? test.blank ?? test.vacias);
}

function getTemaPercent(tema) {
  return numberValue(tema.porcentaje_acierto ?? tema.porcentaje ?? tema.percent ?? tema.media);
}

function renderDashboard() {
  $('testsCount').textContent = state.tests.length;
  $('fallosCount').textContent = state.fallos.length;

  const scores = state.tests.map(getTestPercent).filter((n) => n !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  $('averageScore').textContent = fmtPercent(avg);

  const weakest = [...state.temas]
    .map((tema) => ({ tema, percent: getTemaPercent(tema) }))
    .filter((x) => x.percent !== null)
    .sort((a, b) => a.percent - b.percent)[0];
  $('weakTopic').textContent = weakest ? (weakest.tema.tema || weakest.tema.nombre || weakest.tema.bloque || 'Tema') : '-';

  updateDonut();
}

function updateDonut() {
  const latest = state.tests[0] || {};
  const aciertos = getAciertos(latest) ?? 0;
  const fallos = getFallos(latest) ?? 0;
  const vacias = getNoRespondidas(latest) ?? 0;
  const total = aciertos + fallos + vacias;
  const good = total ? Math.round((aciertos / total) * 100) : 0;
  const bad = total ? Math.round((fallos / total) * 100) : 0;
  const empty = Math.max(0, 100 - good - bad);
  $('donutChart').style.setProperty('--good', good);
  $('donutChart').style.setProperty('--bad', bad);
  $('donutChart').style.setProperty('--empty', empty);
}

function renderContent() {
  renderDashboard();
  if (state.view === 'hoy') return renderHoy();
  if (state.view === 'tests') return renderTests();
  if (state.view === 'fallos') return renderFallos();
  if (state.view === 'temas') return renderTemas();
}

function emptyMessage(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function renderHoy() {
  $('contentTitle').textContent = 'Hoy';
  const latest = state.tests[0];
  const weak = [...state.temas]
    .map((tema) => ({ tema, percent: getTemaPercent(tema) }))
    .filter((x) => x.percent !== null)
    .sort((a, b) => a.percent - b.percent)[0];

  if (!latest && !weak && !state.fallos.length) {
    $('contentArea').innerHTML = emptyMessage(APPS_SCRIPT_API_URL ? 'No hay datos todavía en la respuesta de Apps Script.' : 'La migración está preparada. Falta pegar la URL de Apps Script para leer Google Sheets.');
    return;
  }

  const recommendation = weak
    ? `Repasa ${weak.tema.tema || weak.tema.nombre || 'el tema más débil'}: está en ${fmtPercent(weak.percent)}.`
    : state.fallos.length
      ? 'Empieza por repasar las preguntas falladas pendientes.'
      : 'Vas bien. Haz un test nuevo cuando puedas.';

  $('contentArea').innerHTML = `
    <article class="item highlight">
      <h3>Qué hacer ahora</h3>
      <p>${escapeHtml(recommendation)}</p>
    </article>
    <article class="item">
      <h3>Último test</h3>
      ${latest ? `
        <p>${escapeHtml(latest.nombre || latest.test || latest.titulo || 'Test sin nombre')}</p>
        <p>Resultado: <strong>${escapeHtml(fmtPercent(getTestPercent(latest)))}</strong></p>
        <p>${fmtDate(latest.fecha || latest.created_at || latest.timestamp)}</p>
      ` : '<p>No hay test reciente.</p>'}
    </article>
  `;
}

function renderTests() {
  $('contentTitle').textContent = 'Mis tests';
  if (!state.tests.length) {
    $('contentArea').innerHTML = emptyMessage('No hay tests todavía. Cuando Google Sheets tenga datos, aparecerán aquí.');
    return;
  }

  $('contentArea').innerHTML = state.tests.map((test) => `
    <article class="item">
      <div class="item-top">
        <h3>${escapeHtml(test.nombre || test.test || test.titulo || 'Test sin nombre')}</h3>
        <strong class="score ${scoreClass(getTestPercent(test))}">${escapeHtml(fmtPercent(getTestPercent(test)))}</strong>
      </div>
      <p>${fmtDate(test.fecha || test.created_at || test.timestamp)} · ${escapeHtml(test.origen || 'Google Sheets')}</p>
      <p>Aciertos: ${escapeHtml(getAciertos(test) ?? '-')} · Fallos: ${escapeHtml(getFallos(test) ?? '-')} · Sin responder: ${escapeHtml(getNoRespondidas(test) ?? '-')}</p>
    </article>
  `).join('');
}

function renderFallos() {
  $('contentTitle').textContent = 'Preguntas falladas';
  if (!state.fallos.length) {
    $('contentArea').innerHTML = emptyMessage('No hay fallos pendientes. Perfecto, no tienes errores para repasar ahora.');
    return;
  }

  $('contentArea').innerHTML = state.fallos.map((fallo) => `
    <article class="item">
      <h3>${escapeHtml(fallo.tema || fallo.bloque || 'Sin tema')}</h3>
      <p>${escapeHtml(fallo.pregunta || fallo.enunciado || 'Pregunta sin texto')}</p>
      <p>Tu respuesta: ${escapeHtml(fallo.tu_respuesta || fallo.respuesta_usuario || '-')}</p>
      <p>Correcta: <strong>${escapeHtml(fallo.respuesta_correcta || fallo.correcta || '-')}</strong></p>
    </article>
  `).join('');
}

function renderTemas() {
  $('contentTitle').textContent = 'Temas débiles';
  if (!state.temas.length) {
    $('contentArea').innerHTML = emptyMessage('No hay temas débiles todavía. Necesitamos datos del Sheet para calcularlos.');
    return;
  }

  $('contentArea').innerHTML = state.temas.map((tema) => {
    const percent = getTemaPercent(tema);
    return `
      <article class="item">
        <div class="item-top">
          <h3>${escapeHtml(tema.tema || tema.nombre || 'Tema')}</h3>
          <strong class="score ${scoreClass(percent)}">${escapeHtml(fmtPercent(percent))}</strong>
        </div>
        <p>Bloque: ${escapeHtml(tema.bloque || '-')}</p>
        <p>Total: ${escapeHtml(tema.total_preguntas ?? tema.total ?? '-')} · Fallos: ${escapeHtml(tema.fallos ?? tema.errores ?? '-')}</p>
      </article>
    `;
  }).join('');
}

function scoreClass(percent) {
  const n = numberValue(percent);
  if (n === null) return 'neutral';
  if (n < 50) return 'bad';
  if (n < 70) return 'warn';
  return 'good';
}

init();
