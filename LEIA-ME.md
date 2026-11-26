# Dedos Ligeiros

Jogo para atendimentos de psicopedagogia: aparece um número, a criança mexe os dedos (com anéis de papel) na ordem dos algarismos, e o profissional marca se acertou.

## Etapa 1 (pronta)
- Tela inicial com o mascote Dedé, escolha de 1 a 4 algarismos, 5/10/15 números por rodada, voz e sons.
- Tela do jogo: número atual grande (cada algarismo com sua cor, igual aos anéis), anterior acima e próximo abaixo, bolinhas de progresso, mascote reagindo.
- Controles do profissional (barra de baixo ou teclado):
  - Espaço ou Enter: **Certo** (comemora e passa para o próximo)
  - R: **Repetir** (mostra o número de novo e diz "Olha de novo...")
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

## Nome da criança, estatísticas e relatórios
- Ao tocar em Jogar, a criança digita o nome (teclado do PC ou teclado grande na tela). "Jogar de novo" mantém a mesma criança; "Outra criança" pede o nome de novo. Pelo celular o professor vê o que está sendo digitado, pode corrigir, escolher da lista ou "Jogar sem nome".
- Durante o jogo, no celular, tocar num algarismo marca que a criança errou aquele dedo (opcional).
- Cada rodada é guardada num arquivo pequeno no aparelho do jogo (PC: pasta de dados do app, `alunos.json`; Android: armazenamento do app). Cerca de 120 bytes por rodada. Rodadas com mais de 2 anos viram resumo mensal.
- **Alunos e relatórios**: no celular (aba Alunos) ou na tela inicial do jogo (com PIN de 4 números). Gráficos de dificuldade por quantidade de algarismos, algarismos difíceis (0 a 9), posição do erro, números mais difíceis, tempo por número e evolução. Corrigir nome, juntar fichas, apagar ficha, exportar PDF e planilha (CSV).
- Código: `src/js/students.js` (dados e estatísticas), `src/js/report.js` (gráficos), `src/js/alunos-ui.js` (tela Alunos), `src/js/alunos-local.js` (PIN, exportar, pedidos do celular).

## Câmera: teste dos dedos (só no PC, em teste)
- Na tela inicial do app no PC: **Testar a câmera (dedos)**. A webcam USB fica virada para baixo, olhando a mesa. A criança deixa as duas mãos abertas na mesa, com a palma para baixo, e dobra um dedo de cada vez.
- Numeração: mão esquerda da criança, do mindinho ao polegar, 1 a 5; mão direita, do polegar ao mindinho, 6 a 10 (o 10 é o 0 do jogo e dos anéis de papel). A mão esquerda e a direita são reconhecidas pelo formato da mão, então a câmera pode estar de qualquer lado da mesa.
- **Calibrar**: 3 segundos com as mãos abertas e paradas. **Teste guiado**: pede 20 dedos (cada um 2 vezes) e mostra os acertos por dedo; dá para salvar a planilha.
- **Ajustes da câmera**: escolher a webcam, girar ou espelhar a imagem, sensibilidade e tempo que o dedo precisa ficar dobrado.
- **No jogo**: na tela inicial, "Câmera: Ligada" mostra uma janelinha da câmera no canto da tela de jogo, com os números nos dedos e um botão Calibrar (a calibração fica guardada). Para 472 a criança dobra o dedo 4, depois o 7, depois o 2; cada algarismo certo ganha um traço verde e, no fim, conta como Certo. Dedo errado: o algarismo balança, fica marcado como erro na rodada e o jogo espera o dedo certo. Os botões do profissional continuam valendo. Código: `src/js/camera/game-cam.js` e `src/js/camera/tracker.js` (câmera e desenho, usado também pela tela de teste).
- Tudo roda no computador (MediaPipe, sem internet). Nenhuma imagem é gravada ou enviada.
- Os arquivos do MediaPipe não ficam no repositório: `npm start` e `npm run dist` rodam `scripts/camera-vendor.js`, que copia a biblioteca de `node_modules` e baixa o modelo das mãos uma vez (~8 MB) para `src/vendor/mediapipe/`.
- Código: `src/camera.html`, `src/js/camera/fingers.js` (numeração e detecção do dedo dobrado), `src/js/camera/camera.js` (câmera, desenho, teste guiado).

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
