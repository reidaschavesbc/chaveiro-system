const db = require('../database/db');

function registrarExclusao({ loja_id, tipo, registro_id, descricao, dados, usuario_id, usuario_nome, req }) {
    try {
        const admin_nome = req?.headers?.['x-autorizador'] || null;
        db.prepare(`
            INSERT INTO historico_exclusoes (loja_id, tipo, registro_id, descricao, dados_json, usuario_id, usuario_nome, admin_nome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            loja_id || null,
            tipo,
            registro_id || null,
            descricao,
            dados ? JSON.stringify(dados) : null,
            usuario_id || null,
            usuario_nome || null,
            admin_nome
        );
    } catch (e) {
        console.error('Erro ao registrar histórico de exclusão:', e.message);
    }
}

module.exports = { registrarExclusao };
