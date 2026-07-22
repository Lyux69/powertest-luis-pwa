import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ycoyqkyuiagickmfinpg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GgvdMhheTPbFIsaiSwKOZQ_kh2up-yu';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);

const state = {
  view: 'tests',
  session: null,
  tests: [],
  fallos: [],
  temas: [],
  loading: false
};

function setStatus(text, ok = true) {
  const el = $('connectionStatus');
  el.textContent = text;
  el.className = ok ? 'status-pill ok' : 'status-pill error';
}

function setBusy(isBusy, text = 'Cargando…') {
  state.loading = isBusy;
  $('refreshBtn').disabled = isBusy;
  $('saveTestBtn').disabled = isBusy;
  if (isBusy) setStatus(text);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fmtPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `${Math.round(n * 100) / 100}%`;
}

async function init() {
  $('loginBtn').addEventListener('click', login);
  $('magicLinkBtn').addEventListener('click', sendMagicLink);
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', loadData);
  $('testForm').addEventListener('submit', saveManualTest);

  ['testTotal', 'testAciertos'].forEach((id) => {
    $(id).addEventListener('input', autoCalculatePercent);
  });

  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=3').catch(() => {});
  }

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  updateAuthUi();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAuthUi();
    if (session) loadData();
  });

  if (state.session) {
    await loadData();
  } else {
    setStatus('Sin sesión', false);
  }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  renderContent();
}

async function login() {
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  $('loginMessage').textContent = '';

  if (!email) {
    $('loginMessage').textContent = 'Escribe tu email primero.';
    return;
  }

  if (!password) {
    $('loginMessage').textContent = 'Escribe tu contraseña.';
    return;
  }

  $('loginBtn').disabled = true;
  $('magicLinkBtn').disabled = true;
  setStatus('Entrando…');

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  $('loginBtn').disabled = false;
  $('magicLinkBtn').disabled = false;

  if (error) {
    $('loginMessage').textContent = 'Error: ' + error.message;
    setStatus('Error de login', false);
    return;
  }

  $('passwordInput').value = '';
  $('loginMessage').textContent = 'Has entrado correctamente.';
  setStatus('Conectado');
}

async function sendMagicLink() {
  const email = $('emailInput').value.trim();
  $('loginMessage').textContent = '';

  if (!email) {
    $('loginMessage').textContent = 'Escribe tu email primero.';
    return;
  }

  $('loginBtn').disabled = true;
  $('magicLinkBtn').disabled = true;
  setStatus('Enviando enlace…');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href
    }
  });

  $('loginBtn').disabled = false;
  $('magicLinkBtn').disabled = false;

  if (error) {
    $('loginMessage').textContent = 'Error: ' + error.message;
    setStatus('Límite de email o error', false);
    return;
  }

  $('loginMessage').textContent = 'Listo. Mira tu correo y toca el enlace para entrar.';
  setStatus('Enlace enviado');
}

async function logout() {
  await supabase.auth.signOut();
  state.tests = [];
  state.fallos = [];
  state.temas = [];
  updateAuthUi();
  setStatus('Sin sesión', false);
}

function updateAuthUi() {
  const logged = Boolean(state.session);
  $('loginCard').hidden = logged;
  $('dashboard').hidden = !logged;
  $('actions').hidden = !logged;
  $('newTestCard').hidden = !logged || state.view !== 'new';
  $('contentCard').hidden = !logged || state.view === 'new';

  if (logged) {
    setStatus('Conectado');
  }
}

async function loadData() {
  if (!state.session || state.loading) return;
  setBusy(true, 'Cargando…');

  const [testsRes, fallosRes, temasRes] = await Promise.all([
    supabase.from('tests').select('*').order('fecha', { ascending: false }).limit(30),
    supabase.from('fallos').select('*').eq('repasada', false).order('fecha', { ascending: false }).limit(50),
    supabase.from('temas_progreso').select('*').order('porcentaje_acierto', { ascending: true, nullsFirst: true }).limit(20)
  ]);

  const firstError = testsRes.error || fallosRes.error || temasRes.error;
  if (firstError) {
    setBusy(false);
    setStatus('Error leyendo datos', false);
    $('contentArea').innerHTML = `<p class="error-text">${escapeHtml(firstError.message)}</p>`;
    return;
  }

  state.tests = testsRes.data ?? [];
  state.fallos = fallosRes.data ?? [];
  state.temas = temasRes.data ?? [];

  $('testsCount').textContent = state.tests.length;
  $('fallosCount').textContent = state.fallos.length;
  $('temasCount').textContent = state.temas.length;
  $('lastUpdateText').textContent = 'Actualizado ahora';

  renderContent();
  setBusy(false);
  setStatus('Conectado');
}

function numberOrNull(id) {
  const raw = $(id).value.trim().replace(',', '.');
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function intOrNull(id) {
  const value = numberOrNull(id);
  return value === null ? null : Math.trunc(value);
}

function autoCalculatePercent() {
  const total = intOrNull('testTotal');
  const aciertos = intOrNull('testAciertos');
  if (total && aciertos !== null && !$('testPorcentaje').matches(':focus')) {
    $('testPorcentaje').value = Math.round((aciertos / total) * 10000) / 100;
  }
}

async function saveManualTest(event) {
  event.preventDefault();

  if (!state.session?.user?.id) {
    $('testFormMessage').textContent = 'Primero tienes que entrar con tu email.';
    return;
  }

  const nombre = $('testNombre').value.trim();
  if (!nombre) {
    $('testFormMessage').textContent = 'Pon un nombre al test.';
    return;
  }

  const totalPreguntas = intOrNull('testTotal');
  const aciertos = intOrNull('testAciertos');
  const fallos = intOrNull('testFallos');
  const noRespondidas = intOrNull('testNoRespondidas');
  let porcentaje = numberOrNull('testPorcentaje');
  const tema = $('testTema').value.trim();

  if (totalPreguntas !== null && aciertos !== null && aciertos > totalPreguntas) {
    $('testFormMessage').textContent = 'Los aciertos no pueden ser más que las preguntas.';
    return;
  }

  if (porcentaje === null && totalPreguntas && aciertos !== null) {
    porcentaje = Math.round((aciertos / totalPreguntas) * 10000) / 100;
  }

  $('testFormMessage').textContent = 'Guardando test…';
  setBusy(true, 'Guardando…');

  const { error } = await supabase.from('tests').insert({
    user_id: state.session.user.id,
    fecha: new Date().toISOString(),
    origen: 'Manual PWA',
    nombre,
    porcentaje,
    aprobado: porcentaje === null ? null : porcentaje >= 50,
    total_preguntas: totalPreguntas,
    aciertos,
    fallos,
    no_respondidas: noRespondidas,
    raw: tema ? { tema_principal: tema } : null
  });

  if (error) {
    setBusy(false);
    $('testFormMessage').textContent = 'Error guardando: ' + error.message;
    setStatus('Error guardando', false);
    return;
  }

  $('testForm').reset();
  $('testFormMessage').textContent = 'Test guardado correctamente.';
  setView('tests');
  setBusy(false);
  await loadData();
}

function renderContent() {
  updateAuthUi();
  if (state.view === 'tests') return renderTests();
  if (state.view === 'fallos') return renderFallos();
  if (state.view === 'temas') return renderTemas();
}

function emptyMessage(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function renderTests() {
  $('contentTitle').textContent = 'Últimos tests';
  if (!state.tests.length) {
    $('contentArea').innerHTML = emptyMessage('Todavía no hay tests guardados en Supabase. Pulsa “Nuevo test” para meter uno.');
    return;
  }

  $('contentArea').innerHTML = state.tests.map((test) => `
    <article class="item">
      <div class="item-top">
        <h3>${escapeHtml(test.nombre || 'Test sin nombre')}</h3>
        <strong class="score">${escapeHtml(fmtPercent(test.porcentaje))}</strong>
      </div>
      <p>${fmtDate(test.fecha)} · ${escapeHtml(test.origen || 'PowerTest')}</p>
      <p>Aciertos: ${escapeHtml(test.aciertos ?? '-')} · Fallos: ${escapeHtml(test.fallos ?? '-')} · Sin responder: ${escapeHtml(test.no_respondidas ?? '-')}</p>
    </article>
  `).join('');
}

function renderFallos() {
  $('contentTitle').textContent = 'Fallos pendientes';
  if (!state.fallos.length) {
    $('contentArea').innerHTML = emptyMessage('Todavía no hay fallos pendientes.');
    return;
  }

  $('contentArea').innerHTML = state.fallos.map((fallo) => `
    <article class="item">
      <h3>${escapeHtml(fallo.tema || 'Sin tema')}</h3>
      <p>${escapeHtml(fallo.pregunta)}</p>
      <p>Tu respuesta: ${escapeHtml(fallo.tu_respuesta || '-')}</p>
      <p>Correcta: <strong>${escapeHtml(fallo.respuesta_correcta || '-')}</strong></p>
    </article>
  `).join('');
}

function renderTemas() {
  $('contentTitle').textContent = 'Temas débiles';
  if (!state.temas.length) {
    $('contentArea').innerHTML = emptyMessage('Todavía no hay temas registrados.');
    return;
  }

  $('contentArea').innerHTML = state.temas.map((tema) => `
    <article class="item">
      <div class="item-top">
        <h3>${escapeHtml(tema.tema)}</h3>
        <strong class="score">${escapeHtml(fmtPercent(tema.porcentaje_acierto))}</strong>
      </div>
      <p>Bloque: ${escapeHtml(tema.bloque || '-')}</p>
      <p>Total: ${escapeHtml(tema.total_preguntas)} · Fallos: ${escapeHtml(tema.fallos)}</p>
    </article>
  `).join('');
}

init();
