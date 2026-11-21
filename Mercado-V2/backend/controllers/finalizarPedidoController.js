'use strict';

/* =====================================================
   Mercado V.2 - Finalização do Pedido

   1) Importações
   2) Configurações
   3) Validações
   4) Finalização da compra
===================================================== */

/* =====================================================
   1) IMPORTAÇÕES
===================================================== */

const { pool } = require('../database');
const {
    ErroFrete,
    calcularFrete,
    validarTokenFrete
} = require('../services/freteService');


/* =====================================================
   2) CONFIGURAÇÕES
===================================================== */

const FORMAS_PAGAMENTO = {
    PIX: 'PIX',
    CARTAO_CREDITO: 'CREDITO',
    CARTAO_DEBITO: 'DEBITO',
    DINHEIRO: 'DINHEIRO'
};


/* =====================================================
   3) VALIDAÇÕES
===================================================== */

function validarEndereco(endereco) {
    if (!endereco || typeof endereco !== 'object') {
        throw new Error('Os dados do endereço não foram informados.');
    }

    const camposObrigatorios = [
        'cep',
        'estado',
        'cidade',
        'bairro',
        'rua',
        'numero'
    ];

    for (const campo of camposObrigatorios) {
        if (
            typeof endereco[campo] !== 'string' ||
            !endereco[campo].trim()
        ) {
            throw new Error(`O campo ${campo} do endereço é obrigatório.`);
        }
    }

    return {
        cep: endereco.cep.replace(/\D/g, ''),
        estado: endereco.estado.trim(),
        cidade: endereco.cidade.trim(),
        bairro: endereco.bairro.trim(),
        rua: endereco.rua.trim(),
        numero: endereco.numero.trim(),
        complemento: String(endereco.complemento || '').trim(),
        referencia: String(endereco.referencia || '').trim()
    };
}


/*
 * Define o valor do frete SEM confiar no navegador.
 *
 * 1) Se o navegador enviou o token assinado pelo servidor na etapa
 *    de endereço (e ele é válido, não expirou e pertence a este
 *    cliente e a este CEP), reaproveitamos o valor já calculado.
 * 2) Caso contrário (token ausente, adulterado ou expirado), o frete
 *    é recalculado aqui no servidor.
 *
 * O valor numérico enviado pelo navegador nunca é utilizado.
 * A restrição a Campo Mourão - PR é garantida pelo CEP: o token só
 * é emitido para CEPs de Campo Mourão, e o recálculo consulta a
 * BrasilAPI novamente.
 */
async function obterFreteValidado({ freteToken, cpf, endereco }) {

    const dadosToken = validarTokenFrete(freteToken, {
        cpf,
        cep: endereco.cep
    });

    if (dadosToken) {
        console.log(
            `[pedido] Frete reaproveitado do token (CEP ${endereco.cep}): ` +
            `${dadosToken.valorFrete}`
        );

        return Number(dadosToken.valorFrete);
    }

    console.warn(
        `[pedido] Token de frete ausente, inválido ou expirado. ` +
        `Recalculando o frete do CEP ${endereco.cep}.`
    );

    const dadosFrete = await calcularFrete(endereco.cep);

    return Number(dadosFrete.valorFrete);
}


function validarItens(itens) {
    if (!Array.isArray(itens) || itens.length === 0) {
        throw new Error('Nenhum produto foi selecionado para a compra.');
    }

    const produtos = new Map();

    for (const item of itens) {
        const idProduto = Number(item.id_produto);
        const quantidade = Number(item.quantidade);

        if (!Number.isInteger(idProduto) || idProduto <= 0) {
            throw new Error('Um dos produtos selecionados possui ID inválido.');
        }

        if (
            !Number.isFinite(quantidade) ||
            quantidade <= 0 ||
            quantidade > 999999 ||
            !Number.isInteger(quantidade * 1000)
        ) {
            throw new Error('Uma das quantidades informadas é inválida.');
        }

        // Se o mesmo produto aparecer mais de uma vez,
        // somamos as quantidades para evitar duplicidade.
        const quantidadeAnterior = produtos.get(idProduto) || 0;

        produtos.set(
            idProduto,
            quantidadeAnterior + quantidade
        );
    }

    return Array.from(produtos, ([id_produto, quantidade]) => ({
        id_produto,
        quantidade
    }));
}


/* =====================================================
   4) FINALIZAÇÃO DA COMPRA
===================================================== */

exports.finalizarPedido = async (req, res) => {

    // Somente clientes podem finalizar compras.
    if (req.sessao.tipo_acesso !== 'CLIENTE') {
        return res.status(403).json({
            sucesso: false,
            mensagem: 'Somente clientes podem finalizar pedidos.'
        });
    }

    const cpf = req.sessao.cpf_pessoa;

    let client;

    try {

        const {
            itens,
            endereco: enderecoRecebido,
            formaPagamento,
            freteToken
        } = req.body;

        // Validar os dados recebidos.
        const endereco = validarEndereco(enderecoRecebido);
        const itensValidados = validarItens(itens);

        const formaPagamentoBanco =
            FORMAS_PAGAMENTO[formaPagamento];

        if (!formaPagamentoBanco) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Selecione uma forma de pagamento válida.'
            });
        }

        if (endereco.cep.length !== 8) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'O CEP informado é inválido.'
            });
        }

        /*
         * O frete é definido no servidor (token assinado ou recálculo).
         * Isso acontece ANTES de abrir a transação, para não manter
         * conexões do banco ocupadas durante consultas externas.
         */
        const valorFrete = await obterFreteValidado({
            freteToken,
            cpf,
            endereco
        });

        if (!Number.isFinite(valorFrete) || valorFrete < 0) {
            throw new Error('Não foi possível calcular o frete.');
        }

        /*
         * Neste ponto o CEP já foi confirmado pelo servidor como sendo
         * de Campo Mourão - PR (token assinado ou nova consulta à
         * BrasilAPI). Por isso não comparamos os textos de cidade/estado
         * digitados no formulário (podem vir como "Paraná", com espaços
         * etc.) e gravamos os valores padronizados.
         */
        endereco.cidade = 'Campo Mourão';
        endereco.estado = 'PR';

        // Iniciar conexão exclusiva para a transação.
        client = await pool.connect();

        await client.query('BEGIN');

        /*
         * 1. Verificar os produtos no banco.
         *
         * O preço, a descrição e a unidade são obtidos
         * diretamente do PostgreSQL, nunca do navegador.
         *
         * FOR UPDATE bloqueia os registros durante
         * a finalização para evitar alterações concorrentes.
         */
        const idsProdutos = itensValidados.map(
            item => item.id_produto
        );

        const resultadoProdutos = await client.query(`
            SELECT
                p.id_produto,
                p.descricao,
                p.preco,
                p.estoque,
                p.id_unidade_medida
            FROM public.produto p
            WHERE p.id_produto = ANY($1::INTEGER[])
            ORDER BY p.id_produto
            FOR UPDATE
        `, [idsProdutos]);

        if (resultadoProdutos.rows.length !== itensValidados.length) {
            throw new Error(
                'Um ou mais produtos não foram encontrados.'
            );
        }

        const produtosBanco = new Map();

        for (const produto of resultadoProdutos.rows) {
            produtosBanco.set(
                Number(produto.id_produto),
                produto
            );
        }

        /*
         * 2. Validar estoque e unidade de medida.
         */
        for (const item of itensValidados) {
            const produto = produtosBanco.get(item.id_produto);

            if (!produto) {
                throw new Error('Produto não encontrado.');
            }

            const estoque = Number(produto.estoque);

            if (item.quantidade > estoque) {
                throw new Error(
                    `Estoque insuficiente para ${produto.descricao}. ` +
                    `Disponível: ${estoque}.`
                );
            }

            // Somente produtos vendidos em KG aceitam decimais.
            if (
                produto.id_unidade_medida !== 'KG' &&
                !Number.isInteger(item.quantidade)
            ) {
                throw new Error(
                    `${produto.descricao} não permite quantidade decimal.`
                );
            }
        }

        /*
         * 3. Cadastrar o endereço da compra.
         */
        const resultadoEndereco = await client.query(`
            INSERT INTO public.endereco_pedido (
                cep,
                estado,
                cidade,
                bairro,
                rua,
                numero,
                complemento,
                referencia
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id_endereco
        `, [
            endereco.cep,
            endereco.estado,
            endereco.cidade,
            endereco.bairro,
            endereco.rua,
            endereco.numero,
            endereco.complemento || null,
            endereco.referencia || null
        ]);

        const idEndereco = resultadoEndereco.rows[0].id_endereco;

        /*
         * 4. Criar o pedido inicialmente como CARRINHO.
         *
         * O gatilho de estoque ainda não será acionado.
         */
        const resultadoPedido = await client.query(`
            INSERT INTO public.pedido (
                cliente_cpf,
                endereco_id,
                status_pedido,
                forma_pagamento,
                valor_frete
            )
            VALUES ($1, $2, 'CARRINHO', $3, $4)
            RETURNING id_pedido
        `, [
            cpf,
            idEndereco,
            formaPagamentoBanco,
            valorFrete
        ]);

        const idPedido = resultadoPedido.rows[0].id_pedido;

        /*
         * 5. Inserir os produtos do pedido.
         *
         * Descrição e preço são copiados do banco.
         * O gatilho atualiza automaticamente valor_total.
         */
        for (const item of itensValidados) {
            const produto = produtosBanco.get(item.id_produto);

            await client.query(`
                INSERT INTO public.item_pedido (
                    pedido_id,
                    produto_id,
                    descricao_produto,
                    quantidade,
                    preco_unitario
                )
                VALUES ($1, $2, $3, $4, $5)
            `, [
                idPedido,
                produto.id_produto,
                produto.descricao,
                item.quantidade,
                produto.preco
            ]);
        }

        /*
         * 6. Alterar o status para PAGO.
         *
         * O gatilho do PostgreSQL valida e baixa o estoque.
         * Não realizar UPDATE manual na tabela produto.
         */
        await client.query(`
            UPDATE public.pedido
            SET status_pedido = 'PAGO'
            WHERE id_pedido = $1
              AND cliente_cpf = $2
              AND status_pedido = 'CARRINHO'
        `, [idPedido, cpf]);

        /*
         * 7. Recuperar os valores finais calculados pelo banco.
         */
        const resultadoFinal = await client.query(`
            SELECT
                id_pedido,
                status_pedido,
                valor_total,
                valor_frete,
                (valor_total + valor_frete) AS total_compra
            FROM public.pedido
            WHERE id_pedido = $1
        `, [idPedido]);

        const pedido = resultadoFinal.rows[0];

        // Confirmar todas as operações.
        await client.query('COMMIT');

        return res.status(201).json({
            sucesso: true,
            mensagem: 'Pedido finalizado com sucesso!',
            pedido: {
                id_pedido: pedido.id_pedido,
                status_pedido: pedido.status_pedido,
                subtotal: Number(pedido.valor_total),
                valor_frete: Number(pedido.valor_frete),
                total: Number(pedido.total_compra)
            }
        });

    } catch (erro) {

        if (client) {
            await client.query('ROLLBACK');
        }

        // Erros previstos do cálculo de frete (CEP, área, serviços externos)
        if (erro instanceof ErroFrete) {
            console.warn(`[pedido] Frete: ${erro.status} - ${erro.message}`);

            return res.status(erro.status).json({
                sucesso: false,
                mensagem: erro.message
            });
        }

        console.error('Erro ao finalizar pedido:', erro);

        // Erros de validação ou dos gatilhos do PostgreSQL.
        if (
            erro.message.includes('Estoque insuficiente') ||
            erro.message.includes('Produto') ||
            erro.message.includes('quantidade') ||
            erro.message.includes('não permite')
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: erro.message
            });
        }

        if (erro.code === '23503' || erro.code === '23514') {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Os dados do pedido são inválidos.'
            });
        }

        if (erro.code === 'P0001') {
            return res.status(409).json({
                sucesso: false,
                mensagem: erro.message
            });
        }

        return res.status(500).json({
            sucesso: false,
            mensagem: erro.message ||
                'Não foi possível finalizar o pedido.'
        });

    } finally {

        if (client) {
            client.release();
        }
    }
};