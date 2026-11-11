
const express = require('express');
const router = express.Router();

const cadastroController = require('../controllers/cadastroController');
const authController = require('../controllers/authController');

// Cadastro público de clientes
router.post('/cadastro', cadastroController.cadastrarCliente);
router.post('/login', authController.iniciarLogin);
router.post('/validar-login', authController.validarLogin);

module.exports = router;
