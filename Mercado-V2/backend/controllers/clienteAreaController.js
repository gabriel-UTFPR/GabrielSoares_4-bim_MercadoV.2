/* =====================================================
   Mercado V.2 - Área do cliente

   Compatibilidade:
   - A consulta de pedidos verifica quais colunas existem no banco.
   - Assim, funciona tanto com o esquema básico documentado quanto
     com a versão que já possui endereço, frete e forma de pagamento.
===================================================== */

'use strict';

const { query } = require('../database');

function somenteCliente(req, res) {
    if (req.sessao?.tipo_acesso !== 'CLIENTE') {
        res.status(403).json({
            sucesso: false,
            mensagem: 'Acesso exclusivo para clientes.'
        });
        return false;
    }

    return true;
}

async function obterEstruturaPedidos() {
    const resultado = await query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('pedido', 'endereco_pedido')
    `);

    const estrutura = {
        pedido: new Set(),
        endereco: new Set()
    };

    for (const coluna of resultado.rows) {
        const tabela = coluna.table_name === 'pedido' ? 'pedido' : 'endereco';
        estrutura[tabela].add(coluna.column_name);
    }

    return estrutura;
}

exports.meusPedidos = async (req, res) => {
    try {
        if (!somenteCliente(req, res)) return;

        const cpf = req.sessao.cpf_pessoa;
        const estrutura = await obterEstruturaPedidos();
        const colunasPedido = estrutura.pedido;
        const colunasEndereco = estrutura.endereco;

        // Campos que podem existir apenas na versão mais recente do banco.
        const expressaoFrete = colunasPedido.has('valor_frete')
            ? 'COALESCE(p.valor_frete, 0)'
            : '0::NUMERIC';

        const expressaoPagamento = colunasPedido.has('forma_pagamento')
            ? 'p.forma_pagamento'
            : 'NULL::VARCHAR';

        const podeRelacionarEndereco =
            colunasPedido.has('endereco_id') &&
            colunasEndereco.has('id_endereco');

        const camposEndereco = [
            'cep',
            'estado',
            'cidade',
            'bairro',
            'rua',
            'numero',
            'complemento',
            'referencia'
        ];

        const selecaoEndereco = camposEndereco.map(campo => {
            return podeRelacionarEndereco && colunasEndereco.has(campo)
                ? `e.${campo} AS ${campo}`
                : `NULL::VARCHAR AS ${campo}`;
        }).join(',\n                ');

        const joinEndereco = podeRelacionarEndereco
            ? 'LEFT JOIN public.endereco_pedido e ON e.id_endereco = p.endereco_id'
            : '';

        const pedidosResultado = await query(`
            SELECT
                p.id_pedido,
                p.data_pedido,
                p.status_pedido,
                ${expressaoPagamento} AS forma_pagamento,
                p.valor_total AS subtotal,
                ${expressaoFrete} AS valor_frete,
                (p.valor_total + ${expressaoFrete}) AS total,
                ${selecaoEndereco}
            FROM public.pedido p
            ${joinEndereco}
            WHERE p.cliente_cpf = $1
              AND p.status_pedido <> 'CARRINHO'
            ORDER BY p.data_pedido DESC, p.id_pedido DESC
        `, [cpf]);

        const pedidos = pedidosResultado.rows;

        if (pedidos.length) {
            const ids = pedidos.map(pedido => pedido.id_pedido);

            const itensResultado = await query(`
                SELECT
                    pedido_id,
                    descricao_produto,
                    quantidade,
                    preco_unitario,
                    (quantidade * preco_unitario) AS total_item
                FROM public.item_pedido
                WHERE pedido_id = ANY($1::INTEGER[])
                ORDER BY pedido_id, id_item_pedido
            `, [ids]);

            const itensPorPedido = new Map();

            for (const item of itensResultado.rows) {
                const idPedido = Number(item.pedido_id);

                if (!itensPorPedido.has(idPedido)) {
                    itensPorPedido.set(idPedido, []);
                }

                itensPorPedido.get(idPedido).push({
                    descricao: item.descricao_produto,
                    quantidade: Number(item.quantidade),
                    preco_unitario: Number(item.preco_unitario),
                    total: Number(item.total_item)
                });
            }

            for (const pedido of pedidos) {
                pedido.subtotal = Number(pedido.subtotal || 0);
                pedido.valor_frete = Number(pedido.valor_frete || 0);
                pedido.total = Number(pedido.total || 0);
                pedido.itens = itensPorPedido.get(Number(pedido.id_pedido)) || [];

                pedido.endereco = pedido.cep ? {
                    cep: pedido.cep,
                    estado: pedido.estado,
                    cidade: pedido.cidade,
                    bairro: pedido.bairro,
                    rua: pedido.rua,
                    numero: pedido.numero,
                    complemento: pedido.complemento,
                    referencia: pedido.referencia
                } : null;

                camposEndereco.forEach(campo => delete pedido[campo]);
            }
        }

        return res.json({
            sucesso: true,
            pedidos
        });

    } catch (erro) {
        console.error('Erro ao listar pedidos do cliente:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível carregar seus pedidos. Verifique o terminal do servidor.'
        });
    }
};

exports.meusDados = async (req, res) => {
    try {
        if (!somenteCliente(req, res)) return;

        const resultado = await query(`
            SELECT
                cpf_pessoa,
                nome_pessoa,
                data_nascimento_pessoa,
                endereco_pessoa,
                email_pessoa
            FROM public.pessoa
            WHERE cpf_pessoa = $1
            LIMIT 1
        `, [req.sessao.cpf_pessoa]);

        if (!resultado.rows.length) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Cadastro não encontrado.'
            });
        }

        return res.json({
            sucesso: true,
            pessoa: resultado.rows[0]
        });

    } catch (erro) {
        console.error('Erro ao consultar dados da conta:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível carregar seus dados.'
        });
    }
};

exports.atualizarMeusDados = async (req, res) => {
    try {
        if (!somenteCliente(req, res)) return;

        const cpf = req.sessao.cpf_pessoa;
        const {
            nome_pessoa,
            data_nascimento_pessoa,
            endereco_pessoa,
            email_pessoa
        } = req.body;

        const nome = String(nome_pessoa || '').trim();
        const nascimento = String(data_nascimento_pessoa || '').slice(0, 10);
        const endereco = String(endereco_pessoa || '').trim();
        const email = String(email_pessoa || '').trim();

        if (!nome || !nascimento || !endereco || !email) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Preencha todos os campos.'
            });
        }

        const dataNascimento = new Date(`${nascimento}T00:00:00`);
        const dataHoje = new Date();
        dataHoje.setHours(0, 0, 0, 0);

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(nascimento) ||
            Number.isNaN(dataNascimento.getTime()) ||
            dataNascimento >= dataHoje
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe uma data de nascimento válida.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe um e-mail válido.'
            });
        }

        const resultado = await query(`
            UPDATE public.pessoa
            SET
                nome_pessoa = $1,
                data_nascimento_pessoa = $2,
                endereco_pessoa = $3,
                email_pessoa = $4
            WHERE cpf_pessoa = $5
            RETURNING
                cpf_pessoa,
                nome_pessoa,
                data_nascimento_pessoa,
                endereco_pessoa,
                email_pessoa
        `, [nome, nascimento, endereco, email, cpf]);

        if (!resultado.rows.length) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Cadastro não encontrado.'
            });
        }

        return res.json({
            sucesso: true,
            mensagem: 'Dados atualizados com sucesso.',
            pessoa: resultado.rows[0]
        });

    } catch (erro) {
        console.error('Erro ao atualizar dados da conta:', erro);

        if (erro.code === '23505') {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível atualizar seus dados.'
        });
    }
};
