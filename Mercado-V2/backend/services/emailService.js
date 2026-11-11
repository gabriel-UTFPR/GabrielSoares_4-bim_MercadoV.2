const nodemailer = require('nodemailer');

let transporter;

function obterTransportador() {
    if (transporter) {
        return transporter;
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
        throw new Error('Configurações SMTP não encontradas no .env.');
    }

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    return transporter;
}

async function enviarEmail({ para, assunto, texto, html }) {
    const email = obterTransportador();

    return await email.sendMail({
        from: `"Mercado V.2" <${process.env.SMTP_USER}>`,
        to: para,
        subject: assunto,
        text: texto,
        html: html
    });
}

async function testarConexaoEmail() {
    const email = obterTransportador();
    return await email.verify();
}

module.exports = {
    enviarEmail,
    testarConexaoEmail
};