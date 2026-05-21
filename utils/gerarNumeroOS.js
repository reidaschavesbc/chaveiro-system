const db = require('../database/db');

// Deve ser chamado DENTRO de um db.transaction() para garantir atomicidade
function gerarNumeroOS() {
    const now = new Date();
    const ano = now.getFullYear().toString().slice(2);
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `OS${ano}${mes}`;
    const row = db.prepare("SELECT numero FROM ordens_servico WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1").get(`${prefix}%`);
    const seq = row ? parseInt(row.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = gerarNumeroOS;
