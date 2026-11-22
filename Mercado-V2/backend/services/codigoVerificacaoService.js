'use strict';

const crypto = require('crypto');
const { query, pool } = require('../database');
const { enviarEmail } = require('./emailService');

const FINALIDADES_PERMITIDAS = ['ATIVACAO', 'LOGIN', 'RECUPERACAO'];

function gerarCodigo() {
    return crypto.randomInt(100000, 1000000).toString();
}

function gerarHash(codigo) {
    const segredo = process.env.CODIGO_VERIFICACAO_SECRET;

    if (!segredo) {
        throw new Error('Chave de verificação não configurada no .env.');
    }

    return crypto
        .createHmac('sha256', segredo)
        .update(codigo)
        .digest('hex');
}

function obterAssunto(finalidade) {
    const assuntos = {
        ATIVACAO: 'Confirmação de cadastro - Mercado V.2',
        LOGIN: 'Código de acesso - Mercado V.2',
        RECUPERACAO: 'Recuperação de senha - Mercado V.2'
    };

    return assuntos[finalidade];
}

async function enviarCodigoVerificacao(cpf, email, finalidade) {
    if (!FINALIDADES_PERMITIDAS.includes(finalidade)) {
        throw new Error('Finalidade de verificação inválida.');
    }

    const codigo = gerarCodigo();
    const codigoHash = gerarHash(codigo);

    // Invalida códigos anteriores ainda não utilizados para a mesma finalidade.
    await query(`
        UPDATE public.codigo_verificacao
        SET data_invalidacao = CURRENT_TIMESTAMP
        WHERE cpf_pessoa = $1
          AND finalidade = $2
          AND data_utilizacao IS NULL
          AND data_invalidacao IS NULL
    `, [cpf, finalidade]);

    // Somente o hash do código é armazenado no banco.
    const resultado = await query(`
        INSERT INTO public.codigo_verificacao (
            cpf_pessoa,
            codigo_hash,
            finalidade,
            data_expiracao
        )
        VALUES (
            $1,
            $2,
            $3,
            CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        )
        RETURNING id_codigo
    `, [cpf, codigoHash, finalidade]);

    const idCodigo = resultado.rows[0].id_codigo;

    try {
        await enviarEmail({
            para: email,
            assunto: obterAssunto(finalidade),
            texto: `Seu código de verificação é: ${codigo}. Ele expira em 5 minutos.`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Mercado V.2</h2>
                    <p>${finalidade === 'ATIVACAO'
                        ? 'Para concluir seu cadastro, confirme seu e-mail com o código abaixo:'
                        : 'Seu código de verificação é:'}</p>
                    <h1 style="letter-spacing: 6px;">${codigo}</h1>
                    <p>Este código expira em 5 minutos.</p>
                    <p>Se você não solicitou este código, ignore esta mensagem.</p>
                </div>
            `
        });
    } catch (erro) {
        await query(`
            UPDATE public.codigo_verificacao
            SET data_invalidacao = CURRENT_TIMESTAMP
            WHERE id_codigo = $1
        `, [idCodigo]);

        throw erro;
    }

    return true;
}

/*
 * A função aceita uma ação opcional para executar na mesma transação da
 * validação. No cadastro, isso permite inserir em public.cliente e consumir
 * o código atomicamente: se o INSERT falhar, o código continua disponível.
 */
async function validarCodigoVerificacao(cpf, codigo, finalidade, aoConfirmar) {
    if (!/^\d{6}$/.test(codigo)) {
        return false;
    }

    if (!FINALIDADES_PERMITIDAS.includes(finalidade)) {
        return false;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const resultado = await client.query(`
            SELECT *
            FROM public.codigo_verificacao
            WHERE cpf_pessoa = $1
              AND finalidade = $2
              AND data_utilizacao IS NULL
              AND data_invalidacao IS NULL
            ORDER BY id_codigo DESC
            LIMIT 1
            FOR UPDATE
        `, [cpf, finalidade]);

        if (!resultado.rows.length) {
            await client.query('COMMIT');
            return false;
        }

        const registro = resultado.rows[0];

        if (new Date(registro.data_expiracao) <= new Date()) {
            await client.query(`
                UPDATE public.codigo_verificacao
                SET data_invalidacao = CURRENT_TIMESTAMP
                WHERE id_codigo = $1
            `, [registro.id_codigo]);

            await client.query('COMMIT');
            return false;
        }

        if (registro.tentativas >= registro.limite_tentativas) {
            await client.query(`
                UPDATE public.codigo_verificacao
                SET data_invalidacao = CURRENT_TIMESTAMP
                WHERE id_codigo = $1
            `, [registro.id_codigo]);

            await client.query('COMMIT');
            return false;
        }

        const hashInformado = gerarHash(codigo);
        const hashBanco = Buffer.from(registro.codigo_hash, 'hex');
        const hashDigitado = Buffer.from(hashInformado, 'hex');

        const codigoCorreto =
            hashBanco.length === hashDigitado.length &&
            crypto.timingSafeEqual(hashBanco, hashDigitado);

        if (!codigoCorreto) {
            await client.query(`
                UPDATE public.codigo_verificacao
                SET
                    tentativas = tentativas + 1,
                    data_invalidacao = CASE
                        WHEN tentativas + 1 >= limite_tentativas
                        THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END
                WHERE id_codigo = $1
            `, [registro.id_codigo]);

            await client.query('COMMIT');
            return false;
        }

        // Executa a ação protegida antes de consumir o código.
        if (typeof aoConfirmar === 'function') {
            await aoConfirmar(client, registro);
        }

        await client.query(`
            UPDATE public.codigo_verificacao
            SET data_utilizacao = CURRENT_TIMESTAMP
            WHERE id_codigo = $1
        `, [registro.id_codigo]);

        await client.query('COMMIT');
        return true;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;

    } finally {
        client.release();
    }
}

module.exports = {
    enviarCodigoVerificacao,
    validarCodigoVerificacao
};
