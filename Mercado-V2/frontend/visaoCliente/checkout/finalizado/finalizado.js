'use strict';

const CHAVE_PEDIDO = 'mercadoV2_pedido_finalizado';

const elementos = {
    confirmacao: document.getElementById('confirmacaoPedido'),
    aviso: document.getElementById('avisoPedido'),
    numeroPedido: document.getElementById('numeroPedido'),
    statusPedido: document.getElementById('statusPedido'),
    subtotal: document.getElementById('subtotal'),
    frete: document.getElementById('frete'),
    total: document.getElementById('total'),
    formaPagamento: document.getElementById('formaPagamento')
};

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatarPagamento(valor) {
    const formas = {
        PIX: 'PIX',
        CARTAO_CREDITO: 'Cartão de crédito',
        CARTAO_DEBITO: 'Cartão de débito',
        DINHEIRO: 'Dinheiro'
    };
    return formas[valor] || 'Não informado';
}

function inicializar() {
    let pedido;
    try {
        pedido = JSON.parse(sessionStorage.getItem(CHAVE_PEDIDO));
    } catch (erro) {
        console.error('Erro ao recuperar confirmação do pedido:', erro);
    }

    if (!pedido || !pedido.id_pedido) {
        elementos.aviso.hidden = false;
        return;
    }

    elementos.numeroPedido.textContent = `#${pedido.id_pedido}`;
    elementos.statusPedido.textContent = pedido.status_pedido || 'FINALIZADO';
    elementos.subtotal.textContent = formatarMoeda(pedido.subtotal);
    elementos.frete.textContent = formatarMoeda(pedido.valor_frete);
    elementos.total.textContent = formatarMoeda(pedido.total);
    elementos.formaPagamento.textContent = formatarPagamento(pedido.formaPagamento);
    elementos.confirmacao.hidden = false;
}


inicializar();
