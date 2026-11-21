
function autorizarCliente(req, res, next) {
    if (!req.sessao || req.sessao.tipo_acesso !== 'CLIENTE') {
        return res.status(403).json({
            sucesso: false,
            mensagem: 'Acesso permitido somente para clientes.'
        });
    }

    next();
}

module.exports = { autorizarCliente };
