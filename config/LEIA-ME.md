# Versões e atualizações

O mesmo código gera duas versões. Elas só mudam no arquivo `src/edition.json`, copiado antes do build.

| | Versão aberta | Versão da clínica |
|---|---|---|
| Configuração | `config/aberta.json` (está no GitHub) | `config/clinica.json` (**não** vai para o GitHub) |
| Gerada por | GitHub Actions, ao criar uma tag `v0.6.0` | servidor da clínica (VPS) ou `npm run release:clinica` |
| Atualiza por | GitHub Releases | servidor da clínica |
| Conferência | SHA-256 (+ assinatura, se o segredo `DL_SIGN_KEY` existir) | SHA-256 + assinatura ECDSA da clínica (obrigatória) |

Sem `src/edition.json` (por exemplo, rodando com `npm start`), o atualizador fica desligado.

## Como o app atualiza
Ao abrir, o jogo lê `<feed>update.json`. Se houver versão nova, mostra "Tem uma versão nova!" e atualiza antes de jogar:
- PC: baixa o instalador, confere, instala sozinho (`/S --force-run`) e abre o jogo de novo.
- Android: baixa o APK, confere e o Android pergunta "Instalar?". Na primeira vez pede a permissão "instalar apps desta fonte".
Sem internet ou com qualquer erro, joga a versão atual.

## Formato do servidor de atualizações (o "feed")
Uma pasta HTTPS (o endereço termina com `/`) com:
- `update.json`:
  ```json
  { "version": "0.6.0", "edition": "clinica", "date": "2026-11-26", "notes": "",
    "windows": { "url": "Dedos-Ligeiros-Instalador-0.6.0.exe", "sha256": "…", "size": 0 },
    "android": { "url": "Dedos-Ligeiros-0.6.0.apk", "versionCode": 600, "sha256": "…", "size": 0 } }
  ```
  `url` é relativo ao feed. `versionCode` = maior×10000 + menor×100 + correção (o `build.gradle` calcula do `package.json`).
- `update.json.sig`: base64 da assinatura ECDSA P-256 / SHA-256 dos bytes exatos de `update.json`, formato r||s (64 bytes).
- O instalador `.exe` e o `.apk`.

Envie os arquivos grandes primeiro e `update.json` + `.sig` por último.

`src/edition.json` dentro do app: `{ "edition": "clinica", "feed": "https://…/atualizacoes/", "publicKey": "<base64 SPKI DER>" }`.
O app leva só a chave **pública**. Nenhuma senha ou chave privada vai dentro do app.

## Arquivos secretos (todos no .gitignore, guarde cópia de segurança)
- `config/clinica.json`: feed, chave pública e destino na VPS.
- `config/chave-privada.pem`: assina as atualizações. Sem ela, os apps da clínica não aceitam mais atualizações e precisam ser reinstalados.
- `config/android.jks` e `config/android.properties`: chave do APK. O Android só atualiza um app assinado com a mesma chave.

## Comandos (`scripts/release.js`)
- `npm run release:chave`: cria a chave de assinatura e a chave do Android (uma vez só) e preenche `config/clinica.json`.
- `npm run release:clinica`: gera instalador e APK da clínica em `dist/clinica/` com `update.json` assinado (`-- --sem-windows` para só o APK; o instalador precisa do Windows).
- `node scripts/release.js assinar <pasta> clinica`: (re)escreve `update.json` + `.sig` para o .exe e o .apk de uma pasta.
- `npm run release:publicar`: envia `dist/clinica/` para `vps.destino` (scp).
- Versão aberta: `git tag v0.6.0 && git push --tags`. O GitHub Actions gera e publica. Segredos opcionais do repositório: `DL_SIGN_KEY` (PEM), `ANDROID_KEYSTORE_B64` e `ANDROID_KEY_PASSWORD` (sem eles o APK aberto instala, mas não se atualiza sozinho).
