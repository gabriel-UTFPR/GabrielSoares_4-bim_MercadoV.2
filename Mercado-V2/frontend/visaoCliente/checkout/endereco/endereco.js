/* =====================================================
   Mercado V.2 - Endereço de entrega

   1) Configurações
   2) Elementos HTML
   3) Utilitários
   4) Carrinho e resumo
   5) Consulta do CEP e cálculo do frete
   6) Eventos do CEP
   8) Envio do endereço
===================================================== */


/* =====================================================
   1) CONFIGURAÇÕES
===================================================== */

const CONFIG = {
    URL_API: 'http://127.0.0.1:3001',

    CEP_ORIGEM: '87310590',

    CHAVE_CARRINHO: 'mercadoV2_carrinho',

    CHAVE_ENDERECO: 'mercadoV2_endereco_checkout',

    CHAVE_FRETE: 'mercadoV2_frete_checkout',

    PAGINA_PAGAMENTO: '../pagamento/pagamento.html',

    PAGINA_LOJA: '../../loja/loja.html'
};


/* =====================================================
   2) ELEMENTOS HTML
===================================================== */

const elementos = {
    form: document.getElementById('formEndereco'),

    cep: document.getElementById('cep'),
    estado: document.getElementById('estado'),
    cidade: document.getElementById('cidade'),
    bairro: document.getElementById('bairro'),
    rua: document.getElementById('rua'),
    numero: document.getElementById('numero'),
    complemento: document.getElementById('complemento'),
    referencia: document.getElementById('referencia'),

    statusCEP: document.getElementById('statusCEP'),
    mensagem: document.getElementById('mensagemEndereco'),

    subtotal: document.getElementById('subtotal'),
    distancia: document.getElementById('distancia'),
    valorFrete: document.getElementById('valorFrete'),
    valorTotal: document.getElementById('valorTotal'),

    botaoContinuar: document.getElementById('botaoContinuar')
};


/* =====================================================
   3) UTILITÁRIOS
===================================================== */

let freteAtual = null;
let ultimoCepConsultado = '';

const formatarMoeda = (valor) => {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

function mostrarMensagem(mensagem) {
    elementos.mensagem.textContent = mensagem;
    elementos.mensagem.hidden = false;
}

function limparMensagem() {
    elementos.mensagem.textContent = '';
    elementos.mensagem.hidden = true;
}

function limparFrete() {
    freteAtual = null;

    elementos.distancia.textContent = 'A calcular';
    elementos.valorFrete.textContent = 'A calcular';

    atualizarTotal();
}


/* =====================================================
   4) CARRINHO E RESUMO
===================================================== */

function lerCarrinho() {
    try {
        const lista = JSON.parse(
            localStorage.getItem(CONFIG.CHAVE_CARRINHO) || '[]'
        );

        if (!Array.isArray(lista)) {
            return [];
        }

        return lista.filter((item) => {
            return item &&
                Number(item.id_produto) > 0 &&
                Number(item.quantidade) > 0;
        });

    } catch (erro) {
        console.error('Erro ao ler carrinho:', erro);
        return [];
    }
}

const CHAVE_SELECIONADOS = 'mercadoV2_selecionados';

const idsSelecionados = new Set(
    JSON.parse(
        localStorage.getItem(CHAVE_SELECIONADOS) || '[]'
    ).map(Number)
);

const carrinho = lerCarrinho().filter((item) =>
    idsSelecionados.has(Number(item.id_produto))
);

function calcularSubtotal() {
    return carrinho.reduce((total, item) => {
        const preco = Number(item.preco) || 0;
        const quantidade = Number(item.quantidade) || 0;

        return total + (preco * quantidade);
    }, 0);
}

const subtotalCompra = calcularSubtotal();

function atualizarTotal() {
    const valorFrete = freteAtual
        ? Number(freteAtual.valorFrete)
        : 0;

    elementos.valorTotal.textContent = formatarMoeda(
        subtotalCompra + valorFrete
    );
}

function renderizarResumo() {
    elementos.subtotal.textContent = formatarMoeda(subtotalCompra);

    atualizarTotal();
}


/* =====================================================
   5) CONSULTA DO CEP E CÁLCULO DO FRETE

   Uma única chamada ao backend (POST /frete/calcular):
   o servidor consulta o CEP, confirma Campo Mourão - PR,
   calcula a rota e devolve endereço, distância, valor do
   frete e um token assinado para a finalização do pedido.
===================================================== */

// Evita que uma resposta antiga sobrescreva uma consulta mais nova
let numeroConsulta = 0;

function preencherEndereco(endereco) {
    elementos.estado.value = endereco.estado || '';
    elementos.cidade.value = endereco.cidade || '';
    elementos.bairro.value = endereco.bairro || '';
    elementos.rua.value = endereco.rua || '';
}

function limparEnderecoPreenchido() {
    elementos.estado.value = '';
    elementos.cidade.value = '';
    elementos.bairro.value = '';
    elementos.rua.value = '';
}

async function consultarFrete(cep, { preencher = true } = {}) {
    const consulta = ++numeroConsulta;

    elementos.statusCEP.textContent = 'Consultando CEP e calculando o frete...';
    elementos.statusCEP.classList.remove('status-erro');
    elementos.distancia.textContent = 'Calculando...';
    elementos.valorFrete.textContent = 'Calculando...';

    try {
        const resposta = await fetch(
            `${CONFIG.URL_API}/frete/calcular`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                credentials: 'include',

                body: JSON.stringify({ cep })
            }
        );

        let dados = null;

        try {
            dados = await resposta.json();
        } catch (erro) {
            dados = null;
        }

        // Resposta de uma consulta antiga: ignorar.
        if (consulta !== numeroConsulta) {
            return false;
        }

        if (!resposta.ok || !dados || !dados.sucesso) {
            throw new Error(
                dados?.mensagem || 'Não foi possível calcular o frete.'
            );
        }

        if (
            !Number.isFinite(Number(dados.distanciaKm)) ||
            !Number.isFinite(Number(dados.valorFrete)) ||
            !dados.freteToken
        ) {
            throw new Error('O servidor retornou um frete incompleto.');
        }

        if (preencher && dados.endereco) {
            preencherEndereco(dados.endereco);
        }

        freteAtual = dados;

        elementos.distancia.textContent =
            `${Number(dados.distanciaKm).toFixed(2)} km`;

        elementos.valorFrete.textContent =
            formatarMoeda(dados.valorFrete);

        atualizarTotal();

        // Avisar quando o endereço foi localizado só pelo bairro/CEP
        elementos.statusCEP.textContent = dados.precisao === 'rua'
            ? 'Endereço preenchido com sucesso!'
            : 'Frete calculado pela região do endereço (valor aproximado).';

        return true;

    } catch (erro) {
        if (consulta !== numeroConsulta) {
            return false;
        }

        console.error('Erro ao calcular frete:', erro);

        limparFrete();

        if (preencher) {
            limparEnderecoPreenchido();
        }

        const mensagem = erro instanceof TypeError
            ? 'Não foi possível conectar ao servidor. Tente novamente.'
            : erro.message;

        elementos.statusCEP.textContent = mensagem;
        elementos.statusCEP.classList.add('status-erro');

        mostrarMensagem(mensagem);

        // Permite tentar o mesmo CEP novamente.
        ultimoCepConsultado = '';

        return false;
    }
}


/* =====================================================
   6) EVENTOS DO CEP
===================================================== */

elementos.cep.addEventListener('input', () => {
    let cep = elementos.cep.value.replace(/\D/g, '');

    if (cep.length > 5) {
        cep = cep.replace(/^(\d{5})(\d)/, '$1-$2');
    }

    elementos.cep.value = cep;

    const cepNumerico = cep.replace(/\D/g, '');

    if (cepNumerico !== ultimoCepConsultado) {
        // Invalida qualquer consulta em andamento e o frete anterior.
        numeroConsulta++;

        limparFrete();
        ultimoCepConsultado = '';

        elementos.numero.value = '';
        elementos.complemento.value = '';
        elementos.referencia.value = '';
    }

    limparMensagem();
});

elementos.cep.addEventListener('blur', async () => {
    const cep = elementos.cep.value.replace(/\D/g, '');

    if (cep.length !== 8) {
        elementos.statusCEP.textContent =
            'Informe um CEP válido com 8 dígitos.';

        limparFrete();
        return;
    }

    if (cep === ultimoCepConsultado) {
        return;
    }

    ultimoCepConsultado = cep;

    await consultarFrete(cep);
});


/* =====================================================
   8) ENVIO DO ENDEREÇO
===================================================== */

elementos.form.addEventListener('submit', (evento) => {
    evento.preventDefault();

    limparMensagem();

    if (carrinho.length === 0) {
        mostrarMensagem('Seu carrinho está vazio.');
        return;
    }

    if (!elementos.form.checkValidity()) {
        elementos.form.reportValidity();
        return;
    }

    if (!freteAtual) {
        mostrarMensagem(
            'Consulte um CEP válido e aguarde o cálculo do frete.'
        );
        return;
    }

    const endereco = {
        cep: elementos.cep.value.replace(/\D/g, ''),
        estado: elementos.estado.value.trim(),
        cidade: elementos.cidade.value.trim(),
        bairro: elementos.bairro.value.trim(),
        rua: elementos.rua.value.trim(),
        numero: elementos.numero.value.trim(),
        complemento: elementos.complemento.value.trim(),
        referencia: elementos.referencia.value.trim()
    };

    // O CEP do formulário precisa ser o mesmo do frete calculado.
    if (endereco.cep !== String(freteAtual.cepDestino)) {
        mostrarMensagem(
            'O CEP foi alterado. Aguarde o cálculo do frete novamente.'
        );
        return;
    }

    // freteToken é a assinatura do servidor usada na finalização.
    const frete = {
        cepOrigem: freteAtual.cepOrigem,
        cepDestino: freteAtual.cepDestino,
        distanciaKm: freteAtual.distanciaKm,
        valorFrete: freteAtual.valorFrete,
        precisao: freteAtual.precisao,
        freteToken: freteAtual.freteToken
    };

    try {
        sessionStorage.setItem(
            CONFIG.CHAVE_ENDERECO,
            JSON.stringify(endereco)
        );

        sessionStorage.setItem(
            CONFIG.CHAVE_FRETE,
            JSON.stringify(frete)
        );

        window.location.href = CONFIG.PAGINA_PAGAMENTO;

    } catch (erro) {
        console.error('Erro ao salvar endereço:', erro);

        mostrarMensagem(
            'Não foi possível salvar os dados. Tente novamente.'
        );
    }
});


/* =====================================================
   8.1) CARREGAR ÚLTIMO ENDEREÇO
===================================================== */

async function carregarUltimoEndereco() {
    try {
        const resposta = await fetch(
            `${CONFIG.URL_API}/endereco-pedido/ultimo`,
            {
                method: 'GET',
                credentials: 'include'
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || 'Não foi possível carregar o endereço.'
            );
        }

        // Nenhum endereço anterior encontrado
        if (!dados.endereco) {
            return;
        }

        const endereco = dados.endereco;

        // Preencher os campos com os dados do PostgreSQL
        elementos.cep.value = endereco.cep.replace(
            /^(\d{5})(\d{3})$/,
            '$1-$2'
        );

        elementos.estado.value = endereco.estado || '';
        elementos.cidade.value = endereco.cidade || '';
        elementos.bairro.value = endereco.bairro || '';
        elementos.rua.value = endereco.rua || '';
        elementos.numero.value = endereco.numero || '';
        elementos.complemento.value = endereco.complemento || '';
        elementos.referencia.value = endereco.referencia || '';

        // Evitar consultar novamente o mesmo CEP
        const cepNumerico = endereco.cep.replace(/\D/g, '');
        ultimoCepConsultado = cepNumerico;

        elementos.statusCEP.textContent =
            'Endereço anterior carregado com sucesso!';

        // Calcular o frete para o endereço carregado
        // (sem sobrescrever os campos vindos do último pedido)
        const calculou = await consultarFrete(cepNumerico, { preencher: false });

        if (!calculou) {
            // Mantém a mensagem de erro e permite nova tentativa pelo CEP.
            ultimoCepConsultado = '';
        }

    } catch (erro) {
        console.error('Erro ao carregar endereço anterior:', erro);

        mostrarMensagem(
            erro.message || 'Não foi possível carregar o endereço anterior.'
        );
    }
}


/* =====================================================
   9) INICIALIZAÇÃO
===================================================== */


async function inicializar() {
    renderizarResumo();

    if (carrinho.length === 0) {
        mostrarMensagem(
            'Seu carrinho está vazio. Volte à loja para adicionar produtos.'
        );

        elementos.botaoContinuar.disabled = true;
        return;
    }

    await carregarUltimoEndereco();
}

inicializar();