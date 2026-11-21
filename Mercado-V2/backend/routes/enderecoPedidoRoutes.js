
const express = require('express');
const router = express.Router();

const enderecoPedidoController = require('../controllers/enderecoPedidoController');

const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');
const { autorizarCliente } = require('../middlewares/autorizarClienteMiddleware');

// Buscar o último endereço do cliente autenticado
router.get(
    '/ultimo',
    autenticarUsuario,
    autorizarCliente,
    enderecoPedidoController.buscarUltimoEndereco
);

module.exports = router;
