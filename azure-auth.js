// Módulo de Autenticação Microsoft Azure AD (MSAL.js)
// Moura Leite Loteamentos - CRM de Cobrança

const AZURE_CONFIG_KEY = "crm_moura_azure_config";
const USER_SESSION_KEY = "crm_moura_user_session";

// Configurações padrão do Azure AD (inicialmente em branco ou placeholder)
const DEFAULT_AZURE_CONFIG = {
  clientId: "",
  tenantId: "",
  redirectUri: window.location.origin + window.location.pathname,
  enabled: false // Se falso, usa o simulador interativo de login
};

// Carregar configuração salva ou padrão
let g_authConfig = JSON.parse(localStorage.getItem(AZURE_CONFIG_KEY)) || DEFAULT_AZURE_CONFIG;

// Instância MSAL (inicializada apenas se o login real estiver habilitado)
let msalInstance = null;

function saveAuthConfig(config) {
  g_authConfig = { ...g_authConfig, ...config };
  localStorage.setItem(AZURE_CONFIG_KEY, JSON.stringify(g_authConfig));
  initializeMsal();
}

function initializeMsal() {
  if (g_authConfig.enabled && g_authConfig.clientId && g_authConfig.tenantId) {
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
    } catch (e) {
      console.error("Erro ao inicializar o MSAL.js:", e);
    }
  } else {
    msalInstance = null;
  }
}

// Obter usuário atual logado
function getCurrentUser() {
  return JSON.parse(localStorage.getItem(USER_SESSION_KEY)) || null;
}

// Validar se o domínio do e-mail é @mouraleite.com
function validateDomain(email) {
  if (!email) return false;
  const domain = email.split("@")[1];
  return domain && domain.toLowerCase() === "mouraleite.com";
}

// Fluxo de Login
async function login() {
  if (g_authConfig.enabled && msalInstance) {
    // Login Real via Microsoft Azure AD
    try {
      const loginRequest = {
        scopes: ["user.read"]
      };
      const loginResponse = await msalInstance.loginPopup(loginRequest);
      
      const email = loginResponse.account.username;
      
      // Validação crítica de domínio corporativo
      if (!validateDomain(email)) {
        await msalInstance.logoutPopup();
        throw new Error("Acesso negado. Apenas e-mails do domínio @mouraleite.com são permitidos.");
      }

      const user = {
        name: loginResponse.account.name || email.split("@")[0].toUpperCase(),
        email: email,
        isAuthenticated: true,
        method: "Azure AD"
      };

      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
      return user;
    } catch (error) {
      console.error("Falha no login Azure AD:", error);
      throw error;
    }
  } else {
    // LOGIN SIMULADO (caso Azure AD não esteja ativado)
    // O programador pode testar de forma interativa
    return new Promise((resolve, reject) => {
      // Abriremos um prompt ou modal amigável no app.js
      // Esta função retornará uma promessa que o app.js resolverá após obter o e-mail no modal
      window.showMockLoginModal(resolve, reject);
    });
  }
}

// Fluxo de Logout
async function logout() {
  const user = getCurrentUser();
  localStorage.removeItem(USER_SESSION_KEY);
  
  if (g_authConfig.enabled && msalInstance && user && user.method === "Azure AD") {
    try {
      await msalInstance.logoutPopup();
    } catch (e) {
      console.error("Erro no logout do Azure AD:", e);
    }
  }
  
  window.location.reload();
}

// Inicializa o MSAL ao carregar o script
initializeMsal();

window.MouraAuth = {
  login,
  logout,
  getCurrentUser,
  getAuthConfig: () => g_authConfig,
  saveAuthConfig,
  validateDomain
};
