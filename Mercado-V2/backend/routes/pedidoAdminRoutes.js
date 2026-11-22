const express = require('express');
const router = express.Router();

const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');
const { autorizarGerente } = require('../middlewares/autorizarGerenteMiddleware');
const pedidoController = require('../controllers/pedidoAdminController');

// Todas as operações administrativas exigem sessão ativa de gerente.
router.use(autenticarUsuario, autorizarGerente);

router.get('/', pedidoController.listarPedidos);
router.get('/:id', pedidoController.obterPedido);
router.put('/:id', pedidoController.atualizarPedido);

module.exports = router;
