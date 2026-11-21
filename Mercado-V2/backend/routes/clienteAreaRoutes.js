'use strict';
const express = require('express');
const router = express.Router();
const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');
const controller = require('../controllers/clienteAreaController');

router.get('/pedidos', autenticarUsuario, controller.meusPedidos);
router.get('/dados', autenticarUsuario, controller.meusDados);
router.put('/dados', autenticarUsuario, controller.atualizarMeusDados);

module.exports = router;
