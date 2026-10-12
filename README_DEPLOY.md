# 📦 Guia de Deploy — CRM Moura Leite

## ✅ Qual arquivo usar?

### `deploy.bat` — **USE SEMPRE ESTE**
- Incrementa a versão automaticamente no badge do sistema
- Cria commit com mensagem versionada
- Cria tag no GitHub (snapshot da pasta inteira)
- Faz push para GitHub → Vercel atualiza automaticamente

### `upload_config.bat` — Use quando mudar configurações de regras
- Sobe configurações do sistema para o Firebase
- Não é deploy de código — é configuração de dados

### `deploy_emergencia.bat` — Use APENAS se o deploy.bat falhar
- Envia direto para a Vercel via CLI
- **Não cria tag** e **não incrementa versão** no GitHub
- Exige login na Vercel

---

## 🔢 Como funciona o versionamento

```
deploy.bat
  │
  ├─ Lê a versão atual do badge no index.html (ex: v1.0.108)
  ├─ Incrementa o patch: v1.0.109
  ├─ Atualiza o badge na tela lateral do CRM
  ├─ git commit -m "v1.0.109 - DD/MM/AAAA"
  ├─ git tag v1.0.109   ← snapshot de toda a pasta
  ├─ git push           ← GitHub recebe → Vercel atualiza
  └─ git push --tags    ← Tag aparece no GitHub como versão
```

## 📁 Versões no GitHub

Acesse: **github.com/seu-usuario/CRM-gestao → Tags**

Cada tag é uma "foto" completa da pasta. Você pode:
- Navegar o código de qualquer versão anterior
- Baixar o ZIP de uma versão específica
- Ver exatamente o que mudou entre versões

### Restaurar uma versão localmente
```bat
git checkout v1.0.107    ← volta para esta versão
git checkout main        ← volta ao atual
```

---

## Publicação na Vercel
O deploy usa só o que está na raiz, em `api/` e em `lib/`. A pasta `arquivo/` guarda cópia antiga, script avulso e imagem de referência. Ela não entra na publicação.

Para publicar, use `deploy.bat` na raiz. O envio de emergência continua em `deploy_emergencia.bat`.

## Cópias antigas de deploy
- `arquivo/legado/deploy_vercel.bat` — substituído por `deploy.bat`
- `arquivo/legado/deploy_vercel_direto.bat` — substituído por `deploy_emergencia.bat`
