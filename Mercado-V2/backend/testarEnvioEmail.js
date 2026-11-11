require('dotenv').config();

const { enviarEmail } = require('./services/emailService');

async function testarEnvio() {
    try {
        await enviarEmail({
            para: 'gabriel.2010@alunos.utfpr.edu.br',
            assunto: 'Teste do Mercado V.2',
            texto: 'O envio de e-mails do Mercado V.2 está funcionando!',
            html: `
                <h2>Mercado V.2</h2>
                <p>O envio de e-mails está funcionando corretamente!</p>
            `
        });

        console.log('E-mail enviado com sucesso!');
    } catch (erro) {
        console.error('Erro ao enviar e-mail:');
        console.error(erro.message);
    }
}

testarEnvio();