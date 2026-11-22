'use strict';

/* =====================================================
   Mercado V.2 - Pagamento

   1) Configurações
   2) Elementos HTML
   3) Utilitários
   4) Recuperação dos dados
   5) Resumo da compra
   6) Finalização do pedido
   7) Inicialização
===================================================== */


/* =====================================================
   1) CONFIGURAÇÕES
===================================================== */

const CONFIG = {
    URL_API: 'http://127.0.0.1:3001',

    CHAVE_CARRINHO: 'mercadoV2_carrinho',
    CHAVE_SELECIONADOS: 'mercadoV2_selecionados',
    CHAVE_ENDERECO: 'mercadoV2_endereco_checkout',
    CHAVE_FRETE: 'mercadoV2_frete_checkout',
    CHAVE_PEDIDO_FINALIZADO: 'mercadoV2_pedido_finalizado',

    PAGINA_ENDERECO: '../endereco/endereco.html',
    PAGINA_LOJA: '../../loja/loja.html',
    PAGINA_FINALIZADO: '../finalizado/finalizado.html'
};


/* =====================================================
   2) ELEMENTOS HTML
===================================================== */

const elementos = {
    form: document.getElementById('formPagamento'),

    subtotal: document.getElementById('subtotal'),
    valorFrete: document.getElementById('valorFrete'),
    valorTotal: document.getElementById('valorTotal'),

    mensagem: document.getElementById('mensagemPagamento'),
    botaoFinalizar: document.getElementById('botaoFinalizar')
};


/* =====================================================
   3) UTILITÁRIOS
===================================================== */

const formatarMoeda = (valor) => {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};


function mostrarMensagem(mensagem, sucesso = false) {
    elementos.mensagem.textContent = mensagem;
    elementos.mensagem.hidden = false;

    elementos.mensagem.classList.toggle(
        'mensagem--sucesso',
        sucesso
    );

    elementos.mensagem.classList.toggle(
        'mensagem--erro',
        !sucesso
    );
}


function limparMensagem() {
    elementos.mensagem.textContent = '';
    elementos.mensagem.hidden = true;

    elementos.mensagem.classList.remove(
        'mensagem--sucesso',
        'mensagem--erro'
    );
}


function lerArmazenamento(armazenamento, chave) {
    try {
        const dados = armazenamento.getItem(chave);

        return dados ? JSON.parse(dados) : null;

    } catch (erro) {
        console.error(`Erro ao recuperar ${chave}:`, erro);
        return null;
    }
}


/* =====================================================
   4) RECUPERAÇÃO DOS DADOS
===================================================== */

// Recuperar carrinho e produtos selecionados.
const carrinhoCompleto = lerArmazenamento(
    localStorage,
    CONFIG.CHAVE_CARRINHO
);

const idsSelecionados = lerArmazenamento(
    localStorage,
    CONFIG.CHAVE_SELECIONADOS
);


// Garantir que os dados sejam listas válidas.
const carrinho = Array.isArray(carrinhoCompleto)
    ? carrinhoCompleto
    : [];

const selecionados = Array.isArray(idsSelecionados)
    ? idsSelecionados.map(Number)
    : [];


// Manter somente os produtos selecionados.
const carrinhoSelecionado = carrinho.filter((item) => {
    return selecionados.includes(Number(item.id_produto));
});


// Recuperar endereço e frete.
const endereco = lerArmazenamento(
    sessionStorage,
    CONFIG.CHAVE_ENDERECO
);

const frete = lerArmazenamento(
    sessionStorage,
    CONFIG.CHAVE_FRETE
);


/* =====================================================
   5) RESUMO DA COMPRA
===================================================== */

function calcularSubtotal() {
    return carrinhoSelecionado.reduce((total, item) => {
        const preco = Number(item.preco) || 0;
        const quantidade = Number(item.quantidade) || 0;

        return total + (preco * quantidade);

    }, 0);
}


const subtotalCompra = calcularSubtotal();

const valorFrete = Number(frete?.valorFrete) || 0;

const totalCompra = subtotalCompra + valorFrete;


function renderizarResumo() {
    elementos.subtotal.textContent =
        formatarMoeda(subtotalCompra);

    elementos.valorFrete.textContent =
        formatarMoeda(valorFrete);

    elementos.valorTotal.textContent =
        formatarMoeda(totalCompra);
}


/* =====================================================
   6) FINALIZAÇÃO DO PEDIDO
===================================================== */

async function finalizarPedido(evento) {
    evento.preventDefault();

    limparMensagem();

    // Conferir se existe forma de pagamento selecionada.
    const formaPagamento = elementos.form.querySelector(
        'input[name="formaPagamento"]:checked'
    );

    if (!formaPagamento) {
        mostrarMensagem('Selecione uma forma de pagamento.');
        return;
    }

    // Conferir se existem produtos selecionados.
    if (carrinhoSelecionado.length === 0) {
        mostrarMensagem(
            'Não existem produtos selecionados para pagamento.'
        );
        return;
    }

    // Conferir endereço e frete.
    if (!endereco || !frete) {
        mostrarMensagem(
            'Os dados do endereço ou do frete não foram encontrados.'
        );
        return;
    }

    // Preparar os produtos que serão enviados.
    const itens = carrinhoSelecionado.map((item) => ({
        id_produto: Number(item.id_produto),
        quantidade: Number(item.quantidade)
    }));

    // Impedir cliques repetidos durante a requisição.
    elementos.botaoFinalizar.disabled = true;
    elementos.botaoFinalizar.textContent = 'Finalizando...';

    try {

        const resposta = await fetch(
            `${CONFIG.URL_API}/pedido/finalizar`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                credentials: 'include',

                body: JSON.stringify({
                    itens,
                    endereco,
                    formaPagamento: formaPagamento.value,

                    // Token assinado pelo servidor na etapa de endereço.
                    // O valor do frete NÃO é enviado: o servidor decide.
                    freteToken: frete.freteToken
                })
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || 'Não foi possível finalizar o pedido.'
            );
        }

        /*
         * A compra foi confirmada pelo servidor.
         *
         * Remover somente os produtos que foram comprados.
         * Os produtos não selecionados permanecem no carrinho.
         */

        const idsComprados = new Set(
            itens.map(item => item.id_produto)
        );

        const carrinhoAtual = lerArmazenamento(
            localStorage,
            CONFIG.CHAVE_CARRINHO
        );

        const carrinhoAtualizado = (
            Array.isArray(carrinhoAtual) ? carrinhoAtual : []
        ).filter((item) => {
            return !idsComprados.has(Number(item.id_produto));
        });

        localStorage.setItem(
            CONFIG.CHAVE_CARRINHO,
            JSON.stringify(carrinhoAtualizado)
        );

        // Limpar a seleção dos produtos.
        localStorage.removeItem(CONFIG.CHAVE_SELECIONADOS);

        // Limpar os dados temporários do checkout.
        sessionStorage.removeItem(CONFIG.CHAVE_ENDERECO);
        sessionStorage.removeItem(CONFIG.CHAVE_FRETE);

        // O valor oficial do frete é o confirmado pelo servidor.
        const freteConfirmado = Number(dados.pedido.valor_frete);

        const avisoFrete = Math.abs(freteConfirmado - valorFrete) > 0.005
            ? ` O frete foi atualizado para ${formatarMoeda(freteConfirmado)}.`
            : '';

        // Guardar apenas os dados confirmados pelo backend para a tela de sucesso.
        const pedidoFinalizado = {
            id_pedido: dados.pedido.id_pedido,
            status_pedido: dados.pedido.status_pedido,
            subtotal: Number(dados.pedido.subtotal),
            valor_frete: freteConfirmado,
            total: Number(dados.pedido.total),
            formaPagamento: formaPagamento.value,
            emailEnviado: Boolean(dados.emailEnviado),
            emailDestino: dados.emailDestino || null,
            dataFinalizacao: new Date().toISOString()
        };

        sessionStorage.setItem(
            CONFIG.CHAVE_PEDIDO_FINALIZADO,
            JSON.stringify(pedidoFinalizado)
        );

        // Redirecionar para a página dedicada de confirmação.
        window.location.href = CONFIG.PAGINA_FINALIZADO;

    } catch (erro) {

        console.error('Erro ao finalizar pedido:', erro);

        mostrarMensagem(erro.message);

        elementos.botaoFinalizar.disabled = false;
        elementos.botaoFinalizar.textContent = 'Finalizar pedido';
    }
}


/* =====================================================
   7) INICIALIZAÇÃO
===================================================== */

function inicializar() {

    // Verificar se existem produtos selecionados.
    if (carrinhoSelecionado.length === 0) {
        mostrarMensagem(
            'Não existem produtos selecionados para pagamento.'
        );

        elementos.botaoFinalizar.disabled = true;
        return;
    }

    // Verificar se o endereço foi preenchido.
    if (!endereco || !frete) {
        mostrarMensagem(
            'Os dados do endereço ou do frete não foram encontrados. ' +
            'Volte à etapa anterior.'
        );

        elementos.botaoFinalizar.disabled = true;
        return;
    }

    // O frete calculado precisa ser do mesmo CEP do endereço informado.
    if (
        !frete.freteToken ||
        String(frete.cepDestino) !== String(endereco.cep)
    ) {
        mostrarMensagem(
            'O frete não corresponde ao endereço informado. ' +
            'Volte à etapa anterior e calcule o frete novamente.'
        );

        elementos.botaoFinalizar.disabled = true;
        return;
    }

    // Exibir o resumo da compra.
    renderizarResumo();

    // Registrar o envio do formulário.
    elementos.form.addEventListener(
        'submit',
        finalizarPedido
    );
}


inicializar();