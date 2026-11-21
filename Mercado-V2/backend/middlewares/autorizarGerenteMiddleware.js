
function autorizarGerente(req, res, next) {
    if (!req.sessao || req.sessao.tipo_acesso !== 'GERENTE') {
        return res.status(403).json({
            sucesso: false,
            mensagem: 'Acesso permitido somente para gerentes.'
        });
    }

    next();
}

module.exports = { autorizarGerente };
