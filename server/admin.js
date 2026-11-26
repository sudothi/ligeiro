// Clinic server admin, run on the VPS:
//   node admin.js parear "Sala 1"   one-time code (30 min) to type in "Conectar à clínica" on that PC
//   node admin.js listar            connected PCs
//   node admin.js revogar <n>       disconnect PC number n (stolen, sold, replaced)
const path = require('path');
const { open } = require('./db');
const db = open(process.env.DL_DB || path.join(__dirname, 'dados', 'alunos.sqlite'));
const [cmd, arg] = process.argv.slice(2);
const fmt = t => t ? new Date(t).toLocaleString('pt-BR') : '-';
if (cmd === 'parear') {
  const code = db.newPairCode(arg || 'PC da clínica');
  console.log(`Código para "${arg || 'PC da clínica'}": ${code.slice(0, 4)}-${code.slice(4)}  (vale 30 minutos, uma vez só)`);
} else if (cmd === 'listar') {
  for (const d of db.devices()) console.log(`#${d.id}  ${d.name}  conectado ${fmt(d.created)}  visto ${fmt(d.last_seen)}${d.revoked ? '  REVOGADO' : ''}`);
} else if (cmd === 'revogar') {
  console.log(db.revoke(+arg) ? `PC #${arg} desconectado.` : 'Não achei esse PC (ou já estava desconectado).');
} else {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(0, 5).join('\n'));
}
db.close();
