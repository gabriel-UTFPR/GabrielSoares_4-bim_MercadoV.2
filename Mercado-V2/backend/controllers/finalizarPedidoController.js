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
const { enviarEmail } = require('../services/emailService');
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


function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caractere]);
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatarQuantidade(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    });
}

function obterNomeFormaPagamento(formaPagamento) {
    const nomes = {
        PIX: 'PIX',
        CREDITO: 'Cartão de crédito',
        DEBITO: 'Cartão de débito',
        DINHEIRO: 'Dinheiro'
    };

    return nomes[formaPagamento] || formaPagamento;
}

function montarEmailConfirmacao({ cliente, pedido, itens, endereco }) {
    const nome = escaparHtml(cliente.nome_pessoa);
    const numeroPedido = escaparHtml(pedido.id_pedido);
    const dataPedido = new Date(pedido.data_pedido).toLocaleString('pt-BR');
    const formaPagamento = obterNomeFormaPagamento(pedido.forma_pagamento);

    const linhasItensTexto = itens.map(item => {
        const quantidade = formatarQuantidade(item.quantidade);
        const preco = formatarMoeda(item.preco_unitario);
        const totalItem = formatarMoeda(
            Number(item.quantidade) * Number(item.preco_unitario)
        );

        return `- ${item.descricao_produto} | ${quantidade} x ${preco} = ${totalItem}`;
    }).join('\n');

    const linhasItensHtml = itens.map(item => {
        const quantidade = escaparHtml(formatarQuantidade(item.quantidade));
        const descricao = escaparHtml(item.descricao_produto);
        const preco = escaparHtml(formatarMoeda(item.preco_unitario));
        const totalItem = escaparHtml(formatarMoeda(
            Number(item.quantidade) * Number(item.preco_unitario)
        ));

        return `
            <tr>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${descricao}</td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${quantidade}</td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${preco}</td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${totalItem}</td>
            </tr>
        `;
    }).join('');

    const enderecoTexto = [
        `${endereco.rua}, ${endereco.numero}`,
        endereco.complemento,
        endereco.bairro,
        `${endereco.cidade} - ${endereco.estado}`,
        `CEP: ${endereco.cep}`,
        endereco.referencia ? `Referência: ${endereco.referencia}` : null
    ].filter(Boolean).join(' | ');

    const enderecoHtml = [
        `${escaparHtml(endereco.rua)}, ${escaparHtml(endereco.numero)}`,
        endereco.complemento ? escaparHtml(endereco.complemento) : null,
        escaparHtml(endereco.bairro),
        `${escaparHtml(endereco.cidade)} - ${escaparHtml(endereco.estado)}`,
        `CEP: ${escaparHtml(endereco.cep)}`,
        endereco.referencia ? `Referência: ${escaparHtml(endereco.referencia)}` : null
    ].filter(Boolean).join('<br>');

    const texto = [
        `Olá, ${cliente.nome_pessoa}!`,
        '',
        `Seu pedido #${pedido.id_pedido} foi confirmado no Mercado V.2.`,
        `Data: ${dataPedido}`,
        `Status: ${pedido.status_pedido}`,
        `Forma de pagamento: ${formaPagamento}`,
        '',
        'Produtos:',
        linhasItensTexto,
        '',
        `Subtotal: ${formatarMoeda(pedido.subtotal)}`,
        `Frete: ${formatarMoeda(pedido.valor_frete)}`,
        `Total: ${formatarMoeda(pedido.total)}`,
        '',
        `Endereço de entrega: ${enderecoTexto}`,
        '',
        'Obrigado por comprar no Mercado V.2!'
    ].join('\n');

    const html = `
        <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1f2937;">
            <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:12px;overflow:hidden;">
                <div style="padding:22px 26px;background:#0b3d91;color:#ffffff;">
                    <h1 style="margin:0;font-size:24px;">Mercado <span style="color:#93c5fd;">V.2</span></h1>
                </div>
                <div style="padding:26px;">
                    <h2 style="margin:0 0 12px;color:#067647;">Compra confirmada!</h2>
                    <p>Olá, <strong>${nome}</strong>!</p>
                    <p>Seu pedido <strong>#${numeroPedido}</strong> foi registrado com sucesso.</p>
                    <p style="color:#6b7280;font-size:13px;">${escaparHtml(dataPedido)} · Status: ${escaparHtml(pedido.status_pedido)}</p>

                    <h3 style="margin:24px 0 10px;color:#0b3d91;">Resumo dos produtos</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                        <thead>
                            <tr style="background:#e8f0fd;color:#0b3d91;">
                                <th style="padding:10px;text-align:left;">Produto</th>
                                <th style="padding:10px;text-align:center;">Qtd.</th>
                                <th style="padding:10px;text-align:right;">Preço</th>
                                <th style="padding:10px;text-align:right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${linhasItensHtml}</tbody>
                    </table>

                    <div style="margin:20px 0 0 auto;max-width:300px;">
                        <p style="display:flex;justify-content:space-between;">Subtotal: <strong>${escaparHtml(formatarMoeda(pedido.subtotal))}</strong></p>
                        <p style="display:flex;justify-content:space-between;">Frete: <strong>${escaparHtml(formatarMoeda(pedido.valor_frete))}</strong></p>
                        <p style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #dbe3ef;font-size:18px;color:#0b3d91;">Total: <strong>${escaparHtml(formatarMoeda(pedido.total))}</strong></p>
                    </div>

                    <p><strong>Forma de pagamento:</strong> ${escaparHtml(formaPagamento)}</p>
                    <h3 style="margin:24px 0 8px;color:#0b3d91;">Endereço de entrega</h3>
                    <p style="line-height:1.6;">${enderecoHtml}</p>
                    <p style="margin-top:24px;">Obrigado por comprar no Mercado V.2!</p>
                    <p style="color:#6b7280;font-size:12px;">Este e-mail confirma o registro do pedido. O pagamento do projeto é simulado.</p>
                </div>
            </div>
        </div>
    `;

    return {
        para: cliente.email_pessoa,
        assunto: `Pedido #${pedido.id_pedido} confirmado - Mercado V.2`,
        texto,
        html
    };
}


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
                data_pedido,
                status_pedido,
                forma_pagamento,
                valor_total,
                valor_frete,
                (valor_total + valor_frete) AS total_compra
            FROM public.pedido
            WHERE id_pedido = $1
        `, [idPedido]);

        const pedidoBanco = resultadoFinal.rows[0];

        // Recuperar o e-mail cadastrado e confirmar que o CPF possui vínculo de cliente.
        const resultadoCliente = await client.query(`
            SELECT
                p.nome_pessoa,
                p.email_pessoa
            FROM public.pessoa p
            INNER JOIN public.cliente c
                ON c.pessoa_cpf_pessoa = p.cpf_pessoa
            WHERE p.cpf_pessoa = $1
            LIMIT 1
        `, [cpf]);

        if (resultadoCliente.rows.length === 0) {
            throw new Error('Não foi possível localizar os dados do cliente para enviar a confirmação.');
        }

        const clienteEmail = resultadoCliente.rows[0];

        // Recuperar os produtos registrados no pedido para compor o e-mail.
        const resultadoItensEmail = await client.query(`
            SELECT
                descricao_produto,
                quantidade,
                preco_unitario
            FROM public.item_pedido
            WHERE pedido_id = $1
            ORDER BY id_item_pedido
        `, [idPedido]);

        const pedidoEmail = {
            id_pedido: pedidoBanco.id_pedido,
            data_pedido: pedidoBanco.data_pedido,
            status_pedido: pedidoBanco.status_pedido,
            forma_pagamento: pedidoBanco.forma_pagamento,
            subtotal: Number(pedidoBanco.valor_total),
            valor_frete: Number(pedidoBanco.valor_frete),
            total: Number(pedidoBanco.total_compra)
        };

        // Preparar o e-mail antes de encerrar a conexão com o banco.
        const mensagemEmail = montarEmailConfirmacao({
            cliente: clienteEmail,
            pedido: pedidoEmail,
            itens: resultadoItensEmail.rows,
            endereco
        });

        // Confirmar a compra no banco ANTES de tentar enviar o e-mail.
        await client.query('COMMIT');

        // Liberar a conexão: a comunicação SMTP ocorre fora da transação.
        client.release();
        client = null;

        // Falha no e-mail não desfaz uma compra que já foi confirmada.
        let emailEnviado = false;

        try {
            await enviarEmail(mensagemEmail);
            emailEnviado = true;
            console.log(`[pedido] E-mail de confirmação enviado para ${clienteEmail.email_pessoa} (pedido #${idPedido}).`);
        } catch (erroEmail) {
            console.error(
                `[pedido] Pedido #${idPedido} foi confirmado, mas o e-mail não pôde ser enviado para ${clienteEmail.email_pessoa}:`,
                erroEmail
            );
        }

        return res.status(201).json({
            sucesso: true,
            mensagem: emailEnviado
                ? 'Pedido finalizado com sucesso! Enviamos a confirmação para seu e-mail.'
                : 'Pedido finalizado com sucesso, mas não foi possível enviar o e-mail de confirmação.',
            emailEnviado,
            emailDestino: clienteEmail.email_pessoa,
            pedido: {
                id_pedido: pedidoEmail.id_pedido,
                status_pedido: pedidoEmail.status_pedido,
                subtotal: pedidoEmail.subtotal,
                valor_frete: pedidoEmail.valor_frete,
                total: pedidoEmail.total
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