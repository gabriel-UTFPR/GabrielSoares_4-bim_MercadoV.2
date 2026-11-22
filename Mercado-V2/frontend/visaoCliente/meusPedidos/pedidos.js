/* =====================================================
   Mercado V.2 - Meus pedidos
===================================================== */

'use strict';

const URL_API = 'http://127.0.0.1:3001';

const elementos = {
    mensagem: document.getElementById('mensagem'),
    lista: document.getElementById('listaPedidos')
};

const textosStatus = {
    CARRINHO: 'Carrinho',
    AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
    PAGO: 'Pagamento confirmado',
    CANCELADO: 'Cancelado',
    FINALIZADO: 'Finalizado'
};

const textosPagamento = {
    PIX: 'Pix',
    CREDITO: 'Cartão de crédito',
    DEBITO: 'Cartão de débito',
    DINHEIRO: 'Dinheiro'
};

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatarData(valor) {
    if (!valor) return 'Data não informada';

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return 'Data não informada';

    return data.toLocaleString('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto !== undefined && texto !== null) {
        elemento.textContent = String(texto);
    }

    return elemento;
}

function montarEndereco(endereco) {
    if (!endereco) return 'Endereço de entrega não disponível.';

    const ruaNumero = [endereco.rua, endereco.numero]
        .filter(Boolean)
        .join(', ');

    const bairroCidade = [endereco.bairro, endereco.cidade]
        .filter(Boolean)
        .join(', ');

    const estadoCep = [
        endereco.estado,
        endereco.cep ? `CEP ${endereco.cep}` : ''
    ].filter(Boolean).join(' - ');

    return [ruaNumero, endereco.complemento, bairroCidade, estadoCep]
        .filter(Boolean)
        .join(' · ') || 'Endereço de entrega não disponível.';
}

function criarItemPedido(item) {
    const linha = criarElemento('div', 'item');
    const unidade = Number(item.quantidade).toLocaleString('pt-BR', {
        maximumFractionDigits: 3
    });

    linha.append(
        criarElemento(
            'span',
            'item__info',
            `${item.descricao || 'Produto'} · ${unidade} × ${formatarMoeda(item.preco_unitario)}`
        ),
        criarElemento('strong', 'item__total', formatarMoeda(item.total))
    );

    return linha;
}

function criarPedido(pedido) {
    const card = criarElemento('article', 'pedido');
    const topo = criarElemento('div', 'pedido__topo');
    const identificacao = criarElemento('div');
    const statusCodigo = String(pedido.status_pedido || '').toLowerCase();

    identificacao.append(
        criarElemento('div', 'pedido__numero', `Pedido #${pedido.id_pedido}`),
        criarElemento('div', 'pedido__data', formatarData(pedido.data_pedido))
    );

    topo.append(
        identificacao,
        criarElemento(
            'span',
            `status ${statusCodigo}`,
            textosStatus[pedido.status_pedido] || pedido.status_pedido || 'Status não informado'
        )
    );

    card.append(topo);

    const itens = criarElemento('div', 'pedido__itens');

    if (Array.isArray(pedido.itens) && pedido.itens.length) {
        pedido.itens.forEach(item => itens.append(criarItemPedido(item)));
    } else {
        itens.append(criarElemento('p', 'item__info', 'Os itens deste pedido não estão disponíveis.'));
    }

    card.append(itens);

    const rodape = criarElemento('div', 'pedido__rodape');
    rodape.append(
        criarElemento('span', '', 'Subtotal'),
        criarElemento('span', '', formatarMoeda(pedido.subtotal)),
        criarElemento('span', '', 'Frete'),
        criarElemento('span', '', formatarMoeda(pedido.valor_frete)),
        criarElemento('strong', '', 'Total'),
        criarElemento('strong', 'pedido__total', formatarMoeda(pedido.total))
    );

    card.append(rodape);

    card.append(
        criarElemento(
            'div',
            'pedido__pagamento',
            `Forma de pagamento: ${textosPagamento[pedido.forma_pagamento] || pedido.forma_pagamento || 'Não informada'}`
        ),
        criarElemento('div', 'pedido__endereco', `Entrega: ${montarEndereco(pedido.endereco)}`)
    );

    return card;
}

function mostrarErro(mensagem) {
    elementos.mensagem.textContent = mensagem;
    elementos.mensagem.className = 'mensagem erro';
    elementos.mensagem.hidden = false;
}

function mostrarPedidosVazios() {
    const vazio = criarElemento('div', 'vazio');
    vazio.append(
        criarElemento('h2', '', 'Você ainda não fez pedidos'),
        criarElemento('p', '', 'Quando concluir uma compra, ela aparecerá aqui.')
    );

    const link = criarElemento('a', 'botao', 'Ir às compras');
    link.href = '../loja/loja.html';
    vazio.append(link);

    elementos.lista.append(vazio);
}

async function carregarPedidos() {
    try {
        const resposta = await fetch(`${URL_API}/cliente-area/pedidos`, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' }
        });

        const dados = await resposta.json().catch(() => null);

        if (!resposta.ok || !dados || !dados.sucesso) {
            throw new Error(
                dados?.mensagem ||
                (resposta.status === 401
                    ? 'Sua sessão expirou. Entre novamente para consultar seus pedidos.'
                    : 'Não foi possível carregar seus pedidos.')
            );
        }

        elementos.mensagem.hidden = true;
        elementos.lista.replaceChildren();

        const pedidos = Array.isArray(dados.pedidos) ? dados.pedidos : [];

        if (!pedidos.length) {
            mostrarPedidosVazios();
            return;
        }

        pedidos.forEach(pedido => elementos.lista.append(criarPedido(pedido)));

    } catch (erro) {
        console.error('Erro ao carregar meus pedidos:', erro);
        mostrarErro(erro.message || 'Ocorreu um erro ao carregar seus pedidos.');
    }
}

carregarPedidos();
