// Módulo de Autenticação Microsoft Azure AD (MSAL.js)
// Moura Leite Loteamentos - CRM de Cobrança

const AZURE_CONFIG_KEY = "crm_moura_azure_config";
const USER_SESSION_KEY = "crm_moura_user_session";

const DEFAULT_AZURE_CONFIG = {
  clientId: "643259b4-6f72-4f25-8a2d-ac131a34f169",
  tenantId: "34bf99e3-12de-4814-ab19-0d0f90fab15b",
  redirectUri: window.location.origin + window.location.pathname,
  enabled: true
};

let g_authConfig = DEFAULT_AZURE_CONFIG;
let msalInstance = null;
let msalReady = null;
let loginInFlight = false;
let sessionChannel = null;

function readSessionFromStore(store) {
  if (!store) return null;
  try {
    const raw = store.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user && user.email && user.isAuthenticated !== false) return user;
  } catch (e) {}
  return null;
}

function persistSession(user, fromBroadcast) {
  if (!user || !user.email) return user;
  const payload = JSON.stringify({
    name: user.name || "",
    email: String(user.email || "").toLowerCase(),
    isAuthenticated: true,
    method: user.method || "Azure AD"
  });
  try { localStorage.setItem(USER_SESSION_KEY, payload); } catch (e) {
    console.warn("Nao foi possivel gravar a sessao no localStorage:", e);
  }
  try { sessionStorage.setItem(USER_SESSION_KEY, payload); } catch (e) {}
  if (!fromBroadcast && sessionChannel) {
    try { sessionChannel.postMessage({ type: "session", user: JSON.parse(payload) }); } catch (e) {}
  }
  return user;
}

function clearPersistedSession(fromBroadcast) {
  try { localStorage.removeItem(USER_SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(USER_SESSION_KEY); } catch (e) {}
  if (!fromBroadcast && sessionChannel) {
    try { sessionChannel.postMessage({ type: "logout" }); } catch (e) {}
  }
}

function initSessionChannel() {
  if (sessionChannel || typeof BroadcastChannel === "undefined") return;
  try {
    sessionChannel = new BroadcastChannel("crm_moura_auth");
    sessionChannel.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (!msg) return;
      if (msg.type === "session" && msg.user) persistSession(msg.user, true);
      if (msg.type === "logout") clearPersistedSession(true);
    };
  } catch (e) {}
}

function saveAuthConfig(config) {
  g_authConfig = { ...g_authConfig, ...config };
  try {
    localStorage.setItem(AZURE_CONFIG_KEY, JSON.stringify(g_authConfig));
  } catch (e) {}
  initializeMsal();
}

function clearMsalInteractionLock() {
  const wipe = (store) => {
    if (!store) return;
    const keys = [];
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        const kl = k.toLowerCase();
        if (kl.includes("msal") && (kl.includes("interaction") || kl.includes("request.origin"))) {
          keys.push(k);
        }
      }
      keys.forEach((k) => store.removeItem(k));
    } catch (e) {}
  };
  wipe(window.sessionStorage);
  wipe(window.localStorage);
}

function initializeMsal() {
  if (msalInstance) return;
  if (g_authConfig.enabled && g_authConfig.clientId && g_authConfig.tenantId && window.msal) {
    const msalConfig = {
      auth: {
        clientId: g_authConfig.clientId,
        authority: `https://login.microsoftonline.com/${g_authConfig.tenantId}`,
        redirectUri: g_authConfig.redirectUri
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: true
      }
    };
    try {
      msalInstance = new msal.PublicClientApplication(msalConfig);
      msalReady = (typeof msalInstance.initialize === "function")
        ? msalInstance.initialize().catch((e) => {
            console.warn("MSAL initialize:", e);
          })
        : Promise.resolve();
    } catch (e) {
      console.error("Erro ao inicializar o MSAL.js:", e);
      msalInstance = null;
      msalReady = Promise.resolve();
    }
  } else {
    msalInstance = null;
    msalReady = Promise.resolve();
  }
}

function getCurrentUser() {
  const fromLocal = readSessionFromStore(window.localStorage);
  if (fromLocal) {
    try { sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(fromLocal)); } catch (e) {}
    return fromLocal;
  }
  return readSessionFromStore(window.sessionStorage);
}

function userFromMsalAccount(account) {
  if (!account || !account.username) return null;
  const email = String(account.username || "").toLowerCase();
  if (!validateDomain(email)) return null;
  return {
    name: account.name || email.split("@")[0].toUpperCase(),
    email: email,
    isAuthenticated: true,
    method: "Azure AD"
  };
}

async function restoreSession() {
  initSessionChannel();
  if (msalReady) {
    try { await msalReady; } catch (e) {}
  }
  const existing = getCurrentUser();
  if (existing) return existing;

  if (msalInstance && typeof msalInstance.getAllAccounts === "function") {
    const accounts = msalInstance.getAllAccounts() || [];
    const user = userFromMsalAccount(accounts[0]);
    if (user) return persistSession(user);
  }
  return null;
}

function validateDomain(email) {
  if (!email) return false;
  const domain = email.split("@")[1];
  return domain && (domain.toLowerCase() === "mouraleite.com" || domain.toLowerCase() === "mouraleite.com.br");
}

function isInteractionInProgress(error) {
  const code = String((error && error.errorCode) || "");
  const msg = String((error && error.message) || error || "");
  return code === "interaction_in_progress" || /interaction_in_progress|interaction is currently in progress/i.test(msg);
}

async function login() {
  if (loginInFlight) {
    throw new Error("Login já em andamento. Feche o popup da Microsoft ou atualize a página.");
  }
  loginInFlight = true;
  try {
    if (g_authConfig.enabled && msalInstance) {
      if (msalReady) await msalReady;
      const loginRequest = {
        scopes: ["user.read"],
        prompt: "select_account"
      };
      let loginResponse;
      try {
        loginResponse = await msalInstance.loginPopup(loginRequest);
      } catch (error) {
        if (isInteractionInProgress(error)) {
          clearMsalInteractionLock();
          loginResponse = await msalInstance.loginPopup(loginRequest);
        } else {
          throw error;
        }
      }

      const email = loginResponse.account.username;

      if (!validateDomain(email)) {
        try { await msalInstance.logoutPopup(); } catch (e) {}
        throw new Error("Acesso negado. Apenas e-mails do domínio @mouraleite.com.br são permitidos.");
      }

      const user = {
        name: loginResponse.account.name || email.split("@")[0].toUpperCase(),
        email: email,
        isAuthenticated: true,
        method: "Azure AD"
      };

      persistSession(user);
      return user;
    }

    if (g_authConfig.enabled) {
      throw new Error("Login Microsoft indisponível. Atualize a página (Ctrl+F5) e tente de novo.");
    }

    return new Promise((resolve, reject) => {
      window.showMockLoginModal(resolve, reject);
    });
  } catch (error) {
    console.error("Falha no login Azure AD:", error);
    if (isInteractionInProgress(error)) {
      clearMsalInteractionLock();
    }
    throw error;
  } finally {
    loginInFlight = false;
  }
}

async function logout(opts) {
  clearPersistedSession(!!(opts && opts.silent));
  window.location.reload();
}

initSessionChannel();
initializeMsal();

window.MouraAuth = {
  login,
  logout,
  getCurrentUser,
  restoreSession,
  persistSession,
  getAuthConfig: () => g_authConfig,
  saveAuthConfig,
  validateDomain,
  clearMsalInteractionLock
};
