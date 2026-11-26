# Servidor da clínica: alunos

Junta os dados dos alunos de todos os PCs da clínica. Sem dependências: usa o SQLite que vem no Node 22.
O código não tem nenhuma senha. Cada PC recebe o próprio acesso ao ser conectado com um código.

## API (atrás do HTTPS, ouvindo só em 127.0.0.1:8790)
- `POST /api/parear` `{ code, nome }` → `{ token, nome }`. Até 10 tentativas por IP a cada 15 minutos.
- `POST /api/sync` com `Authorization: Bearer <token>`, corpo `{ ops: [...] }` → `{ k, r, at }` (todas as crianças e rodadas, no formato de `src/js/students.js`).
  Ops: `kid {key,name}`, `round {key,name,minute,digits,nameSecs,items}`, `rename {key,name}`, `merge {from,into}`, `remove {key}`. Cada op tem um `id` único; enviar de novo não duplica.
- `GET /api/saude` → `{ ok: true }`.

## Instalar na VPS (Ubuntu 24.04)
```bash
# Node 22 (>= 22.13)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo useradd --system --home /var/lib/dedos-ligeiros --shell /usr/sbin/nologin dedos
sudo mkdir -p /opt/dedos-ligeiros /var/lib/dedos-ligeiros && sudo chown dedos: /var/lib/dedos-ligeiros && sudo chmod 700 /var/lib/dedos-ligeiros
sudo git clone https://github.com/sudothi/ligeiro /opt/dedos-ligeiros   # só a pasta server/ é usada
sudo cp /opt/dedos-ligeiros/server/dedos-ligeiros-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now dedos-ligeiros-api
curl -s http://127.0.0.1:8790/api/saude
```
Caddy (o mesmo site das atualizações):
```
SEU-ENDERECO {
    handle /api/* {
        reverse_proxy 127.0.0.1:8790
    }
    handle_path /atualizacoes/* {
        root * /var/www/atualizacoes
        file_server
    }
}
```
Em `config/clinica.json`, `"api": "https://SEU-ENDERECO/api/"` (vai para dentro do app da clínica).

## Conectar um PC
Na VPS: `cd /opt/dedos-ligeiros/server && sudo -u dedos DL_DB=/var/lib/dedos-ligeiros/alunos.sqlite node admin.js parear "Sala 1"`.
Aparece um código (vale 30 minutos, uma vez só). No PC: **Alunos → Servidor da clínica → digitar o código → Conectar**.
O que o PC já tinha sobe para o servidor. Depois disso, cada rodada sobe sozinha. Sem internet, fica na fila e sobe depois.
- `node admin.js listar`: PCs conectados e quando foram vistos.
- `node admin.js revogar 3`: desconecta o PC nº 3 (roubado, vendido, trocado).

## Backup
O banco é um arquivo só. Cópia diária, por exemplo em `/etc/cron.daily/dedos-ligeiros`:
```bash
#!/bin/sh
sqlite3 /var/lib/dedos-ligeiros/alunos.sqlite ".backup /var/backups/dedos-ligeiros-$(date +%u).sqlite"
```
(guarda os últimos 7 dias; `sudo apt-get install -y sqlite3`). Leve uma cópia para fora da VPS de vez em quando.
