
require('dotenv').config();

const readline = require('readline');
const { query, pool } = require('./database');

const {
    enviarCodigoVerificacao,
    validarCodigoVerificacao
} = require('./services/codigoVerificacaoService');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function perguntar(mensagem) {
    return new Promise(resolve => {
        rl.question(mensagem, resolve);
    });
}

async function testarValidacao() {
    try {
        const email = process.env.TESTE_EMAIL;

        const resultado = await query(`
            SELECT cpf_pessoa, email_pessoa
            FROM public.pessoa
            WHERE email_pessoa = $1
        `, [email]);

        if (resultado.rows.length === 0) {
            throw new Error('E-mail de teste não encontrado.');
        }

        const pessoa = resultado.rows[0];

        await enviarCodigoVerificacao(
            pessoa.cpf_pessoa,
            pessoa.email_pessoa,
            'LOGIN'
        );

        console.log('\nUm novo código foi enviado ao seu e-mail.');

        const codigo = (await perguntar(
            'Digite o código recebido: '
        )).trim();

        const primeiraValidacao = await validarCodigoVerificacao(
            pessoa.cpf_pessoa,
            codigo,
            'LOGIN'
        );

        console.log(
            '\nPrimeira validação:',
            primeiraValidacao ? 'ACEITO' : 'RECUSADO'
        );

    

    } catch (erro) {
        console.error('Erro no teste:', erro.message);
    } finally {
        rl.close();

        if (pool) {
            await pool.end();
        }
    }
}

testarValidacao();
