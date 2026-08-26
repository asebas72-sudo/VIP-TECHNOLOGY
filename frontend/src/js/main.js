import { login, logout, obtenerSesion, obtenerPerfilActual } from './auth.js';
import { navigate } from './router.js';
import { LOGO_DATA_URL } from './logo.js';

document.getElementById('login-logo').src = LOGO_DATA_URL;
document.getElementById('header-logo').src = LOGO_DATA_URL;

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const userBadge = document.getElementById('user-badge');
const logoutBtn = document.getElementById('logout-btn');
const mainContent = document.getElementById('main-content');

async function mostrarApp() {
  const perfil = await obtenerPerfilActual();
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  userBadge.textContent = perfil ? `${perfil.nombre} · ${perfil.rol}` : '';
  await navigate('menu', mainContent);
}

function mostrarLogin() {
  appShell.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Verificando…';

  const usuario = document.getElementById('login-usuario').value.trim();
  const clave = document.getElementById('login-clave').value;

  try {
    await login(usuario, clave);
    loginForm.reset();
    await mostrarApp();
  } catch (err) {
    loginError.textContent = err.message || 'No se pudo iniciar sesión.';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Ingresar';
  }
});

logoutBtn.addEventListener('click', async () => {
  await logout();
  mostrarLogin();
});

(async function init() {
  const sesion = await obtenerSesion();
  if (sesion) {
    await mostrarApp();
  } else {
    mostrarLogin();
  }
})();
