'use strict';

const API = 'http://127.0.0.1:3001';
const estado = { pedidos: [], pedidoSelecionado: null };

const el = (id) => document.getElementById(id);
const formatarMoeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarData = (valor) => valor ? new Date(valor).toLocaleString('pt-BR') : '—';
const nomeStatus = {
    CARRINHO: 'Carrinho',
    AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
    PAGO: 'Pago',
    CANCELADO: 'Cancelado',
    FINALIZADO: 'Finalizado'
};

async function requisicaoJson(url, opcoes = {}) {
    const resposta = await fetch(url, {
        credentials: 'include',
        ...opcoes,
        headers: { ...(opcoes.headers || {}) }
    });
    const texto = await resposta.text();
    let dados = {};
    try { dados = texto ? JSON.parse(texto) : {}; }
    catch (_) { throw new Error('O servidor retornou uma resposta inválida.'); }
    if (!resposta.ok || dados.sucesso === false) {
        throw new Error(dados.mensagem || 'Não foi possível concluir a operação.');
    }
    return dados;
}

function mostrarMensagem(id, texto, tipo = '') {
    const caixa = el(id);
    caixa.textContent = texto;
    caixa.className = `mensagem ${tipo}`.trim();
    caixa.hidden = !texto;
}

async function verificarGerente() {
    try {
        const dados = await requisicaoJson(`${API}/auth/minha-sessao`);
        if (dados.sessao?.tipo_acesso !== 'GERENTE') throw new Error('Acesso permitido somente para gerentes.');
    } catch (erro) {
        alert(erro.message || 'Sua sessão não permite acessar os pedidos.');
        window.location.href = '../../login/login.html';
        throw erro;
    }
}

async function carregarPedidos() {
    el('corpoTabelaPedidos').innerHTML = '<tr><td colspan="6" class="estado-tabela">Carregando pedidos...</td></tr>';
    try {
        const dados = await requisicaoJson(`${API}/pedido-admin`);
        estado.pedidos = Array.isArray(dados.pedidos) ? dados.pedidos : [];
        renderizarTabela();
        mostrarMensagem('mensagemLista', estado.pedidos.length ? '' : 'Nenhum pedido encontrado.');
    } catch (erro) {
        el('corpoTabelaPedidos').innerHTML = `<tr><td colspan="6" class="estado-tabela">${escapeHtml(erro.message)}</td></tr>`;
        mostrarMensagem('mensagemLista', erro.message, 'erro');
    }
}

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caractere]);
}

function renderizarTabela() {
    const pesquisa = el('pesquisaPedido').value.trim().toLocaleLowerCase('pt-BR');
    const filtro = el('filtroStatus').value;
    const pedidos = estado.pedidos.filter(p => {
        const texto = `${p.id_pedido} ${p.cliente_cpf} ${p.nome_cliente} ${p.status_pedido}`.toLocaleLowerCase('pt-BR');
        return (!pesquisa || texto.includes(pesquisa)) && (!filtro || p.status_pedido === filtro);
    });

    const corpo = el('corpoTabelaPedidos');
    corpo.replaceChildren();
    if (!pedidos.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = 'estado-tabela';
        td.textContent = 'Nenhum pedido corresponde à pesquisa.';
        tr.append(td);
        corpo.append(tr);
        return;
    }

    pedidos.forEach(p => {
        const tr = document.createElement('tr');
        const valores = [
            `#${p.id_pedido}`,
            `${p.nome_cliente || 'Cliente'} (${p.cliente_cpf})`,
            formatarData(p.data_pedido),
            nomeStatus[p.status_pedido] || p.status_pedido,
            formatarMoeda(Number(p.valor_total) + Number(p.valor_frete))
        ];
        valores.forEach((valor, indice) => {
            const td = document.createElement('td');
            if (indice === 3) {
                const selo = document.createElement('span');
                selo.className = `status status--${String(p.status_pedido).toLowerCase()}`;
                selo.textContent = valor;
                td.append(selo);
            } else td.textContent = valor;
            tr.append(td);
        });
        const tdAcao = document.createElement('td');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'botao-abrir';
        botao.textContent = 'Abrir / editar';
        botao.addEventListener('click', () => abrirPedido(p.id_pedido));
        tdAcao.append(botao);
        tr.append(tdAcao);
        corpo.append(tr);
    });
}

async function abrirPedido(id) {
    try {
        const dados = await requisicaoJson(`${API}/pedido-admin/${id}`);
        estado.pedidoSelecionado = dados.pedido;
        preencherEdicao(dados.pedido);
        el('painelEdicao').hidden = false;
        el('painelEdicao').scrollIntoView({ behavior: 'smooth', block: 'start' });
        mostrarMensagem('mensagemEdicao', '');
    } catch (erro) {
        mostrarMensagem('mensagemLista', erro.message, 'erro');
    }
}

function preencherEdicao(p) {
    el('tituloPedido').textContent = `Pedido #${p.id_pedido}`;
    el('subtituloPedido').textContent = `Realizado em ${formatarData(p.data_pedido)}`;
    el('seloStatus').className = `status status--${String(p.status_pedido).toLowerCase()}`;
    el('seloStatus').textContent = nomeStatus[p.status_pedido] || p.status_pedido;
    el('resumoCliente').replaceChildren();
    [
        ['Cliente', p.nome_cliente || '—'],
        ['CPF', p.cliente_cpf || '—'],
        ['Número do pedido', `#${p.id_pedido}`]
    ].forEach(([rotulo, valor]) => {
        const bloco = document.createElement('div');
        const span = document.createElement('span'); span.textContent = rotulo;
        const strong = document.createElement('strong'); strong.textContent = valor;
        bloco.append(span, strong); el('resumoCliente').append(bloco);
    });

    el('statusPedido').value = p.status_pedido;
    const transicoesDisponiveis = {
        CARRINHO: ['CARRINHO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'CANCELADO'],
        AGUARDANDO_PAGAMENTO: ['AGUARDANDO_PAGAMENTO', 'PAGO', 'CANCELADO'],
        PAGO: ['PAGO', 'FINALIZADO', 'CANCELADO'],
        FINALIZADO: ['FINALIZADO', 'CANCELADO'],
        CANCELADO: ['CANCELADO']
    }[p.status_pedido] || [p.status_pedido];
    Array.from(el('statusPedido').options).forEach(opcao => {
        opcao.disabled = !transicoesDisponiveis.includes(opcao.value);
    });
    el('formaPagamento').value = p.forma_pagamento || '';
    el('valorFrete').value = Number(p.valor_frete || 0).toFixed(2);
    el('subtotalPedido').textContent = formatarMoeda(p.valor_total);
    atualizarTotalVisual();

    const endereco = [p.rua, p.numero, p.complemento, p.bairro, p.cidade, p.estado, p.cep, p.referencia]
        .filter(Boolean).join(', ');
    el('enderecoPedido').textContent = endereco || 'Endereço não informado.';

    const corpo = el('corpoItensPedido');
    corpo.replaceChildren();
    (p.itens || []).forEach(item => {
        const tr = document.createElement('tr');
        const qtd = Number(item.quantidade);
        const preco = Number(item.preco_unitario);
        [item.descricao_produto, String(qtd), formatarMoeda(preco), formatarMoeda(qtd * preco)].forEach(texto => {
            const td = document.createElement('td'); td.textContent = texto; tr.append(td);
        });
        corpo.append(tr);
    });
    if (!(p.itens || []).length) {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        td.colSpan = 4; td.textContent = 'Este pedido não possui itens.'; tr.append(td); corpo.append(tr);
    }

    const cancelado = p.status_pedido === 'CANCELADO';
    el('statusPedido').disabled = cancelado;
    el('formaPagamento').disabled = cancelado;
    el('valorFrete').disabled = cancelado;
    el('botaoSalvarPedido').disabled = cancelado;
    if (cancelado) mostrarMensagem('mensagemEdicao', 'Pedidos cancelados são somente para consulta.', 'erro');
}

function atualizarTotalVisual() {
    const subtotalTexto = el('subtotalPedido').textContent;
    const subtotal = Number(subtotalTexto.replace(/[^0-9,]/g, '').replace('.', '').replace(',', '.')) || 0;
    const frete = Number(el('valorFrete').value) || 0;
    el('fretePedido').textContent = formatarMoeda(frete);
    el('totalPedido').textContent = formatarMoeda(subtotal + frete);
}

el('valorFrete').addEventListener('input', atualizarTotalVisual);
el('pesquisaPedido').addEventListener('input', renderizarTabela);
el('filtroStatus').addEventListener('change', renderizarTabela);
el('botaoAtualizarLista').addEventListener('click', carregarPedidos);
el('botaoFecharEdicao').addEventListener('click', () => { el('painelEdicao').hidden = true; estado.pedidoSelecionado = null; });

el('formPedido').addEventListener('submit', async evento => {
    evento.preventDefault();
    const atual = estado.pedidoSelecionado;
    if (!atual) return;

    const botao = el('botaoSalvarPedido');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
        const dados = await requisicaoJson(`${API}/pedido-admin/${atual.id_pedido}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status_pedido: el('statusPedido').value,
                forma_pagamento: el('formaPagamento').value || null,
                valor_frete: Number(el('valorFrete').value)
            })
        });
        mostrarMensagem('mensagemEdicao', dados.mensagem || 'Pedido atualizado com sucesso.', 'sucesso');
        await carregarPedidos();
        await abrirPedido(atual.id_pedido);
    } catch (erro) {
        mostrarMensagem('mensagemEdicao', erro.message, 'erro');
    } finally {
        botao.disabled = false;
        botao.textContent = 'Salvar alterações';
    }
});

(async function inicializar() {
    try {
        await verificarGerente();
        await carregarPedidos();
    } catch (_) { /* redirecionamento realizado na verificação da sessão */ }
})();
