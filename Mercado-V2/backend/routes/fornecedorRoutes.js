const express = require('express');
const router = express.Router();
const fornecedorController = require('../controllers/fornecedorController');

// Rotas do CRUD de Unidades de Medida
router.get('/listar', fornecedorController.listarFornecedore);
router.get('/:id', fornecedorController.obterFornecedor);
router.post('/', fornecedorController.criarFornecedor);
router.put('/:id', fornecedorController.atualizarFornecedor);
router.delete('/:id', fornecedorController.deletarFornecedor);

module.exports = router;