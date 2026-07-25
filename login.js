import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ycoyqkyuiagickmfinpg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GgvdMhheTPbFIsaiSwKOZQ_kh2up-yu';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);

function setStatus(text, ok = true) {
  const el = $('connectionStatus');
  el.textContent = text;
  el.className = ok ? 'status-pill ok' : 'status-pill error';
}

function setAuthBusy(isBusy, text) {
  $('loginBtn').disabled = isBusy;
  $('magicLinkBtn').disabled = isBusy;
  if (text) setStatus(text);
}

async function init() {
  $('loginForm').addEventListener('submit', login);
  $('magicLinkBtn').addEventListener('click', sendMagicLink);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=4').catch(() => {});
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.replace('./index.html');
    return;
  }

  setStatus('Sin sesión', false);

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) window.location.replace('./index.html');
  });
}

async function login(event) {
  event.preventDefault();

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

  setAuthBusy(true, 'Entrando…');

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  setAuthBusy(false);

  if (error) {
    $('loginMessage').textContent = 'Error: ' + error.message;
    setStatus('Error de login', false);
    return;
  }

  $('passwordInput').value = '';
  $('loginMessage').textContent = 'Has entrado correctamente. Abriendo el panel…';
  setStatus('Conectado');
  window.location.href = './index.html';
}

async function sendMagicLink() {
  const email = $('emailInput').value.trim();
  $('loginMessage').textContent = '';

  if (!email) {
    $('loginMessage').textContent = 'Escribe tu email primero.';
    return;
  }

  setAuthBusy(true, 'Enviando enlace…');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL('./login.html', window.location.href).href
    }
  });

  setAuthBusy(false);

  if (error) {
    $('loginMessage').textContent = 'Error: ' + error.message;
    setStatus('Límite de email o error', false);
    return;
  }

  $('loginMessage').textContent = 'Listo. Mira tu correo y toca el enlace para entrar.';
  setStatus('Enlace enviado');
}

init();
