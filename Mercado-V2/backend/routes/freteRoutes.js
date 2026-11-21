const express = require('express');
const router = express.Router();

const freteController = require('../controllers/freteController');

const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');
const { autorizarCliente } = require('../middlewares/autorizarClienteMiddleware');

// POST /frete/calcular
// Exige login: o token de frete é vinculado ao CPF do cliente.
router.post(
    '/calcular',
    autenticarUsuario,
    autorizarCliente,
    freteController.calcularFrete
);

module.exports = router;