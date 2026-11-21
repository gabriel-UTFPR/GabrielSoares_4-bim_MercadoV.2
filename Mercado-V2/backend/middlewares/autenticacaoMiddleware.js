
const { buscarSessao } = require('../services/sessaoService');

async function autenticarUsuario(req, res, next) {
    try {
        const token = req.cookies?.sessao;

        if (!token) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Você precisa entrar na sua conta.'
            });
        }

        const sessao = await buscarSessao(token);

        if (!sessao) {
            res.clearCookie('sessao', { path: '/' });

            return res.status(401).json({
                sucesso: false,
                mensagem: 'Sua sessão expirou. Faça login novamente.'
            });
        }

        req.sessao = sessao;

        next();

    } catch (erro) {
        console.error('Erro ao autenticar usuário:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível verificar sua sessão.'
        });
    }
}

module.exports = { autenticarUsuario };
