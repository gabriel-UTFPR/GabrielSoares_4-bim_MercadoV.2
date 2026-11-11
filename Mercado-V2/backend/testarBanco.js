
const { query } = require('./database');

async function testarBanco() {
    try {
        const resultado = await query(`
            SELECT
                current_database() AS banco,
                current_schema() AS schema
        `);

        console.log('Banco utilizado pelo backend:');
        console.log(resultado.rows[0]);

    } catch (erro) {
        console.error('Erro:', erro.message);

    } finally {
        process.exit();
    }
}

testarBanco();
