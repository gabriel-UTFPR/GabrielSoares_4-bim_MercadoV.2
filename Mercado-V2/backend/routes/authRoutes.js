
const express = require('express');
const router = express.Router();

const cadastroController = require('../controllers/cadastroController');
const authController = require('../controllers/authController');
const { autenticarUsuario } = require('../middlewares/autenticacaoMiddleware');

// Cadastro público de clientes
router.post('/cadastro', cadastroController.cadastrarCliente);
router.post('/validar-cadastro', cadastroController.confirmarCadastro);
router.post('/reenviar-codigo-cadastro', cadastroController.reenviarCodigoCadastro);

// Login
router.post('/login', authController.iniciarLogin);
router.post('/validar-login', authController.validarLogin);
router.post('/escolher-acesso', authController.escolherAcesso);

// Recuperação de senha por código enviado ao e-mail.
router.post('/recuperar-senha', authController.solicitarRecuperacaoSenha);
router.post('/validar-codigo-recuperacao', authController.validarCodigoRecuperacao);
router.post('/redefinir-senha', authController.redefinirSenha);
router.post('/trocar-acesso', autenticarUsuario, authController.trocarAcesso);
router.get('/minha-sessao', autenticarUsuario, authController.minhaSessao);
// Encerrar sessão
router.post('/logout', autenticarUsuario, authController.logout);

module.exports = router;
