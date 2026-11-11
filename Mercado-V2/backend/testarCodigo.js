require('dotenv').config();

const { query } = require('./database');
const {
    enviarCodigoVerificacao
} = require('./services/codigoVerificacaoService');

async function testarCodigo() {
    try {
        const email = process.env.TESTE_EMAIL;

        if (!email) {
            throw new Error('Configure TESTE_EMAIL no .env.');
        }

        // Localiza a pessoa pelo e-mail.
        const pessoa = await query(`
            SELECT cpf_pessoa, email_pessoa
            FROM public.pessoa
            WHERE email_pessoa = $1
        `, [email]);

        if (pessoa.rows.length === 0) {
            throw new Error(
                'Não existe pessoa cadastrada com esse e-mail.'
            );
        }

        const { cpf_pessoa, email_pessoa } = pessoa.rows[0];

        // Gera, armazena e envia o código.
        await enviarCodigoVerificacao(
            cpf_pessoa,
            email_pessoa,
            'LOGIN'
        );

        // Confere o registro sem revelar o hash.
        const registro = await query(`
            SELECT
                id_codigo,
                finalidade,
                data_expiracao,
                codigo_hash IS NOT NULL AS possui_hash
            FROM public.codigo_verificacao
            WHERE cpf_pessoa = $1
              AND finalidade = 'LOGIN'
            ORDER BY id_codigo DESC
            LIMIT 1
        `, [cpf_pessoa]);

        console.log('Código enviado com sucesso!');
        console.log('Registro criado:', registro.rows[0]);

    } catch (erro) {
        console.error('Erro no teste:', erro.message);
    } finally {
        // Encerra o processo caso o Pool esteja aberto.
        const { pool } = require('./database');

        if (pool && typeof pool.end === 'function') {
            await pool.end();
        }
    }
}

testarCodigo();