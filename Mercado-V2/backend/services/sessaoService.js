
const crypto = require('crypto');
const { query } = require('../database');

// Gera um token aleatório e seguro
function gerarToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Gera o hash SHA-256 do token
function gerarHashToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

// Cria uma nova sessão
async function criarSessao(cpf, tipoAcesso) {

    const tiposPermitidos = ['CLIENTE', 'GERENTE', 'FUNCIONARIO'];

    if (!tiposPermitidos.includes(tipoAcesso)) {
        throw new Error('Tipo de acesso inválido.');
    }

    const token = gerarToken();
    const tokenHash = gerarHashToken(token);

    const resultado = await query(`
        INSERT INTO public.sessao (
            cpf_pessoa,
            token_hash,
            tipo_acesso,
            data_expiracao
        )
        VALUES (
            $1,
            $2,
            $3,
            CURRENT_TIMESTAMP + INTERVAL '30 days'
        )
        RETURNING
            id_sessao,
            cpf_pessoa,
            tipo_acesso,
            data_expiracao
    `, [cpf, tokenHash, tipoAcesso]);

    return {
        token,
        sessao: resultado.rows[0]
    };
}

// Verifica se um token corresponde a uma sessão ativa
async function buscarSessao(token) {

    if (!token || typeof token !== 'string') {
        return null;
    }

    const tokenHash = gerarHashToken(token);

    const resultado = await query(`
        SELECT
            id_sessao,
            cpf_pessoa,
            tipo_acesso,
            data_expiracao
        FROM public.sessao
        WHERE token_hash = $1
          AND data_expiracao > CURRENT_TIMESTAMP
          AND data_revogacao IS NULL
        LIMIT 1
    `, [tokenHash]);

    if (resultado.rows.length === 0) {
        return null;
    }

    return resultado.rows[0];
}

// Encerra uma sessão
async function revogarSessao(token) {

    if (!token || typeof token !== 'string') {
        return false;
    }

    const tokenHash = gerarHashToken(token);

    const resultado = await query(`
        UPDATE public.sessao
        SET data_revogacao = CURRENT_TIMESTAMP
        WHERE token_hash = $1
          AND data_revogacao IS NULL
        RETURNING id_sessao
    `, [tokenHash]);

    return resultado.rows.length > 0;
}

module.exports = {
    criarSessao,
    buscarSessao,
    revogarSessao
};
