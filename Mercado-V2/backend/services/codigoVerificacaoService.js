
const crypto = require('crypto');
const { query } = require('../database');
const { enviarEmail } = require('./emailService');

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

async function enviarCodigoVerificacao(cpf, email, finalidade) {
    if (!['LOGIN', 'RECUPERACAO'].includes(finalidade)) {
        throw new Error('Finalidade de verificação inválida.');
    }

    const codigo = gerarCodigo();
    const codigoHash = gerarHash(codigo);

    // Invalida códigos anteriores ainda não utilizados.
    await query(`
        UPDATE public.codigo_verificacao
        SET data_invalidacao = CURRENT_TIMESTAMP
        WHERE cpf_pessoa = $1
          AND finalidade = $2
          AND data_utilizacao IS NULL
          AND data_invalidacao IS NULL
    `, [cpf, finalidade]);

    // Armazena somente o hash do código.
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
            assunto: finalidade === 'LOGIN'
                ? 'Código de acesso - Mercado V.2'
                : 'Recuperação de senha - Mercado V.2',

            texto: `Seu código de verificação é: ${codigo}. Ele expira em 5 minutos.`,

            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Mercado V.2</h2>
                    <p>Seu código de verificação é:</p>
                    <h1 style="letter-spacing: 6px;">${codigo}</h1>
                    <p>Este código expira em 5 minutos.</p>
                    <p>Se você não solicitou este código, ignore esta mensagem.</p>
                </div>
            `
        });
    } catch (erro) {
        // Invalida o código se o e-mail não puder ser enviado.
        await query(`
            UPDATE public.codigo_verificacao
            SET data_invalidacao = CURRENT_TIMESTAMP
            WHERE id_codigo = $1
        `, [idCodigo]);

        throw erro;
    }

    return true;
}


async function validarCodigoVerificacao(cpf, codigo, finalidade) {
    const { pool } = require('../database');

    if (!/^\d{6}$/.test(codigo)) {
        return false;
    }

    if (!['LOGIN', 'RECUPERACAO'].includes(finalidade)) {
        return false;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Busca o código mais recente que ainda pode ser utilizado.
        // FOR UPDATE impede validações simultâneas do mesmo registro.
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

        if (resultado.rows.length === 0) {
            await client.query('COMMIT');
            return false;
        }

        const registro = resultado.rows[0];

        // Verifica se o código expirou.
        if (new Date(registro.data_expiracao) <= new Date()) {
            await client.query(`
                UPDATE public.codigo_verificacao
                SET data_invalidacao = CURRENT_TIMESTAMP
                WHERE id_codigo = $1
            `, [registro.id_codigo]);

            await client.query('COMMIT');
            return false;
        }

        // Verifica o limite de tentativas.
        if (registro.tentativas >= registro.limite_tentativas) {
            await client.query(`
                UPDATE public.codigo_verificacao
                SET data_invalidacao = CURRENT_TIMESTAMP
                WHERE id_codigo = $1
            `, [registro.id_codigo]);

            await client.query('COMMIT');
            return false;
        }

        // Calcula novamente o hash do código informado.
        const hashInformado = gerarHash(codigo);

        const hashBanco = Buffer.from(
            registro.codigo_hash,
            'hex'
        );

        const hashDigitado = Buffer.from(
            hashInformado,
            'hex'
        );

        const codigoCorreto =
            hashBanco.length === hashDigitado.length &&
            crypto.timingSafeEqual(hashBanco, hashDigitado);

        // Código incorreto: aumenta o número de tentativas.
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

        // Código correto: marca como utilizado.
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
