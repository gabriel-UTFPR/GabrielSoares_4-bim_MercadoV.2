/* =====================================================
   Mercado V.2 - Minha conta
===================================================== */

'use strict';

const URL_API = 'http://127.0.0.1:3001';

const elementos = {
    form: document.getElementById('formConta'),
    cpf: document.getElementById('cpf'),
    nome: document.getElementById('nome'),
    nascimento: document.getElementById('nascimento'),
    email: document.getElementById('email'),
    endereco: document.getElementById('endereco'),
    mensagem: document.getElementById('mensagem'),
    salvar: document.getElementById('botaoSalvar')
};

let dadosSalvos = null;

function mostrarMensagem(texto, tipo) {
    elementos.mensagem.textContent = texto;
    elementos.mensagem.className = `mensagem ${tipo}`;
    elementos.mensagem.hidden = false;
}

function dataParaCampo(valor) {
    if (!valor) return '';
    return String(valor).slice(0, 10);
}

function preencherFormulario(pessoa) {
    elementos.cpf.value = pessoa.cpf_pessoa || '';
    elementos.nome.value = pessoa.nome_pessoa || '';
    elementos.nascimento.value = dataParaCampo(pessoa.data_nascimento_pessoa);
    elementos.email.value = pessoa.email_pessoa || '';
    elementos.endereco.value = pessoa.endereco_pessoa || '';
}

function obterDadosFormulario() {
    return {
        nome_pessoa: elementos.nome.value.trim(),
        data_nascimento_pessoa: elementos.nascimento.value,
        email_pessoa: elementos.email.value.trim(),
        endereco_pessoa: elementos.endereco.value.trim()
    };
}

async function lerResposta(resposta) {
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok || !dados || !dados.sucesso) {
        throw new Error(
            dados?.mensagem ||
            (resposta.status === 401
                ? 'Sua sessão expirou. Entre novamente para acessar sua conta.'
                : 'Não foi possível concluir a solicitação.')
        );
    }

    return dados;
}

async function carregarDados() {
    elementos.salvar.disabled = true;

    try {
        const resposta = await fetch(`${URL_API}/cliente-area/dados`, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' }
        });

        const dados = await lerResposta(resposta);

        preencherFormulario(dados.pessoa);
        dadosSalvos = obterDadosFormulario();
        elementos.salvar.disabled = false;
        elementos.mensagem.hidden = true;

    } catch (erro) {
        console.error('Erro ao carregar dados da conta:', erro);
        mostrarMensagem(erro.message, 'erro');

        elementos.form.querySelectorAll('input:not(#cpf)').forEach(campo => {
            campo.disabled = true;
        });
    }
}

elementos.form.addEventListener('reset', () => {
    // O reset nativo apagaria os valores recebidos do banco.
    // Recolocamos os últimos dados carregados/salvos.
    window.setTimeout(() => {
        if (dadosSalvos) {
            elementos.nome.value = dadosSalvos.nome_pessoa;
            elementos.nascimento.value = dadosSalvos.data_nascimento_pessoa;
            elementos.email.value = dadosSalvos.email_pessoa;
            elementos.endereco.value = dadosSalvos.endereco_pessoa;
        }

        elementos.mensagem.hidden = true;
    }, 0);
});

elementos.form.addEventListener('submit', async evento => {
    evento.preventDefault();
    elementos.mensagem.hidden = true;

    if (!elementos.form.reportValidity()) return;

    const dadosEnvio = obterDadosFormulario();

    if (!dadosEnvio.nome_pessoa || !dadosEnvio.data_nascimento_pessoa ||
        !dadosEnvio.email_pessoa || !dadosEnvio.endereco_pessoa) {
        mostrarMensagem('Preencha todos os campos.', 'erro');
        return;
    }

    elementos.salvar.disabled = true;
    elementos.salvar.textContent = 'Salvando...';

    try {
        const resposta = await fetch(`${URL_API}/cliente-area/dados`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(dadosEnvio)
        });

        const dados = await lerResposta(resposta);

        preencherFormulario(dados.pessoa);
        dadosSalvos = obterDadosFormulario();
        mostrarMensagem(dados.mensagem || 'Dados atualizados com sucesso.', 'sucesso');

    } catch (erro) {
        console.error('Erro ao salvar dados da conta:', erro);
        mostrarMensagem(erro.message, 'erro');

    } finally {
        elementos.salvar.disabled = false;
        elementos.salvar.textContent = 'Salvar dados';
    }
});

carregarDados();
