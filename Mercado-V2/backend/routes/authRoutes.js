
const express = require('express');
const router = express.Router();

const cadastroController = require('../controllers/cadastroController');
const authController = require('../controllers/authController');
const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');

// Cadastro público de clientes
router.post('/cadastro', cadastroController.cadastrarCliente);

// Login
router.post('/login', authController.iniciarLogin);
router.post('/validar-login', authController.validarLogin);
router.post('/escolher-acesso', authController.escolherAcesso);
router.get('/minha-sessao', autenticarUsuario, authController.minhaSessao);
// Encerrar sessão
router.post('/logout', autenticarUsuario, authController.logout);

module.exports = router;
