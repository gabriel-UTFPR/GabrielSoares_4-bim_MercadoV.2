const cookieParser = require('cookie-parser');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { query } = require('./database');

const app = express();

// Caminhos principais
const CAMINHO_FRONTEND = path.join(__dirname, '../frontend');
const CAMINHO_LOJA = path.join(
    CAMINHO_FRONTEND,
    'visaoCliente',
    'loja',
    'loja.html'
);

// Configurações gerais
app.use(cors({
    origin: 'http://localhost:5500',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
// Servir imagens
app.use('/imagens', express.static(path.join(__dirname, '../imagens')));

// Rotas dos CRUDs
const produtoRoutes = require('./routes/produtoRoutes');
const categoriaRoutes = require('./routes/categoriaRoutes');
const cargoRoutes = require('./routes/cargoRoutes');
const fornecedorRoutes = require('./routes/fornecedorRoutes');
const unidadeMedidaRoutes = require('./routes/unidadeMedidaRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const funcionarioRoutes = require('./routes/funcionarioRoutes');
const pessoaRoutes = require('./routes/pessoaRoutes');
const authRoutes = require('./routes/authRoutes');

app.use('/produto', produtoRoutes);
app.use('/categoria', categoriaRoutes);
app.use('/cargo', cargoRoutes);
app.use('/fornecedor', fornecedorRoutes);
app.use('/unidade_medida', unidadeMedidaRoutes);
app.use('/cliente', clienteRoutes);
app.use('/funcionario', funcionarioRoutes);
app.use('/pessoa', pessoaRoutes);
app.use('/auth', authRoutes);

// Página inicial: sempre a loja
app.get('/', (req, res) => {
    res.sendFile(CAMINHO_LOJA);
});

// Atalho para acessar a loja
app.get('/loja', (req, res) => {
    res.sendFile(CAMINHO_LOJA);
});

// Disponibilizar os demais arquivos do frontend
app.use(express.static(CAMINHO_FRONTEND));

// Inicializar servidor
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    console.log('\n=================================');
    console.log(`Servidor executando na porta ${PORT}`);

    try {
        await query('SELECT 1');
        console.log('Banco de Dados conectado com sucesso!');
    } catch (error) {
        console.error('Falha na conexão com o banco de dados:');
        console.error(error.message);
    }

    console.log('=================================\n');
});
