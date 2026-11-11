require('dotenv').config();

const { testarConexaoEmail } = require('./services/emailService');

async function testarEmail() {
    try {
        await testarConexaoEmail();

        console.log('Conexão com o Gmail realizada com sucesso!');
    } catch (erro) {
        console.error('Erro ao conectar com o Gmail:');
        console.error(erro.message);
    }
}

testarEmail();