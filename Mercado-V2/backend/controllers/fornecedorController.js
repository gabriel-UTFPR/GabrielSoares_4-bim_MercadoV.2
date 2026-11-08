const { query } = require('../database');

const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const regexCNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const regexTelefone = /^\(\d{2}\) \d{4,5}-\d{4}$/;

// Listar todas as fornecedores de medida
exports.listarFornecedore = async (req, res) => {
    try {
        const result = await query('SELECT * FROM public.fornecedor ORDER BY id_fornecedor');
        res.json({ sucesso: true, fornecedores: result.rows });
    } catch (error) {
        console.error('Erro ao listar fornecedores:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar fornecedores.' });
    }
};

// Obter fornecedor por ID
exports.obterFornecedor = async (req, res) => {
    try {
        const id = parseInt(req.params.id) ;
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido deve ser um número.' });
        }

        const result = await query('SELECT * FROM public.fornecedor WHERE id_fornecedor = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'fornecedor não encontrado.' });
        }

        res.json({ sucesso: true, fornecedor: result.rows[0] });
    } catch (error) {
        console.error('Erro ao obter fornecedor:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor.' });
    }
};

// Criar fornecedor
exports.criarFornecedor = async (req, res) => {
    
    try {
        const { id_fornecedor, nome_fornecedor,cnpj,telefone,email,endereco} = req.body;
        const id = parseInt(id_fornecedor) ;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'O ID deve ser um número.' });
        }

        if (!nome_fornecedor) {
            return res.status(400).json({ sucesso: false, mensagem: 'O nome do fornecedor é obrigatório.' });
        }

        if (!regexCNPJ.test(cnpj)) {
            return res.status(400).json({ sucesso: false, mensagem: 'CNPJ inválido. Formato esperado: 00.000.000/0000-00.' });
        }

        if (!regexTelefone.test(telefone)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Telefone inválido. Formato esperado: (00) 00000-0000.' });
        }

        if (!regexEmail.test(email)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Email inválido.' });
        }

        if (!endereco) {
            return res.status(400).json({ sucesso: false, mensagem: 'O endereço é obrigatório.' });
        }
        const sql = `
            INSERT INTO public.fornecedor (id_fornecedor, nome_fornecedor,cnpj,telefone,email,endereco)
            VALUES ($1, $2,$3,$4,$5,$6)
            RETURNING *
        `;

        const result = await query(sql, [id, nome_fornecedor,cnpj,telefone,email,endereco]);
        res.status(201).json({ sucesso: true, mensagem: 'fornecedor inserido com sucesso!', fornecedor: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar fornecedor:', error);
        if (error.code === '23505') {
            return res.status(400).json({ sucesso: false, mensagem: 'Este Id de fornecedor já está cadastrado.' });
        }
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao inserir fornecedor no banco de dados.' });
    }
};

// Atualizar fornecedor
exports.atualizarFornecedor = async (req, res) => {
    try {
        const id = req.params.id;
        const { nome_fornecedor,cnpj,telefone,email,endereco } = req.body;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }

         if (!nome_fornecedor) {
            return res.status(400).json({ sucesso: false, mensagem: 'O nome do fornecedor é obrigatório.' });
        }

        if (!regexCNPJ.test(cnpj)) {
            return res.status(400).json({ sucesso: false, mensagem: 'CNPJ inválido. Formato esperado: 00.000.000/0000-00.' });
        }

        if (!regexTelefone.test(telefone)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Telefone inválido. Formato esperado: (00) 00000-0000.' });
        }

        if (!regexEmail.test(email)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Email inválido.' });
        }

        if (!endereco) {
            return res.status(400).json({ sucesso: false, mensagem: 'O endereço é obrigatório.' });
        }
        
        const sql = `
            UPDATE public.fornecedor 
            SET nome_fornecedor = $1,
            cnpj=$2,
            telefone=$3,
            email=$4,
            endereco=$5
            WHERE id_fornecedor = $6
            RETURNING *
        `;

        const result = await query(sql, [nome_fornecedor,cnpj,telefone,email,endereco, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'fornecedor não encontrado.' });
        }

        res.json({ sucesso: true, mensagem: 'fornecedor alterado com sucesso!', fornecedor: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar fornecedor:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar fornecedor.' });
    }
};

// Deletar fornecedor
exports.deletarFornecedor = async (req, res) => {
    try {
        const id = parseInt(req.params.id) ;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }

        await query('DELETE FROM public.fornecedor WHERE id_fornecedor = $1', [id]);

        res.json({ sucesso: true, mensagem: 'fornecedor excluído com sucesso!' });
    } catch (error) {
        console.error('Erro ao deletar fornecedor:', error);
        if (error.code === '23503') {
            return res.status(400).json({ sucesso: false, mensagem: 'Não é possível excluir: existem produtos associados a esta fornecedor.' });
        }
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir fornecedor.' });
    }
};