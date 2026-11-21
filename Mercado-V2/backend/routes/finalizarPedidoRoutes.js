
const express = require('express');
const router = express.Router();

const {
    autenticarUsuario
} = require('../middlewares/autenticacaoMiddleware');

const {
    finalizarPedido
} = require('../controllers/finalizarPedidoController');

// Finalizar compra
router.post(
    '/finalizar',
    autenticarUsuario,
    finalizarPedido
);

module.exports = router;
