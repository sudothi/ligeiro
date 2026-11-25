# Dedos Ligeiros

Jogo para atendimentos de psicopedagogia: aparece um número, a criança mexe os dedos (com anéis de papel) na ordem dos algarismos, e o profissional marca se acertou.

## Etapa 1 (pronta)
- Tela inicial com o mascote Dedé, escolha de 1 a 4 algarismos, 5/10/15 números por rodada, voz e sons.
- Tela do jogo: número atual grande (cada algarismo com sua cor, igual aos anéis), anterior acima e próximo abaixo, bolinhas de progresso, mascote reagindo.
- Controles do profissional (barra de baixo ou teclado):
  - Espaço ou Enter: **Certo** (comemora e passa para o próximo)
  - R: **Repetir** (fala o número de novo)
  - Seta direita: **Pular**
  - Seta esquerda: **Voltar** um número
  - P ou Esc: **Pausar**
  - F11: tela cheia
- Tela de resultado com estrelas, acertos, pulados e tempo.
- Página de anéis de papel para imprimir.
- Funciona sem internet (fontes embutidas). A voz usa as vozes em português do Windows.

## Etapa 2 (pronta): controle pelo celular
- Na tela inicial, clique em **Controlar pelo celular**. Aparece um QR code e o código da sala (4 números).
- O celular precisa estar no **mesmo Wi-Fi** do computador. Não usa internet.
- Aponte a câmera do celular para o QR code (ou digite o endereço mostrado no navegador do celular).
- No celular: escolher algarismos/números/voz/sons, **Jogar!**, **Certo!**, Repetir, Pular, Voltar, Pausar, Encerrar rodada, Jogar de novo e Início. O celular também mostra o número que está na tela e o próximo.
- Com o celular conectado, a barra de botões do computador some (para a criança não apertar). O teclado continua funcionando.
- **Novo código** desconecta os celulares e gera outro código.
- Na primeira vez, o Windows pergunta se libera o acesso à rede: marque **Redes privadas** e clique em Permitir. Se a rede Wi-Fi estiver marcada como "Pública" no Windows, o celular não conecta; mude para "Privada".

## App Android (tablet ou celular)
Um app só, que ao abrir pergunta **Sou o jogador** ou **Sou o professor**.
- **Jogador** (tablet): mostra o jogo, o QR code e o código da sala. Sem professor conectado, os botões ficam na tela.
- **Professor** (celular ou outro tablet com o app): toque em **Ler QR code** e aponte para a tela do jogo, ou digite os 4 números do código (o app procura o jogo no Wi-Fi sozinho). Depois aparecem os controles: Certo, Repetir, Pular, Voltar, Pausar e as configurações da rodada. "Sair" desconecta.
- O professor no app controla tanto o jogo no tablet quanto o jogo no computador.
- **Quem tem iPhone** (sem app): aponta a câmera do iPhone para o QR code e controla pelo navegador. É a mesma tela de controles.
- O APK é gerado automaticamente pelo GitHub a cada mudança e fica em **Releases > tablet** (github.com/sudothi/ligeiro/releases/tag/tablet). Abra esse link no aparelho, baixe o `.apk` e instale (o Android pede para permitir "instalar apps desconhecidos" no navegador).
- Detalhes técnicos: projeto Android em `android/` (Capacitor). Servidor do tablet em `LanServer.java`; o jogo se anuncia no Wi-Fi pela porta UDP 8786 (`Beacon.java` e `electron/server.js`) para o professor achar pelo código. Telas só do app em `app/`; a tela do professor é `remote/index.html`, a mesma do navegador. Gerar no PC: `npm run android:sync` e abrir `android/` no Android Studio.

## Rodar no computador
1. Instale o Node.js (versão 20 ou mais nova).
2. Nesta pasta: `npm install` e depois `npm start`.

Para gerar o instalador do Windows: `npm run dist` (gera em `dist/`).
Para atualizar depois de mudanças: `git pull` e `npm install`, depois `npm start`.

## Estrutura
- `src/` o jogo (HTML, CSS, JavaScript), o mesmo código servirá ao app Android do tablet.
- `src/js/game.js` fluxo do jogo e ações do profissional.
- `src/js/mascot.js` o mascote Dedé (SVG, humores: happy, cheer, think, oops).
- `electron/main.js` janela do app no PC.
- `electron/server.js` servidor local (porta 8787) que entrega a página do celular e recebe os comandos (WebSocket, com código da sala).
- `electron/preload.js` ponte entre o jogo e o servidor.
- `src/js/remote.js` QR code no jogo e reação aos comandos do celular.
- `remote/index.html` a página de controle que abre no celular.
- `build/icon.png` ícone do app.
