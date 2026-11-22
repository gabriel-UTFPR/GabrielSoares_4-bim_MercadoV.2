const { query } = require('../database');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Listar todos os produtos
exports.listarProdutos = async (req, res) => {
    try {
        const result = await query('SELECT * FROM public.produto ORDER BY id_produto');
        res.json({ sucesso: true, produtos: result.rows });
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar produtos.' });
    }
};

// Obter produto por ID
exports.obterProduto = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }

        const result = await query('SELECT * FROM public.produto WHERE id_produto = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Produto não encontrado.' });
        }

        res.json({ sucesso: true, produto: result.rows[0] });
    } catch (error) {
        console.error('Erro ao obter produto:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor.' });
    }
};

// Criar produto
exports.criarProduto = async (req, res) => {
    try {
        const { id_produto, descricao, id_categoria, id_fornecedor, id_unidade_medida,estoque, preco } = req.body;

        if (!descricao) {
            return res.status(400).json({ sucesso: false, mensagem: 'A descrição é obrigatória.' });
        }

        const sql = `
            INSERT INTO public.produto (id_produto, descricao, id_categoria, id_fornecedor,id_unidade_medida, estoque, preco)
            VALUES ($1, $2, $3, $4, $5, $6,$7)
            RETURNING *
        `;

        const values = [
            id_produto,
            descricao,
            id_categoria || null,
            id_fornecedor || null,
            id_unidade_medida|| null,
            estoque || 0,
            preco || 0.0
        ];

        const result = await query(sql, values);
        res.status(201).json({ sucesso: true, mensagem: 'Produto inserido com sucesso!', produto: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
      if (error.code === '23503') {

    if (error.constraint === 'produtos_categoria_fk') {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'A categoria informada não existe no cadastro.'
        });
    }

    if (error.constraint === 'produtos_fornecedor_fk') {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'O fornecedor informado não existe no cadastro.'
        });
    }

    return res.status(400).json({
        sucesso: false,
        mensagem: 'Relacionamento inválido.'
    });
}
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao inserir produto no banco de dados.' });
    }
};

// Atualizar produto
exports.atualizarProduto = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { descricao, id_categoria, id_fornecedor, id_unidade_medida, preco } = req.body;

        // O estoque não é sobrescrito na edição normal. A reposição possui rota própria
        // e soma a quantidade de forma atômica para não perder entradas simultâneas.
        const sql = `
            UPDATE public.produto
            SET descricao = $1,
                id_categoria = $2,
                id_fornecedor = $3,
                id_unidade_medida = $4,
                preco = $5
            WHERE id_produto = $6
            RETURNING *
        `;

        const values = [
            descricao,
            id_categoria || null,
            id_fornecedor || null,
            id_unidade_medida || null,
            preco || 0.0,
            id
        ];

        const result = await query(sql, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Produto não encontrado.' });
        }

        res.json({ sucesso: true, mensagem: 'Produto alterado com sucesso!', produto: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
    if (error.code === '23503') {

    if (error.constraint === 'produtos_categoria_fk') {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'A categoria informada não existe no cadastro.'
        });
    }

    if (error.constraint === 'produtos_fornecedor_fk') {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'O fornecedor informado não existe no cadastro.'
        });
    }

    return res.status(400).json({
        sucesso: false,
        mensagem: 'Relacionamento inválido.'
    });
}
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar produto.' });
    }
};

// Repor estoque sem substituir a quantidade que já existe.
exports.reporEstoque = async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const quantidade = Number(req.body.quantidade);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID de produto inválido.' });
        }

        if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 9999999.999 || !Number.isInteger(quantidade * 1000)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Informe uma quantidade positiva com até três casas decimais.' });
        }

        const atual = await query(
            'SELECT id_unidade_medida FROM public.produto WHERE id_produto = $1',
            [id]
        );

        if (atual.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Produto não encontrado.' });
        }

        if (atual.rows[0].id_unidade_medida !== 'KG' && !Number.isInteger(quantidade)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Somente produtos vendidos em KG permitem reposição com quantidade decimal.'
            });
        }

        const resultado = await query(`
            UPDATE public.produto
            SET estoque = estoque + $1::NUMERIC
            WHERE id_produto = $2
            RETURNING *
        `, [quantidade, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Produto não encontrado.' });
        }

        return res.json({
            sucesso: true,
            mensagem: `Estoque reposto. Nova quantidade: ${resultado.rows[0].estoque}.`,
            produto: resultado.rows[0]
        });
    } catch (error) {
        console.error('Erro ao repor estoque:', error);

        if (error.code === '22003') {
            return res.status(400).json({ sucesso: false, mensagem: 'A quantidade ultrapassa o limite de estoque permitido.' });
        }

        return res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao repor o estoque.' });
    }
};

// Upload e salvamento de imagem com Sharp
exports.uploadImagem = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!req.file) {
            return res.status(400).json({ sucesso: false, mensagem: 'Nenhum arquivo enviado.' });
        }

        const pastaImagens = path.join(__dirname, '../../imagens');
        if (!fs.existsSync(pastaImagens)) {
            fs.mkdirSync(pastaImagens, { recursive: true });
        }

        const caminhoDestino = path.join(pastaImagens, `${id}.png`);

        // Processa e converte para PNG no tamanho ideal
        await sharp(req.file.buffer)
            .resize(300, 300, { fit: 'cover' })
            .toFormat('png')
            .toFile(caminhoDestino);

        res.json({ sucesso: true, mensagem: 'Imagem salva com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar imagem:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar imagem.' });
    }
};

// Deletar produto
exports.deletarProduto = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        await query('DELETE FROM public.produto WHERE id_produto = $1', [id]);

        const imgPath = path.join(__dirname, '../../imagens', `${id}.png`);
        if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath);
        }

        res.json({ sucesso: true, mensagem: 'Produto excluído com sucesso!' });
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir produto.' });
    }
};