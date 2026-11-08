/* =====================================================
   Mercado V.2 - Lógica da loja (loja.js)

   Organização:
   1) Configurações        6) Quantidade dos produtos
   2) Utilitários          7) Cartão de produto
   3) Comunicação (API)    8) Carrossel
   4) Sessão do usuário    9) Grade e pesquisa
   5) Catálogo            10) Carrinho
                          11) Perfil, eventos e inicialização
   ===================================================== */
'use strict';

/* =====================================================
   1) CONFIGURAÇÕES
   Tudo o que pode mudar fica aqui, em um só lugar.
   ===================================================== */
const CONFIG = {
    // Endereço do backend (o mesmo usado nas telas do gerente)
    URL_API: 'http://localhost:3001',

    // ---- AUTENTICAÇÃO ----
    // O backend atual NÃO possui rota de sessão nem de logout.
    // Enquanto estiverem null, a loja trata todo mundo como visitante.
    // Quando existirem, coloque o caminho aqui (ex.: '/auth/sessao').
    // Formato esperado da resposta de ROTA_SESSAO:
    //   { sucesso: true, usuario: { nome_pessoa: '...', tipo: 'cliente' | 'gerente',
    //                               cadastro_completo: true | false } }
    ROTA_SESSAO: null,
    ROTA_LOGOUT: null,

    // ---- PÁGINAS (caminhos relativos a frontend/visaoCliente/) ----
    PAGINA_MENU_GERENTE: '../visaoGerente/menu/menu.html',   // existe
    PAGINA_LOGIN: '../login/login.html',                     // ainda não existe
    PAGINA_MEUS_PEDIDOS: 'pedidos.html',                     // ainda não existe
    PAGINA_DADOS_CONTA: 'conta.html',                        // ainda não existe
    PAGINA_FINALIZAR: 'finalizar.html',                      // ainda não existe

    // ---- CARRINHO ----
    CHAVE_CARRINHO: 'mercadoV2_carrinho',

    // ---- CARROSSEL ----
    CARROSSEL_MAXIMO_PRODUTOS: 8,
    CARROSSEL_INTERVALO_MS: 5000,

    // ---- INTERFACE ----
    TOAST_DURACAO_MS: 2500,
    UNIDADE_DECIMAL: 'KG'   // única unidade que aceita quantidade decimal
};

/* Estado da página (dados que mudam enquanto o cliente usa a loja) */
const estado = {
    produtos: [],            // catálogo completo (já normalizado)
    unidades: {},            // { 'KG': 'Quilograma', ... }
    idsCarrossel: new Set(), // ids dos produtos que estão no carrossel
    termoPesquisa: '',       // pesquisa aplicada no momento
    carrinho: [],            // itens do carrinho
    sessao: { tipo: 'visitante', nome: '', cadastroCompleto: false },
    carrossel: { posicao: 0, total: 0, timer: null }
};

/* =====================================================
   2) UTILITÁRIOS
   ===================================================== */
const $ = (id) => document.getElementById(id);

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarMoeda = (valor) => formatadorMoeda.format(valor);

/* Cria elementos com textContent (nunca innerHTML), evitando
   que dados vindos do backend sejam interpretados como HTML. */
function criarElemento(tag, opcoes = {}, filhos = []) {
    const elemento = document.createElement(tag);
    if (opcoes.classe) elemento.className = opcoes.classe;
    if (opcoes.texto !== undefined) elemento.textContent = opcoes.texto;
    if (opcoes.atributos) {
        Object.entries(opcoes.atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
    }
    filhos.forEach((filho) => elemento.appendChild(filho));
    return elemento;
}

/* Remove acentos e maiúsculas para a pesquisa ("pao" encontra "Pão") */
function normalizarTexto(texto) {
    return String(texto)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function embaralhar(lista) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

let temporizadorToast = null;
function mostrarMensagem(texto, ehErro = false) {
    const toast = $('toast');
    toast.textContent = texto;
    toast.classList.toggle('toast--erro', ehErro);
    toast.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { toast.hidden = true; }, CONFIG.TOAST_DURACAO_MS);
}

function mostrarAviso(texto, ehInformacao = false, filhoExtra = null) {
    const aviso = $('aviso');
    aviso.replaceChildren(document.createTextNode(texto));
    if (filhoExtra) {
        aviso.appendChild(document.createTextNode(' '));
        aviso.appendChild(filhoExtra);
    }
    aviso.classList.toggle('aviso--info', ehInformacao);
    aviso.hidden = false;
}

function esconderAviso() {
    $('aviso').hidden = true;
}

/* =====================================================
   3) COMUNICAÇÃO COM O BACKEND
   Todas as respostas do projeto seguem { sucesso, ... }
   ===================================================== */
async function buscarJson(caminho, opcoes = {}) {
    const resposta = await fetch(`${CONFIG.URL_API}${caminho}`, opcoes);
    let dados = null;
    try {
        dados = await resposta.json();
    } catch (erro) {
        throw new Error('Resposta inválida do servidor.');
    }
    if (!resposta.ok || dados.sucesso === false) {
        throw new Error(dados.mensagem || `Erro ${resposta.status} ao consultar o servidor.`);
    }
    return dados;
}

/* Transforma o produto vindo do banco em um objeto com tipos corretos.
   O PostgreSQL devolve NUMERIC (preco) como texto, por isso o Number(). */
function normalizarProduto(bruto) {
    return {
        id_produto: Number(bruto.id_produto),
        descricao: String(bruto.descricao ?? ''),
        preco: Number(bruto.preco),
        estoque: Number(bruto.estoque),
        id_categoria: bruto.id_categoria,
        id_fornecedor: bruto.id_fornecedor,
        id_unidade_medida: String(bruto.id_unidade_medida ?? '').trim().toUpperCase()
    };
}

/* Consulta o estoque ATUAL de um produto (GET /produto/:id) */
async function buscarProdutoAtualizado(idProduto) {
    const dados = await buscarJson(`/produto/${encodeURIComponent(idProduto)}`);
    return normalizarProduto(dados.produto);
}

/* As imagens são salvas pelo backend como imagens/<id_produto>.png */
function urlImagemProduto(idProduto) {
    return `${CONFIG.URL_API}/imagens/${encodeURIComponent(idProduto)}.png`;
}
const URL_IMAGEM_PADRAO = `${CONFIG.URL_API}/imagens/silhueta.jpg`;

function criarImagem(idProduto, descricao, classe) {
    const imagem = criarElemento('img', {
        classe,
        atributos: { src: urlImagemProduto(idProduto), alt: descricao, loading: 'lazy' }
    });
    // Se o produto não tem imagem cadastrada, usa a silhueta padrão do projeto
    imagem.addEventListener('error', () => { imagem.src = URL_IMAGEM_PADRAO; }, { once: true });
    return imagem;
}

/* =====================================================
   4) SESSÃO DO USUÁRIO
   ===================================================== */
async function carregarSessao() {
    if (!CONFIG.ROTA_SESSAO) return; // backend ainda sem autenticação: visitante

    try {
        // credentials: 'include' envia o cookie de sessão do backend.
        const dados = await buscarJson(CONFIG.ROTA_SESSAO, { credentials: 'include' });
        const usuario = dados.usuario;
        if (!usuario) return;

        estado.sessao = {
            tipo: usuario.tipo === 'gerente' ? 'gerente' : 'cliente',
            nome: String(usuario.nome_pessoa ?? ''),
            cadastroCompleto: usuario.cadastro_completo === true
        };
    } catch (erro) {
        // Sem sessão válida (ou servidor fora do ar): segue como visitante
        estado.sessao = { tipo: 'visitante', nome: '', cadastroCompleto: false };
    }

    // O gerente não fica na loja
    if (estado.sessao.tipo === 'gerente') {
        window.location.replace(CONFIG.PAGINA_MENU_GERENTE);
    }
}

const estaConectado = () => estado.sessao.tipo === 'cliente';
const cadastroIncompleto = () => estaConectado() && !estado.sessao.cadastroCompleto;

/* =====================================================
   5) CATÁLOGO
   ===================================================== */
async function carregarCatalogo() {
    $('mensagemCarregando').hidden = false;
    $('mensagemCarregando').textContent = 'Carregando produtos...';
    try {
        const [dadosProdutos, dadosUnidades] = await Promise.all([
            buscarJson('/produto/listar'),
            buscarJson('/unidade_medida/listar').catch(() => null) // não é fatal
        ]);

        estado.produtos = dadosProdutos.produtos.map(normalizarProduto);
        estado.unidades = {};
        if (dadosUnidades && Array.isArray(dadosUnidades.unidades)) {
            dadosUnidades.unidades.forEach((u) => {
                estado.unidades[String(u.id_unidade_medida).trim().toUpperCase()] = u.nome_unidade_medida;
            });
        }

        atualizarAvisoCadastro();
        $('mensagemCarregando').hidden = true;
        construirCarrossel();
        renderizarGrade();
        reconciliarCarrinhoComCatalogo();
    } catch (erro) {
        console.error('Erro ao carregar o catálogo:', erro);
        $('mensagemCarregando').textContent = 'Não foi possível carregar os produtos.';
        const botaoTentar = criarElemento('button', {
            classe: 'botao botao--primario', texto: 'Tentar novamente', atributos: { type: 'button' }
        });
        botaoTentar.addEventListener('click', carregarCatalogo);
        mostrarAviso(`Falha ao comunicar com o servidor (${CONFIG.URL_API}). Verifique se o backend está em execução.`, false, botaoTentar);
    }
}

/* =====================================================
   6) QUANTIDADE DOS PRODUTOS
   KG aceita decimais (passo 0,1). As demais unidades: inteiros.
   ===================================================== */
function regrasQuantidade(produto) {
    const decimal = produto.id_unidade_medida === CONFIG.UNIDADE_DECIMAL;
    return { decimal, passo: decimal ? 0.1 : 1, minimo: decimal ? 0.1 : 1 };
}

function arredondarQuantidade(valor, decimal) {
    return decimal ? Math.round(valor * 10) / 10 : Math.round(valor);
}

function formatarQuantidade(valor, decimal) {
    return decimal ? valor.toFixed(1).replace('.', ',') : String(valor);
}

/* Todo produto começa com quantidade 1 (exibida como "1" ou "1,0" para kg),
   mesmo que o menor valor permitido para kg seja 0,1. */
function quantidadeInicial() {
    return 1;
}

/* Converte o texto digitado em um valor válido (nunca <= 0 nem > estoque).
   Devolve { valor, limitadoPeloEstoque } */
function validarQuantidadeDigitada(texto, produto) {
    const { decimal, minimo } = regrasQuantidade(produto);
    let numero = Number(String(texto).trim().replace(',', '.'));
    if (!Number.isFinite(numero)) numero = minimo;

    numero = decimal ? arredondarQuantidade(numero, true) : Math.floor(numero);
    if (numero < minimo) numero = minimo;

    let limitadoPeloEstoque = false;
    if (numero > produto.estoque) {
        numero = produto.estoque;
        limitadoPeloEstoque = true;
    }
    return { valor: numero, limitadoPeloEstoque };
}

/* =====================================================
   7) CARTÃO DE PRODUTO (usado no carrossel e na grade)
   ===================================================== */
function criarCartaoProduto(produto) {
    const disponivel = produto.estoque > 0;
    const regras = regrasQuantidade(produto);
    const sigla = produto.id_unidade_medida;

    const imagem = criarImagem(produto.id_produto, produto.descricao, 'cartao__imagem');

    const preco = criarElemento('p', { classe: 'cartao__preco', texto: formatarMoeda(produto.preco) }, [
        criarElemento('small', { texto: ` / ${sigla}` })
    ]);

    const descricao = criarElemento('p', { classe: 'cartao__descricao', texto: produto.descricao });

    // --- Controle de quantidade: [-] [campo] [+] unidade ---
    const botaoMenos = criarElemento('button', {
        classe: 'quantidade__botao', texto: '−',
        atributos: { type: 'button', 'aria-label': 'Diminuir quantidade' }
    });
    const botaoMais = criarElemento('button', {
        classe: 'quantidade__botao', texto: '+',
        atributos: { type: 'button', 'aria-label': 'Aumentar quantidade' }
    });
    const campo = criarElemento('input', {
        classe: 'quantidade__campo',
        atributos: {
            type: 'text',
            inputmode: regras.decimal ? 'decimal' : 'numeric',
            'aria-label': `Quantidade de ${produto.descricao}`,
            value: formatarQuantidade(quantidadeInicial(produto), regras.decimal)
        }
    });
    const rotuloUnidade = criarElemento('span', {
        classe: 'quantidade__unidade', texto: sigla,
        atributos: { title: estado.unidades[sigla] || sigla }
    });
    const blocoQuantidade = criarElemento('div', { classe: 'quantidade' }, [botaoMenos, campo, botaoMais, rotuloUnidade]);

    const botaoAdicionar = criarElemento('button', {
        classe: 'botao botao--primario botao--largo',
        texto: disponivel ? 'Adicionar ao carrinho' : 'Indisponível',
        atributos: { type: 'button' }
    });

    const filhos = [imagem, preco, descricao];
    if (!disponivel) {
        filhos.push(criarElemento('p', { classe: 'cartao__estoque cartao__estoque--esgotado', texto: 'Produto indisponível no momento' }));
        campo.disabled = botaoMenos.disabled = botaoMais.disabled = botaoAdicionar.disabled = true;
    }
    filhos.push(blocoQuantidade, botaoAdicionar);

    // --- Comportamento ---
    const aplicarValor = (valor) => {
        campo.value = formatarQuantidade(valor, regras.decimal);
    };

    const corrigirCampo = () => {
        const { valor, limitadoPeloEstoque } = validarQuantidadeDigitada(campo.value, produto);
        aplicarValor(valor);
        if (limitadoPeloEstoque) {
            mostrarMensagem(`Estoque disponível: ${formatarQuantidade(produto.estoque, regras.decimal)} ${sigla}.`, true);
        }
        return valor;
    };

    campo.addEventListener('change', corrigirCampo);

    botaoMenos.addEventListener('click', () => {
        const atual = validarQuantidadeDigitada(campo.value, produto).valor;
        const novo = arredondarQuantidade(atual - regras.passo, regras.decimal);
        aplicarValor(Math.max(novo, regras.minimo));
    });

    botaoMais.addEventListener('click', () => {
        const atual = validarQuantidadeDigitada(campo.value, produto).valor;
        const novo = arredondarQuantidade(atual + regras.passo, regras.decimal);
        if (novo > produto.estoque) {
            mostrarMensagem(`Estoque disponível: ${formatarQuantidade(produto.estoque, regras.decimal)} ${sigla}.`, true);
            aplicarValor(Math.min(atual, produto.estoque));
            return;
        }
        aplicarValor(novo);
    });

    botaoAdicionar.addEventListener('click', async () => {
        const quantidade = corrigirCampo();
        botaoAdicionar.disabled = true;
        const adicionou = await adicionarAoCarrinho(produto, quantidade);
        botaoAdicionar.disabled = false;
        if (adicionou) aplicarValor(quantidadeInicial(produto));
    });

    return criarElemento('article', { classe: 'cartao' }, filhos);
}

/* =====================================================
   8) CARROSSEL
   ===================================================== */
function construirCarrossel() {
    pararCarrossel();
    const secao = $('secaoCarrossel');
    const trilha = $('carrosselTrilha');
    trilha.replaceChildren();
    estado.idsCarrossel = new Set();

    // Só entram produtos com estoque. No máximo metade do catálogo,
    // para a grade nunca ficar vazia por causa do carrossel.
    const comEstoque = estado.produtos.filter((p) => p.estoque > 0);
    const quantidade = Math.min(CONFIG.CARROSSEL_MAXIMO_PRODUTOS, Math.floor(comEstoque.length / 2));

    if (quantidade < 1) {
        secao.hidden = true;
        return;
    }

    const escolhidos = embaralhar(comEstoque).slice(0, quantidade);
    escolhidos.forEach((produto) => {
        estado.idsCarrossel.add(produto.id_produto);
        trilha.appendChild(criarElemento('li', {}, [criarCartaoProduto(produto)]));
    });

    estado.carrossel.posicao = 0;
    estado.carrossel.total = escolhidos.length;
    secao.hidden = false;
    atualizarCarrossel();
    iniciarCarrossel();
}

function colunasVisiveisCarrossel() {
    const valor = getComputedStyle(document.documentElement).getPropertyValue('--colunas-carrossel');
    return parseInt(valor, 10) || 4;
}

function atualizarCarrossel() {
    const { total } = estado.carrossel;
    const colunas = colunasVisiveisCarrossel();
    const posicaoMaxima = Math.max(0, total - colunas);
    const precisaNavegar = posicaoMaxima > 0;

    estado.carrossel.posicao = Math.min(estado.carrossel.posicao, posicaoMaxima);
    $('carrosselTrilha').style.transform = `translateX(-${estado.carrossel.posicao * (100 / colunas)}%)`;
    $('carrosselAnterior').hidden = !precisaNavegar;
    $('carrosselProximo').hidden = !precisaNavegar;
}

function moverCarrossel(direcao) {
    const posicaoMaxima = Math.max(0, estado.carrossel.total - colunasVisiveisCarrossel());
    if (posicaoMaxima === 0) return;

    let nova = estado.carrossel.posicao + direcao;
    if (nova > posicaoMaxima) nova = 0;           // passou do fim: volta ao início
    if (nova < 0) nova = posicaoMaxima;           // antes do início: vai ao fim
    estado.carrossel.posicao = nova;
    atualizarCarrossel();
}

function iniciarCarrossel() {
    pararCarrossel();
    if (estado.carrossel.total <= colunasVisiveisCarrossel()) return;
    estado.carrossel.timer = setInterval(() => moverCarrossel(1), CONFIG.CARROSSEL_INTERVALO_MS);
}

function pararCarrossel() {
    clearInterval(estado.carrossel.timer);
    estado.carrossel.timer = null;
}

/* =====================================================
   9) GRADE E PESQUISA
   ===================================================== */
function renderizarGrade() {
    const grade = $('gradeProdutos');
    const info = $('infoPesquisa');
    grade.replaceChildren();

    const termo = normalizarTexto(estado.termoPesquisa);
    const correspondentes = termo
        ? estado.produtos.filter((p) => normalizarTexto(p.descricao).includes(termo))
        : estado.produtos;

    // Regra fundamental: produtos do carrossel NÃO aparecem na grade
    const naGrade = correspondentes.filter((p) => !estado.idsCarrossel.has(p.id_produto));
    const noCarrossel = correspondentes.length - naGrade.length;

    naGrade.forEach((produto) => {
        grade.appendChild(criarElemento('li', {}, [criarCartaoProduto(produto)]));
    });

    // Texto informativo
    if (!termo) {
        info.hidden = true;
        $('tituloCatalogo').textContent = 'Todos os produtos';
    } else {
        $('tituloCatalogo').textContent = 'Resultado da pesquisa';
        let texto = `${naGrade.length} produto(s) encontrado(s) para "${estado.termoPesquisa.trim()}".`;
        if (noCarrossel > 0) {
            texto += ` ${noCarrossel} produto(s) encontrado(s) já aparece(m) em destaque no carrossel acima.`;
        }
        if (naGrade.length === 0 && noCarrossel === 0) {
            texto = `Nenhum produto encontrado para "${estado.termoPesquisa.trim()}".`;
        }
        info.textContent = texto;
        info.hidden = false;
    }
    if (!termo && naGrade.length === 0 && estado.produtos.length === 0) {
        info.textContent = 'Nenhum produto cadastrado.';
        info.hidden = false;
    }
}

function executarPesquisa() {
    estado.termoPesquisa = $('campoPesquisa').value;
    renderizarGrade();
}

function limparPesquisa() {
    $('campoPesquisa').value = '';
    $('botaoLimparPesquisa').hidden = true;
    if (estado.termoPesquisa !== '') {
        estado.termoPesquisa = '';
        renderizarGrade();
    }
    $('campoPesquisa').focus();
}

/* =====================================================
   10) CARRINHO (guardado no localStorage)
   Cada item: { id_produto, descricao, preco, id_unidade_medida, quantidade }
   ===================================================== */
function lerCarrinhoSalvo() {
    try {
        const lista = JSON.parse(localStorage.getItem(CONFIG.CHAVE_CARRINHO) || '[]');
        if (!Array.isArray(lista)) return [];
        return lista
            .filter((i) => i && Number.isFinite(Number(i.id_produto)) && Number(i.quantidade) > 0)
            .map((i) => ({
                id_produto: Number(i.id_produto),
                descricao: String(i.descricao ?? ''),
                preco: Number(i.preco) || 0,
                id_unidade_medida: String(i.id_unidade_medida ?? '').toUpperCase(),
                quantidade: Number(i.quantidade)
            }));
    } catch (erro) {
        return [];
    }
}

function salvarCarrinho() {
    try {
        localStorage.setItem(CONFIG.CHAVE_CARRINHO, JSON.stringify(estado.carrinho));
    } catch (erro) {
        mostrarMensagem('Não foi possível salvar o carrinho neste navegador.', true);
    }
}

/* O cadastro incompleto bloqueia novas adições */
function podeAdicionarAoCarrinho() {
    if (cadastroIncompleto()) {
        mostrarMensagem('Complete os dados da sua conta antes de adicionar novos produtos.', true);
        return false;
    }
    return true;
}

/* Devolve true se o produto foi realmente adicionado */
async function adicionarAoCarrinho(produto, quantidade) {
    if (!podeAdicionarAoCarrinho()) return false;

    // Confere o estoque atual no banco (pode ter mudado desde que a página abriu)
    let atual;
    try {
        atual = await buscarProdutoAtualizado(produto.id_produto);
    } catch (erro) {
        console.error('Erro ao verificar estoque:', erro);
        mostrarMensagem('Não foi possível verificar o estoque. Tente novamente.', true);
        return false;
    }
    Object.assign(produto, atual); // atualiza preço/estoque conhecidos

    const regras = regrasQuantidade(atual);
    const sigla = atual.id_unidade_medida;

    if (atual.estoque <= 0) {
        mostrarMensagem('Este produto está indisponível no momento.', true);
        return false;
    }

    const existente = estado.carrinho.find((i) => i.id_produto === atual.id_produto);
    const jaNoCarrinho = existente ? existente.quantidade : 0;
    const novoTotal = arredondarQuantidade(jaNoCarrinho + quantidade, regras.decimal);

    if (novoTotal > atual.estoque) {
        const restante = Math.max(0, arredondarQuantidade(atual.estoque - jaNoCarrinho, regras.decimal));
        mostrarMensagem(
            `Estoque insuficiente. Disponível: ${formatarQuantidade(atual.estoque, regras.decimal)} ${sigla}; ` +
            `já no carrinho: ${formatarQuantidade(jaNoCarrinho, regras.decimal)} ${sigla}; ` +
            `você ainda pode adicionar ${formatarQuantidade(restante, regras.decimal)} ${sigla}.`, true);
        return false;
    }

    if (existente) {
        existente.quantidade = novoTotal;              // soma em vez de substituir
        existente.preco = atual.preco;
        existente.descricao = atual.descricao;
    } else {
        estado.carrinho.push({
            id_produto: atual.id_produto,
            descricao: atual.descricao,
            preco: atual.preco,
            id_unidade_medida: sigla,
            quantidade: novoTotal
        });
    }

    salvarCarrinho();
    renderizarCarrinho();
    mostrarMensagem('Produto adicionado ao carrinho!');
    return true;
}

async function alterarQuantidadeNoCarrinho(idProduto, direcao) {
    const item = estado.carrinho.find((i) => i.id_produto === idProduto);
    if (!item) return;

    const regras = regrasQuantidade(item);
    const novo = arredondarQuantidade(item.quantidade + direcao * regras.passo, regras.decimal);
    if (novo < regras.minimo) return; // nunca zero: para tirar, use "Remover"

    if (direcao > 0) {
        try {
            const atual = await buscarProdutoAtualizado(idProduto);
            if (novo > atual.estoque) {
                mostrarMensagem(`Estoque disponível: ${formatarQuantidade(atual.estoque, regras.decimal)} ${item.id_unidade_medida}.`, true);
                return;
            }
        } catch (erro) {
            mostrarMensagem('Não foi possível verificar o estoque. Tente novamente.', true);
            return;
        }
    }

    item.quantidade = novo;
    salvarCarrinho();
    renderizarCarrinho();
}

function removerDoCarrinho(idProduto) {
    estado.carrinho = estado.carrinho.filter((i) => i.id_produto !== idProduto);
    salvarCarrinho();
    renderizarCarrinho();
}

/* Depois que o catálogo carrega, atualiza preços e corrige itens
   que ficaram sem estoque ou deixaram de existir. */
function reconciliarCarrinhoComCatalogo() {
    let mudou = false;
    let removidos = 0;

    estado.carrinho = estado.carrinho.filter((item) => {
        const produto = estado.produtos.find((p) => p.id_produto === item.id_produto);
        if (!produto || produto.estoque <= 0) { removidos++; mudou = true; return false; }

        const regras = regrasQuantidade(produto);
        if (item.quantidade > produto.estoque) {
            item.quantidade = produto.estoque;
            mudou = true;
        }
        if (item.preco !== produto.preco || item.descricao !== produto.descricao) {
            item.preco = produto.preco;
            item.descricao = produto.descricao;
            mudou = true;
        }
        item.id_unidade_medida = produto.id_unidade_medida;
        item.quantidade = arredondarQuantidade(item.quantidade, regras.decimal);
        return true;
    });

    if (mudou) {
        salvarCarrinho();
        renderizarCarrinho();
        mostrarMensagem(removidos > 0
            ? 'Alguns itens do carrinho foram ajustados ou removidos por falta de estoque.'
            : 'O carrinho foi atualizado com os preços e estoques atuais.', removidos > 0);
    }
}

function calcularSubtotal(item) {
    return Math.round(item.preco * item.quantidade * 100) / 100;
}

function criarItemCarrinho(item) {
    const regras = regrasQuantidade(item);
    const sigla = item.id_unidade_medida;

    const botaoMenos = criarElemento('button', {
        classe: 'quantidade__botao', texto: '−',
        atributos: { type: 'button', 'data-acao': 'diminuir', 'data-id': item.id_produto, 'aria-label': 'Diminuir quantidade' }
    });
    const botaoMais = criarElemento('button', {
        classe: 'quantidade__botao', texto: '+',
        atributos: { type: 'button', 'data-acao': 'aumentar', 'data-id': item.id_produto, 'aria-label': 'Aumentar quantidade' }
    });
    const valor = criarElemento('span', {
        classe: 'quantidade__unidade',
        texto: `${formatarQuantidade(item.quantidade, regras.decimal)} ${sigla}`
    });
    const controle = criarElemento('div', { classe: 'quantidade' }, [botaoMenos, valor, botaoMais]);

    const botaoRemover = criarElemento('button', {
        classe: 'item-carrinho__remover', texto: 'Remover',
        atributos: { type: 'button', 'data-acao': 'remover', 'data-id': item.id_produto }
    });

    const detalhes = criarElemento('div', {}, [
        criarElemento('p', { classe: 'item-carrinho__nome', texto: item.descricao }),
        criarElemento('p', { classe: 'item-carrinho__preco', texto: `${formatarMoeda(item.preco)} / ${sigla}` }),
        criarElemento('div', { classe: 'item-carrinho__linha' }, [controle, botaoRemover]),
        criarElemento('p', { classe: 'item-carrinho__subtotal', texto: `Subtotal: ${formatarMoeda(calcularSubtotal(item))}` })
    ]);

    return criarElemento('li', { classe: 'item-carrinho' }, [
        criarImagem(item.id_produto, item.descricao, 'item-carrinho__imagem'),
        detalhes
    ]);
}

function renderizarCarrinho() {
    const lista = $('listaCarrinho');
    lista.replaceChildren();
    estado.carrinho.forEach((item) => lista.appendChild(criarItemCarrinho(item)));

    const vazio = estado.carrinho.length === 0;
    $('carrinhoVazio').hidden = !vazio;
    $('rodapeCarrinho').hidden = vazio;

    const total = estado.carrinho.reduce((soma, item) => soma + calcularSubtotal(item), 0);
    $('totalCarrinho').textContent = formatarMoeda(Math.round(total * 100) / 100);

    // O contador mostra quantos produtos diferentes estão no carrinho
    $('contadorCarrinho').textContent = String(estado.carrinho.length);
}

let elementoAntesDoCarrinho = null;
function abrirCarrinho() {
    elementoAntesDoCarrinho = document.activeElement;
    $('painelCarrinho').classList.add('painel-carrinho--aberto');
    $('painelCarrinho').setAttribute('aria-hidden', 'false');
    $('fundoCarrinho').hidden = false;
    document.body.classList.add('sem-rolagem');
    $('botaoFecharCarrinho').focus();
}

function fecharCarrinho() {
    $('painelCarrinho').classList.remove('painel-carrinho--aberto');
    $('painelCarrinho').setAttribute('aria-hidden', 'true');
    $('fundoCarrinho').hidden = true;
    document.body.classList.remove('sem-rolagem');
    if (elementoAntesDoCarrinho) elementoAntesDoCarrinho.focus();
}

const carrinhoEstaAberto = () => $('painelCarrinho').classList.contains('painel-carrinho--aberto');

function finalizarCompra() {
    if (estado.carrinho.length === 0) return;
    if (!estaConectado()) {
        mostrarMensagem('Faça login para finalizar a compra. Seu carrinho será mantido.');
        window.location.href = CONFIG.PAGINA_LOGIN;
        return;
    }
    if (cadastroIncompleto()) {
        mostrarMensagem('Complete os dados da sua conta antes de finalizar a compra.', true);
        return;
    }
    window.location.href = CONFIG.PAGINA_FINALIZAR;
}

/* =====================================================
   11) PERFIL, EVENTOS E INICIALIZAÇÃO
   ===================================================== */
function atualizarPerfil() {
    const texto = $('textoPerfil');
    if (estaConectado()) {
        texto.textContent = estado.sessao.nome.split(' ')[0] || 'Minha conta';
    } else {
        texto.textContent = 'Entrar';
    }

    $('linkMeusPedidos').href = CONFIG.PAGINA_MEUS_PEDIDOS;
    $('linkDadosConta').href = CONFIG.PAGINA_DADOS_CONTA;

    atualizarAvisoCadastro();
}

/* Mostra o aviso de cadastro incompleto (ou limpa o aviso, se não houver) */
function atualizarAvisoCadastro() {
    if (cadastroIncompleto()) {
        const link = criarElemento('a', { texto: 'Completar dados da conta', atributos: { href: CONFIG.PAGINA_DADOS_CONTA } });
        mostrarAviso('Seu cadastro está incompleto. Complete os dados da conta antes de adicionar novos produtos.', true, link);
    } else {
        esconderAviso();
    }
}

function alternarMenuPerfil(abrir) {
    const menu = $('menuPerfil');
    const mostrar = abrir ?? menu.hidden;
    menu.hidden = !mostrar;
    $('botaoPerfil').setAttribute('aria-expanded', String(mostrar));
}

async function sairDaConta() {
    if (!CONFIG.ROTA_LOGOUT) {
        mostrarMensagem('A rota de saída ainda não existe no backend.', true);
        return;
    }
    try {
        await buscarJson(CONFIG.ROTA_LOGOUT, { method: 'POST', credentials: 'include' });
        window.location.reload(); // o carrinho continua no localStorage
    } catch (erro) {
        mostrarMensagem('Não foi possível sair da conta. Tente novamente.', true);
    }
}

function configurarEventos() {
    // Pesquisa: só executa ao clicar no botão
    $('botaoPesquisar').addEventListener('click', executarPesquisa);
    $('botaoLimparPesquisa').addEventListener('click', limparPesquisa);
    $('campoPesquisa').addEventListener('input', (e) => {
        $('botaoLimparPesquisa').hidden = e.target.value === '';
    });

    // Carrossel
    $('carrosselAnterior').addEventListener('click', () => { moverCarrossel(-1); iniciarCarrossel(); });
    $('carrosselProximo').addEventListener('click', () => { moverCarrossel(1); iniciarCarrossel(); });
    const areaCarrossel = $('secaoCarrossel');
    areaCarrossel.addEventListener('mouseenter', pararCarrossel);
    areaCarrossel.addEventListener('mouseleave', iniciarCarrossel);
    areaCarrossel.addEventListener('focusin', pararCarrossel);
    areaCarrossel.addEventListener('focusout', iniciarCarrossel);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pararCarrossel(); else iniciarCarrossel();
    });
    window.addEventListener('resize', () => { atualizarCarrossel(); iniciarCarrossel(); });

    // Carrinho
    $('botaoCarrinho').addEventListener('click', abrirCarrinho);
    $('botaoFecharCarrinho').addEventListener('click', fecharCarrinho);
    $('fundoCarrinho').addEventListener('click', fecharCarrinho);
    $('botaoContinuarComprando').addEventListener('click', fecharCarrinho);
    $('botaoFinalizar').addEventListener('click', finalizarCompra);

    // Botões dentro da lista do carrinho (delegação de eventos)
    $('listaCarrinho').addEventListener('click', (e) => {
        const botao = e.target.closest('button[data-acao]');
        if (!botao) return;
        const id = Number(botao.dataset.id);
        if (botao.dataset.acao === 'remover') removerDoCarrinho(id);
        if (botao.dataset.acao === 'aumentar') alterarQuantidadeNoCarrinho(id, 1);
        if (botao.dataset.acao === 'diminuir') alterarQuantidadeNoCarrinho(id, -1);
    });

    // Perfil
    $('botaoPerfil').addEventListener('click', () => {
        if (estaConectado()) {
            alternarMenuPerfil();
        } else {
            window.location.href = CONFIG.PAGINA_LOGIN;
        }
    });
    $('botaoSair').addEventListener('click', sairDaConta);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.perfil')) alternarMenuPerfil(false);
    });

    // Tecla Esc fecha carrinho e menu
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (carrinhoEstaAberto()) fecharCarrinho();
        alternarMenuPerfil(false);
    });

    // Se o carrinho mudar em outra aba, atualiza esta
    window.addEventListener('storage', (e) => {
        if (e.key === CONFIG.CHAVE_CARRINHO) {
            estado.carrinho = lerCarrinhoSalvo();
            renderizarCarrinho();
        }
    });
}

async function inicializar() {
    configurarEventos();
    estado.carrinho = lerCarrinhoSalvo();
    renderizarCarrinho();                       // mostra o carrinho salvo imediatamente

    await carregarSessao();                     // pode redirecionar o gerente
    atualizarPerfil();
    await carregarCatalogo();
}

document.addEventListener('DOMContentLoaded', inicializar);
