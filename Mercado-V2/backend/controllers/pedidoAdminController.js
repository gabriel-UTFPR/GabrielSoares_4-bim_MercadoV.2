'use strict';

const { pool } = require('../database');

const STATUS_PERMITIDOS = [
    'CARRINHO',
    'AGUARDANDO_PAGAMENTO',
    'PAGO',
    'CANCELADO',
    'FINALIZADO'
];

const FORMAS_PAGAMENTO = ['PIX', 'CREDITO', 'DEBITO', 'DINHEIRO'];

function transicaoStatusPermitida(atual, novo) {
    if (atual === novo) return true;
    if (atual === 'CANCELADO') return false;
    if (atual === 'FINALIZADO') return novo === 'CANCELADO';
    if (atual === 'PAGO') return novo === 'FINALIZADO' || novo === 'CANCELADO';
    if (atual === 'AGUARDANDO_PAGAMENTO') {
        return novo === 'PAGO' || novo === 'CANCELADO';
    }
    if (atual === 'CARRINHO') {
        return novo === 'AGUARDANDO_PAGAMENTO' || novo === 'PAGO' || novo === 'CANCELADO';
    }
    return false;
}

const SELECT_PEDIDOS = `
    SELECT
        p.id_pedido,
        p.cliente_cpf,
        pe.nome_pessoa AS nome_cliente,
        p.data_pedido,
        p.status_pedido,
        p.forma_pagamento,
        p.valor_total,
        p.valor_frete,
        e.cep,
        e.estado,
        e.cidade,
        e.bairro,
        e.rua,
        e.numero,
        e.complemento,
        e.referencia,
        COALESCE(
            json_agg(
                json_build_object(
                    'id_item_pedido', ip.id_item_pedido,
                    'produto_id', ip.produto_id,
                    'descricao_produto', ip.descricao_produto,
                    'quantidade', ip.quantidade,
                    'preco_unitario', ip.preco_unitario
                ) ORDER BY ip.id_item_pedido
            ) FILTER (WHERE ip.id_item_pedido IS NOT NULL),
            '[]'::json
        ) AS itens
    FROM public.pedido p
    INNER JOIN public.cliente cli
        ON cli.pessoa_cpf_pessoa = p.cliente_cpf
    INNER JOIN public.pessoa pe
        ON pe.cpf_pessoa = cli.pessoa_cpf_pessoa
    LEFT JOIN public.endereco_pedido e
        ON e.id_endereco = p.endereco_id
    LEFT JOIN public.item_pedido ip
        ON ip.pedido_id = p.id_pedido
`;

exports.listarPedidos = async (req, res) => {
    try {
        const resultado = await pool.query(`
            ${SELECT_PEDIDOS}
            GROUP BY
                p.id_pedido, pe.nome_pessoa,
                e.cep, e.estado, e.cidade, e.bairro,
                e.rua, e.numero, e.complemento, e.referencia
            ORDER BY p.data_pedido DESC, p.id_pedido DESC
        `);

        return res.json({ sucesso: true, pedidos: resultado.rows });
    } catch (error) {
        console.error('Erro ao listar pedidos no CRUD:', error);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível listar os pedidos.' });
    }
};

exports.obterPedido = async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Número do pedido inválido.' });
    }

    try {
        const resultado = await pool.query(`
            ${SELECT_PEDIDOS}
            WHERE p.id_pedido = $1
            GROUP BY
                p.id_pedido, pe.nome_pessoa,
                e.cep, e.estado, e.cidade, e.bairro,
                e.rua, e.numero, e.complemento, e.referencia
        `, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado.' });
        }

        return res.json({ sucesso: true, pedido: resultado.rows[0] });
    } catch (error) {
        console.error('Erro ao consultar pedido:', error);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível consultar o pedido.' });
    }
};

exports.atualizarPedido = async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const statusNovo = String(req.body.status_pedido || '').toUpperCase();
    const formaRecebida = req.body.forma_pagamento;
    const formaPagamento = formaRecebida === '' || formaRecebida === undefined ? null : String(formaRecebida).toUpperCase();
    const valorFrete = Number(req.body.valor_frete);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Número do pedido inválido.' });
    }
    if (!STATUS_PERMITIDOS.includes(statusNovo)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Status de pedido inválido.' });
    }
    if (formaPagamento !== null && !FORMAS_PAGAMENTO.includes(formaPagamento)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Forma de pagamento inválida.' });
    }
    if (!Number.isFinite(valorFrete) || valorFrete < 0 || valorFrete > 99999999.99) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um valor de frete válido.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const atual = await client.query(`
            SELECT id_pedido, status_pedido
            FROM public.pedido
            WHERE id_pedido = $1
            FOR UPDATE
        `, [id]);

        if (atual.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado.' });
        }

        const statusAtual = atual.rows[0].status_pedido;
        if (!transicaoStatusPermitida(statusAtual, statusNovo)) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                sucesso: false,
                mensagem: `Não é permitida a alteração do status ${statusAtual} para ${statusNovo}. Essa regra evita movimentações incorretas no estoque.`
            });
        }

        const atualizado = await client.query(`
            UPDATE public.pedido
            SET status_pedido = $1,
                forma_pagamento = $2,
                valor_frete = $3
            WHERE id_pedido = $4
            RETURNING id_pedido, status_pedido, forma_pagamento, valor_total, valor_frete,
                      (valor_total + valor_frete) AS total_compra
        `, [statusNovo, formaPagamento, valorFrete, id]);

        await client.query('COMMIT');
        return res.json({
            sucesso: true,
            mensagem: statusNovo === 'CANCELADO'
                ? 'Pedido cancelado. O histórico foi preservado e o estoque foi ajustado pelos gatilhos do banco quando aplicável.'
                : 'Pedido atualizado com sucesso.',
            pedido: atualizado.rows[0]
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Erro ao atualizar pedido:', error);

        if (error.code === 'P0001' || error.code === '23514') {
            return res.status(409).json({ sucesso: false, mensagem: error.message || 'A alteração não pode ser concluída por causa do estoque.' });
        }
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o pedido.' });
    } finally {
        if (client) client.release();
    }
};
