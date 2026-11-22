
'use strict';

/* =====================================================
   1) CONFIGURAÇÕES
   ===================================================== */

const URL_API = 'http://127.0.0.1:3001';

const CHAVE_CARRINHO = 'mercadoV2_carrinho';
const CHAVE_SELECIONADOS = 'mercadoV2_selecionados';

const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatarMoeda = (valor) => formatadorMoeda.format(valor);

/* =====================================================
   2) DADOS DO CARRINHO
   ===================================================== */

function lerCarrinho() {
    try {
        const dados = JSON.parse(
            localStorage.getItem(CHAVE_CARRINHO) || '[]'
        );

        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        return [];
    }
}

function lerSelecionados() {
    try {
        const dados = JSON.parse(
            localStorage.getItem(CHAVE_SELECIONADOS) || '[]'
        );

        if (!Array.isArray(dados)) return new Set();

        return new Set(
            dados.map(Number).filter(Number.isFinite)
        );
    } catch (erro) {
        return new Set();
    }
}

function salvarSelecionados() {
    localStorage.setItem(
        CHAVE_SELECIONADOS,
        JSON.stringify([...selecionados])
    );
}

const carrinho = lerCarrinho();
let selecionados = lerSelecionados();

/* Na primeira utilização, todos os produtos ficam selecionados. */
if (localStorage.getItem(CHAVE_SELECIONADOS) === null) {
    selecionados = new Set(
        carrinho.map((item) => Number(item.id_produto))
    );
}

/* Remove seleções de produtos que não estão mais no carrinho. */
selecionados = new Set(
    [...selecionados].filter((id) =>
        carrinho.some((item) => Number(item.id_produto) === id)
    )
);

salvarSelecionados();

/* =====================================================
   3) ELEMENTOS DA PÁGINA
   ===================================================== */

const listaProdutos = document.getElementById('listaProdutos');
const mensagemProdutos = document.getElementById('mensagemProdutos');

const elementoSubtotal = document.getElementById('subtotal');
const elementoFrete = document.getElementById('valorEntrega');
const elementoTotal = document.getElementById('valorTotal');

const botaoContinuar = document.getElementById('botaoContinuar');

/* =====================================================
   4) UTILITÁRIOS
   ===================================================== */

function calcularSubtotal(item) {
    return Math.round(
        Number(item.preco) * Number(item.quantidade) * 100
    ) / 100;
}

function formatarQuantidade(item) {
    const quantidade = Number(item.quantidade);

    if (String(item.id_unidade_medida).toUpperCase() === 'KG') {
        return `${quantidade.toFixed(1).replace('.', ',')} KG`;
    }

    return `${quantidade} ${item.id_unidade_medida}`;
}

function criarElemento(tag, classe, texto = '') {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto) elemento.textContent = texto;

    return elemento;
}

/* =====================================================
   5) CARTÃO DE PRODUTO
   ===================================================== */

function criarCartaoProduto(item) {
    const id = Number(item.id_produto);

    const cartao = criarElemento('article', 'produto-revisao');

    const imagem = criarElemento('img', 'produto-revisao__imagem');
    imagem.src = `${URL_API}/imagens/${encodeURIComponent(id)}.png`;
    imagem.alt = item.descricao;
    imagem.loading = 'lazy';

    imagem.addEventListener('error', () => {
        imagem.src = `${URL_API}/imagens/silhueta.jpg`;
    }, { once: true });

    const informacoes = criarElemento('div', 'produto-revisao__informacoes');

    const descricao = criarElemento(
        'h3',
        'produto-revisao__nome',
        item.descricao
    );

    const quantidade = criarElemento(
        'p',
        'produto-revisao__quantidade',
        `Quantidade: ${formatarQuantidade(item)}`
    );

    const preco = criarElemento(
        'p',
        'produto-revisao__preco',
        `${formatarMoeda(Number(item.preco))} / ${item.id_unidade_medida}`
    );

    const subtotal = criarElemento(
        'p',
        'produto-revisao__subtotal',
        `Subtotal: ${formatarMoeda(calcularSubtotal(item))}`
    );

    informacoes.append(
        descricao,
        quantidade,
        preco,
        subtotal
    );

    cartao.append(
        imagem,
        informacoes
    );

    return cartao;
}
/* =====================================================
   6) EXIBIÇÃO DOS PRODUTOS
   ===================================================== */

function renderizarProdutos() {
    listaProdutos.replaceChildren();

    const produtosSelecionados = carrinho.filter((item) =>
        selecionados.has(Number(item.id_produto))
    );

    produtosSelecionados.forEach((item) => {
        listaProdutos.appendChild(
            criarCartaoProduto(item)
        );
    });

    atualizarMensagem();
}

/* =====================================================
   7) RESUMO DA COMPRA
   ===================================================== */

function atualizarResumo() {
    const produtosSelecionados = carrinho.filter((item) =>
        selecionados.has(Number(item.id_produto))
    );

    const subtotal = produtosSelecionados.reduce(
        (total, item) => total + calcularSubtotal(item),
        0
    );

    const subtotalFinal = Math.round(subtotal * 100) / 100;

    elementoSubtotal.textContent = formatarMoeda(subtotalFinal);

    // O frete será calculado na próxima etapa.
    elementoFrete.textContent = 'A calcular';

    // Por enquanto, o total considera apenas os produtos.
    elementoTotal.textContent = formatarMoeda(subtotalFinal);

    botaoContinuar.disabled = produtosSelecionados.length === 0;
}

/* =====================================================
   8) MENSAGENS
   ===================================================== */

function atualizarMensagem() {
    if (carrinho.length === 0) {
        mensagemProdutos.textContent = 'Seu carrinho está vazio.';
        mensagemProdutos.hidden = false;
        botaoContinuar.disabled = true;
        return;
    }

    if (selecionados.size === 0) {
        mensagemProdutos.textContent =
            'Selecione pelo menos um produto para continuar.';
        mensagemProdutos.hidden = false;
        return;
    }

    mensagemProdutos.textContent = '';
    mensagemProdutos.hidden = true;
}

/* =====================================================
   9) CONTINUAR COMPRA
   ===================================================== */

function continuarCompra() {
    if (selecionados.size === 0) {
        atualizarMensagem();
        return;
    }

    salvarSelecionados();

    window.location.href = '../endereco/endereco.html';
}

/* =====================================================
   10) INICIALIZAÇÃO
   ===================================================== */

function inicializar() {
    botaoContinuar.addEventListener('click', continuarCompra);

    renderizarProdutos();
    atualizarResumo();
}

document.addEventListener('DOMContentLoaded', inicializar);
