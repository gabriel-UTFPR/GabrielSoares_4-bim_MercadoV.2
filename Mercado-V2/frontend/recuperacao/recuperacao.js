'use strict';

const URL_API = 'http://127.0.0.1:3001';

const formSolicitar = document.getElementById('formSolicitar');
const formValidar = document.getElementById('formValidar');
const formRedefinir = document.getElementById('formRedefinir');

const campoEmail = document.getElementById('emailRecuperacao');
const campoCodigo = document.getElementById('codigoRecuperacao');
const campoNovaSenha = document.getElementById('novaSenha');
const campoConfirmarSenha = document.getElementById('confirmarNovaSenha');

const mensagem = document.getElementById('mensagemRecuperacao');
const subtitulo = document.getElementById('subtituloRecuperacao');
const areaVoltarLogin = document.getElementById('areaVoltarLogin');
const linkVoltarLogin = document.querySelector('.voltar-login');
const textoLogin = document.getElementById('textoLoginRecuperacao');
const separadorTextoLogin = document.getElementById('separadorTextoLogin');

function mostrarMensagem(texto, tipo = '') {
    mensagem.textContent = texto;
    mensagem.className = `mensagem ${tipo}`.trim();
}

function definirCarregamento(formulario, carregando, textoCarregando) {
    const botao = formulario.querySelector('button[type="submit"]');

    if (!botao.dataset.textoOriginal) {
        botao.dataset.textoOriginal = botao.textContent;
    }

    botao.disabled = carregando;
    botao.textContent = carregando
        ? textoCarregando
        : botao.dataset.textoOriginal;
}

async function enviarRequisicao(endpoint, dados) {
    const resposta = await fetch(`${URL_API}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dados)
    });

    let resultado;

    try {
        resultado = await resposta.json();
    } catch (erro) {
        throw new Error('O servidor retornou uma resposta inválida.');
    }

    if (!resposta.ok || !resultado.sucesso) {
        throw new Error(resultado.mensagem || 'Não foi possível concluir a operação.');
    }

    return resultado;
}

function configurarMostrarSenha(campo, botao) {
    botao.addEventListener('click', () => {
        const senhaVisivel = campo.type === 'text';
        campo.type = senhaVisivel ? 'password' : 'text';
        botao.textContent = senhaVisivel ? 'Mostrar' : 'Ocultar';
        botao.setAttribute(
            'aria-label',
            senhaVisivel ? 'Mostrar senha' : 'Ocultar senha'
        );
    });
}

configurarMostrarSenha(
    campoNovaSenha,
    document.getElementById('mostrarNovaSenha')
);
configurarMostrarSenha(
    campoConfirmarSenha,
    document.getElementById('mostrarConfirmarSenha')
);

// ETAPA 1: solicitar o código por e-mail.
formSolicitar.addEventListener('submit', async (event) => {
    event.preventDefault();
    mostrarMensagem('Enviando solicitação...');
    definirCarregamento(formSolicitar, true, 'Enviando...');

    try {
        const resultado = await enviarRequisicao('recuperar-senha', {
            email: campoEmail.value.trim()
        });

        formSolicitar.hidden = true;
        formValidar.hidden = false;
        campoCodigo.focus();
        subtitulo.textContent = 'Informe o código de verificação enviado ao seu e-mail.';
        mostrarMensagem(resultado.mensagem, 'sucesso');
    } catch (erro) {
        console.error('Erro ao solicitar recuperação:', erro);
        mostrarMensagem(erro.message, 'erro');
    } finally {
        definirCarregamento(formSolicitar, false);
    }
});

// ETAPA 2: validar o código enviado ao e-mail.
formValidar.addEventListener('submit', async (event) => {
    event.preventDefault();
    mostrarMensagem('Verificando código...');
    definirCarregamento(formValidar, true, 'Verificando...');

    try {
        const resultado = await enviarRequisicao('validar-codigo-recuperacao', {
            codigo: campoCodigo.value.trim()
        });

        formValidar.hidden = true;
        formRedefinir.hidden = false;
        subtitulo.hidden = true;
        campoNovaSenha.focus();
        mostrarMensagem(resultado.mensagem, 'sucesso');
    } catch (erro) {
        console.error('Erro ao validar código:', erro);
        mostrarMensagem(erro.message, 'erro');
    } finally {
        definirCarregamento(formValidar, false);
    }
});

// ETAPA 3: cadastrar a nova senha.
formRedefinir.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (campoNovaSenha.value.length < 8) {
        mostrarMensagem('A senha deve possuir pelo menos 8 caracteres.', 'erro');
        campoNovaSenha.focus();
        return;
    }

    if (campoNovaSenha.value !== campoConfirmarSenha.value) {
        mostrarMensagem('As senhas não coincidem.', 'erro');
        campoConfirmarSenha.focus();
        return;
    }

    mostrarMensagem('Alterando senha...');
    definirCarregamento(formRedefinir, true, 'Alterando...');

    try {
        const resultado = await enviarRequisicao('redefinir-senha', {
            senha: campoNovaSenha.value,
            confirmarSenha: campoConfirmarSenha.value
        });

        formRedefinir.hidden = true;
        subtitulo.hidden = true;
        textoLogin.hidden = true;
        separadorTextoLogin.hidden = true;
        linkVoltarLogin.hidden = true;
        areaVoltarLogin.hidden = false;
        mostrarMensagem(resultado.mensagem, 'sucesso');
    } catch (erro) {
        console.error('Erro ao redefinir senha:', erro);
        mostrarMensagem(erro.message, 'erro');
    } finally {
        definirCarregamento(formRedefinir, false);
    }
});
