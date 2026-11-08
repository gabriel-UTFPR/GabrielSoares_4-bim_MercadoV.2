const { query } = require('../database');

// Listar todas as categorias de medida
exports.listarCategorias = async (req, res) => {
    try {
        const result = await query('SELECT * FROM public.categoria ORDER BY id_categoria');
        res.json({ sucesso: true, categorias: result.rows });
    } catch (error) {
        console.error('Erro ao listar categorias:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar categorias.' });
    }
};

// Obter categoria por ID
exports.obterCategoria = async (req, res) => {
    try {
        const id = parseInt(req.params.id) ;
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido deve ser um número.' });
        }

        const result = await query('SELECT * FROM public.categoria WHERE id_categoria = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Categoria não encontrada.' });
        }

        res.json({ sucesso: true, categoria: result.rows[0] });
    } catch (error) {
        console.error('Erro ao obter categoria:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor.' });
    }
};

// Criar categoria
exports.criarCategoria = async (req, res) => {
    try {
        const { id_categoria, nome_categoria } = req.body;
        const id = parseInt(id_categoria) ;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'O ID deve ser um número.' });
        }

        if (!nome_categoria) {
            return res.status(400).json({ sucesso: false, mensagem: 'O nome da categoria é obrigatório.' });
        }

        const sql = `
            INSERT INTO public.categoria (id_categoria, nome_categoria)
            VALUES ($1, $2)
            RETURNING *
        `;

        const result = await query(sql, [id, nome_categoria]);
        res.status(201).json({ sucesso: true, mensagem: 'categoria inserida com sucesso!', categoria: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        if (error.code === '23505') {
            return res.status(400).json({ sucesso: false, mensagem: 'Este Id de categoria já está cadastrado.' });
        }
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao inserir categoria no banco de dados.' });
    }
};

// Atualizar categoria
exports.atualizarCategoria = async (req, res) => {
    try {
        const id = req.params.id;
        const { nome_categoria } = req.body;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }

        const sql = `
            UPDATE public.categoria 
            SET nome_categoria = $1 
            WHERE id_categoria = $2
            RETURNING *
        `;

        const result = await query(sql, [nome_categoria, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'categoria não encontrada.' });
        }

        res.json({ sucesso: true, mensagem: 'categoria alterada com sucesso!', categoria: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar categoria.' });
    }
};

// Deletar categoria
exports.deletarCategoria = async (req, res) => {
    try {
        const id = parseInt(req.params.id) ;

        if (isNaN(id) || id < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }

        await query('DELETE FROM public.categoria WHERE id_categoria = $1', [id]);

        res.json({ sucesso: true, mensagem: 'categoria excluída com sucesso!' });
    } catch (error) {
        console.error('Erro ao deletar categoria:', error);
        if (error.code === '23503') {
            return res.status(400).json({ sucesso: false, mensagem: 'Não é possível excluir: existem produtos associados a esta categoria.' });
        }
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir categoria.' });
    }
};