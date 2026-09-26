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
  try {
    return JSON.parse(localStorage.getItem(USER_SESSION_KEY)) || null;
  } catch (e) {
    return null;
  }
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

      try {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
      } catch (e) {
        console.warn("Nao foi possivel gravar a sessao no localStorage:", e);
      }
      return user;
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

async function logout() {
  localStorage.removeItem(USER_SESSION_KEY);
  window.location.reload();
}

initializeMsal();

window.MouraAuth = {
  login,
  logout,
  getCurrentUser,
  getAuthConfig: () => g_authConfig,
  saveAuthConfig,
  validateDomain,
  clearMsalInteractionLock
};
