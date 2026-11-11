const crypto = require('crypto');
const { query } = require('../database');
const {
    enviarCodigoVerificacao,
    validarCodigoVerificacao
} = require('../services/codigoVerificacaoService');

const {
    criarSessao,
    buscarSessao,
    revogarSessao
} = require('../services/sessaoService');

// Cria um identificador temporário e assinado para o login.
function gerarTicketLogin(cpf) {
    const segredo = process.env.CODIGO_VERIFICACAO_SECRET;

    if (!segredo) {
        throw new Error('Chave de verificação não configurada.');
    }

    const dados = Buffer.from(JSON.stringify({
        cpf,
        expiracao: Date.now() + (5 * 60 * 1000)
    })).toString('base64url');

    const assinatura = crypto
        .createHmac('sha256', segredo)
        .update(dados)
        .digest('base64url');

    return `${dados}.${assinatura}`;
}

// PRIMEIRA ETAPA: verificar e-mail e senha
exports.iniciarLogin = async (req, res) => {
    try {
        const email = String(req.body.email || '')
            .trim()
            .toLowerCase();

        const senha = req.body.senha;

        // Verifica os campos recebidos.
        if (!email || typeof senha !== 'string' || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe o e-mail e a senha.'
            });
        }

        // Localiza a pessoa e verifica a senha usando o hash do banco.
        const resultado = await query(`
            SELECT
                cpf_pessoa,
                email_pessoa,
                (crypt($2, senha_hash) = senha_hash) AS senha_valida
            FROM public.pessoa
            WHERE LOWER(email_pessoa) = $1
              AND senha_hash IS NOT NULL
            LIMIT 1
        `, [email, senha]);

        // Não revela se o e-mail ou a senha estão incorretos.
        if (
            resultado.rows.length === 0 ||
            !resultado.rows[0].senha_valida
        ) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        const pessoa = resultado.rows[0];

        // Envia o código de verificação para o e-mail cadastrado.
        await enviarCodigoVerificacao(
        pessoa.cpf_pessoa,
        pessoa.email_pessoa,
        'LOGIN'
);

        // Gera o ticket temporário de login.
        const ticket = gerarTicketLogin(pessoa.cpf_pessoa);

// Armazena o ticket em um cookie temporário.
     res.cookie('login_pendente', ticket, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
        path: '/auth'
        });



        return res.status(200).json({
            sucesso: true,
            mensagem: 'Um código de verificação foi enviado ao seu e-mail.',
            proximaEtapa: 'CODIGO'
        });

    } catch (erro) {
        console.error('Erro ao iniciar login:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível iniciar o login. Tente novamente.'
        });
    }
};


function validarTicketLogin(ticket) {
    if (!ticket || typeof ticket !== 'string') {
        return null;
    }

    const partes = ticket.split('.');

    if (partes.length !== 2) {
        return null;
    }

    const [dados, assinatura] = partes;
    const segredo = process.env.CODIGO_VERIFICACAO_SECRET;

    if (!segredo) {
        throw new Error('Chave de verificação não configurada.');
    }

    const assinaturaEsperada = crypto
        .createHmac('sha256', segredo)
        .update(dados)
        .digest('base64url');

    const assinaturaBuffer = Buffer.from(assinatura);
    const esperadaBuffer = Buffer.from(assinaturaEsperada);

    if (
        assinaturaBuffer.length !== esperadaBuffer.length ||
        !crypto.timingSafeEqual(assinaturaBuffer, esperadaBuffer)
    ) {
        return null;
    }

    try {
        const conteudo = JSON.parse(
            Buffer.from(dados, 'base64url').toString('utf8')
        );

        if (
            !conteudo.cpf ||
            !conteudo.expiracao ||
            Date.now() > conteudo.expiracao
        ) {
            return null;
        }

        return conteudo.cpf;
    } catch {
        return null;
    }
}


 // SEGUNDA ETAPA: validar o código de verificação
exports.validarLogin = async (req, res) => {
    try {
        const codigo = String(req.body.codigo || '').trim();

        // Recupera o CPF pelo ticket temporário.
        const cpf = validarTicketLogin(
            req.cookies?.login_pendente
        );

        if (!cpf) {
            res.clearCookie('login_pendente', {
                path: '/auth'
            });

            return res.status(401).json({
                sucesso: false,
                mensagem: 'Sua etapa de login expirou. Faça o login novamente.'
            });
        }

        if (!codigo) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe o código de verificação.'
            });
        }

        // Confere o código enviado ao e-mail.
        const codigoValido = await validarCodigoVerificacao(
            cpf,
            codigo,
            'LOGIN'
        );

        if (!codigoValido) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Código inválido, expirado ou já utilizado.'
            });
        }

        return res.status(200).json({
            sucesso: true,
            mensagem: 'Código validado com sucesso.'
        });

    } catch (erro) {
        console.error('Erro ao validar login:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível validar o código.'
        });
    }
};
