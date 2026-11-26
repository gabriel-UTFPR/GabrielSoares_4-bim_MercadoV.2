'use strict';

const URL_API = 'http://127.0.0.1:3001';
const CHAVE_CADASTRO_PENDENTE = 'mercadoV2_cadastro_pendente';

// Elementos do formulário de cadastro.
const formCadastro = document.getElementById('formCadastro');
const campoCPF = document.getElementById('cpf');
const campoNome = document.getElementById('nome');
const campoNascimento = document.getElementById('dataNascimento');
const campoEndereco = document.getElementById('endereco');
const campoEmail = document.getElementById('email');
const campoRenda = document.getElementById('renda');
const campoSenha = document.getElementById('senha');
const campoConfirmarSenha = document.getElementById('confirmarSenha');
const mensagemCadastro = document.getElementById('mensagemCadastro');
const botaoCadastrar = document.getElementById('botaoCadastrar');

// Elementos da etapa de confirmação do e-mail.
const etapaVerificacao = document.getElementById('etapaVerificacao');
const formVerificacao = document.getElementById('formVerificacao');
const campoCodigo = document.getElementById('codigoVerificacao');
const emailConfirmacao = document.getElementById('emailConfirmacao');
const mensagemVerificacao = document.getElementById('mensagemVerificacao');
const botaoConfirmarCadastro = document.getElementById('botaoConfirmarCadastro');
const botaoReenviarCodigo = document.getElementById('botaoReenviarCodigo');
const botaoVoltarCadastro = document.getElementById('botaoVoltarCadastro');

const tituloCadastro = document.getElementById('tituloCadastro');
const subtituloCadastro = document.getElementById('subtituloCadastro');
const separadorCadastro = document.getElementById('separadorCadastro');
const textoLogin = document.getElementById('textoLogin');
const linkVoltarLogin = document.getElementById('linkVoltarLogin');

// Mostrar/ocultar senha e confirmação da senha.
document.querySelectorAll('[data-toggle-password]').forEach((botao) => {
    const campo = document.getElementById(botao.dataset.togglePassword);

    if (!campo) return;

    botao.addEventListener('click', () => {
        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';
        botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        botao.setAttribute('aria-pressed', String(mostrar));
        botao.setAttribute(
            'aria-label',
            mostrar ? 'Ocultar senha' : 'Mostrar senha'
        );
    });
});

let dadosPendentes = null;

function mostrarMensagem(elemento, mensagem, sucesso = false) {
    elemento.textContent = mensagem;
    elemento.classList.toggle('mensagem--sucesso', sucesso);
    elemento.classList.toggle('mensagem--erro', !sucesso);
}

function limparMensagem(elemento) {
    elemento.textContent = '';
    elemento.classList.remove('mensagem--sucesso', 'mensagem--erro');
}

async function lerResposta(resposta) {
    const tipoConteudo = resposta.headers.get('content-type') || '';

    if (tipoConteudo.includes('application/json')) {
        return await resposta.json();
    }

    const texto = await resposta.text();
    throw new Error(
        texto || 'O servidor retornou uma resposta inválida. Verifique se o backend está em execução.'
    );
}

// Formatar CPF enquanto o usuário digita.
campoCPF.addEventListener('input', () => {
    let cpf = campoCPF.value.replace(/\D/g, '').slice(0, 11);
    cpf = cpf.replace(/(\d{3})(\d)/, '$1.$2');
    cpf = cpf.replace(/(\d{3})(\d)/, '$1.$2');
    cpf = cpf.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    campoCPF.value = cpf;
});

function validarCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');

    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    let soma = 0;

    for (let i = 0; i < 9; i++) {
        soma += Number(cpf[i]) * (10 - i);
    }

    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== Number(cpf[9])) return false;

    soma = 0;

    for (let i = 0; i < 10; i++) {
        soma += Number(cpf[i]) * (11 - i);
    }

    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;

    return resto === Number(cpf[10]);
}

function validarNascimento(data) {
    if (!data) return false;

    const nascimento = new Date(`${data}T00:00:00`);
    const hoje = new Date();

    return !Number.isNaN(nascimento.getTime()) && nascimento <= hoje;
}

function mostrarEtapaVerificacao(email) {
    formCadastro.hidden = true;
    etapaVerificacao.hidden = false;
    separadorCadastro.hidden = true;
    textoLogin.hidden = true;
    linkVoltarLogin.hidden = true;

    tituloCadastro.textContent = 'Confirme seu e-mail';
    subtituloCadastro.textContent = 'Falta pouco para concluir seu cadastro.';
    emailConfirmacao.textContent = email;
    limparMensagem(mensagemVerificacao);
    campoCodigo.focus();
}

function mostrarEtapaCadastro() {
    etapaVerificacao.hidden = true;
    formCadastro.hidden = false;
    separadorCadastro.hidden = false;
    textoLogin.hidden = false;
    linkVoltarLogin.hidden = false;

    tituloCadastro.textContent = 'Crie sua conta';
    subtituloCadastro.textContent = 'Preencha seus dados para começar a comprar.';
    limparMensagem(mensagemCadastro);
}

function restaurarEtapaPendente() {
    try {
        const dados = sessionStorage.getItem(CHAVE_CADASTRO_PENDENTE);
        if (!dados) return;

        const recuperados = JSON.parse(dados);
        if (
            recuperados &&
            typeof recuperados.email === 'string' &&
            Number.isFinite(Number(recuperados.renda))
        ) {
            dadosPendentes = {
                email: recuperados.email,
                renda: Number(recuperados.renda)
            };
            mostrarEtapaVerificacao(dadosPendentes.email);
        }
    } catch (erro) {
        console.error('Não foi possível restaurar a etapa de confirmação:', erro);
        sessionStorage.removeItem(CHAVE_CADASTRO_PENDENTE);
    }
}

// Etapa 1: validar os dados e solicitar o código por e-mail.
formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparMensagem(mensagemCadastro);

    if (!validarCPF(campoCPF.value)) {
        mostrarMensagem(mensagemCadastro, 'CPF inválido.');
        campoCPF.focus();
        return;
    }

    if (campoNome.value.trim().length < 3) {
        mostrarMensagem(mensagemCadastro, 'Informe seu nome completo.');
        campoNome.focus();
        return;
    }

    if (!validarNascimento(campoNascimento.value)) {
        mostrarMensagem(mensagemCadastro, 'Data de nascimento inválida.');
        campoNascimento.focus();
        return;
    }

    if (campoEndereco.value.trim().length < 5) {
        mostrarMensagem(mensagemCadastro, 'Informe um endereço válido.');
        campoEndereco.focus();
        return;
    }

    const renda = Number(campoRenda.value);
    if (!Number.isFinite(renda) || renda <= 0) {
        mostrarMensagem(mensagemCadastro, 'A renda deve ser maior que zero.');
        campoRenda.focus();
        return;
    }

    if (campoSenha.value.length < 8) {
        mostrarMensagem(mensagemCadastro, 'A senha deve possuir pelo menos 8 caracteres.');
        campoSenha.focus();
        return;
    }

    if (campoSenha.value !== campoConfirmarSenha.value) {
        mostrarMensagem(mensagemCadastro, 'As senhas não coincidem.');
        campoConfirmarSenha.focus();
        return;
    }

    botaoCadastrar.disabled = true;
    botaoCadastrar.textContent = 'Enviando código...';
    mostrarMensagem(mensagemCadastro, 'Validando seus dados e enviando o código...', true);

    try {
        const resposta = await fetch(`${URL_API}/auth/cadastro`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpf: campoCPF.value,
                nome: campoNome.value.trim(),
                dataNascimento: campoNascimento.value,
                endereco: campoEndereco.value.trim(),
                email: campoEmail.value.trim(),
                renda,
                senha: campoSenha.value
            })
        });

        const resultado = await lerResposta(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || 'Não foi possível iniciar o cadastro.');
        }

        dadosPendentes = {
            email: campoEmail.value.trim(),
            renda
        };

        // Guarda apenas os dados não sensíveis necessários para a etapa seguinte.
        // A senha nunca é armazenada no sessionStorage.
        sessionStorage.setItem(
            CHAVE_CADASTRO_PENDENTE,
            JSON.stringify(dadosPendentes)
        );

        mostrarEtapaVerificacao(dadosPendentes.email);
        mostrarMensagem(mensagemVerificacao, resultado.mensagem, true);

    } catch (erro) {
        mostrarMensagem(mensagemCadastro, erro.message || 'Não foi possível iniciar o cadastro.');
    } finally {
        botaoCadastrar.disabled = false;
        botaoCadastrar.textContent = 'Criar conta';
    }
});

// Etapa 2: confirmar o código. Só então o backend insere em public.cliente.
formVerificacao.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparMensagem(mensagemVerificacao);

    const codigo = campoCodigo.value.replace(/\D/g, '');

    if (!/^\d{6}$/.test(codigo)) {
        mostrarMensagem(mensagemVerificacao, 'Digite o código de 6 dígitos recebido por e-mail.');
        campoCodigo.focus();
        return;
    }

    if (!dadosPendentes || !Number.isFinite(Number(dadosPendentes.renda))) {
        mostrarMensagem(mensagemVerificacao, 'Os dados do cadastro não foram recuperados. Volte ao formulário e tente novamente.');
        return;
    }

    botaoConfirmarCadastro.disabled = true;
    botaoConfirmarCadastro.textContent = 'Confirmando...';

    try {
        const resposta = await fetch(`${URL_API}/auth/validar-cadastro`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codigo,
                renda: dadosPendentes.renda
            })
        });

        const resultado = await lerResposta(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || 'Não foi possível confirmar o cadastro.');
        }

        sessionStorage.removeItem(CHAVE_CADASTRO_PENDENTE);
        dadosPendentes = null;

        mostrarMensagem(mensagemVerificacao, resultado.mensagem, true);
        botaoConfirmarCadastro.hidden = true;
        botaoReenviarCodigo.hidden = true;
        botaoVoltarCadastro.hidden = true;
        campoCodigo.disabled = true;

        window.setTimeout(() => {
            window.location.href = '../login/login.html';
        }, 1800);

    } catch (erro) {
        mostrarMensagem(mensagemVerificacao, erro.message || 'Não foi possível confirmar o cadastro.');
    } finally {
        if (!botaoConfirmarCadastro.hidden) {
            botaoConfirmarCadastro.disabled = false;
            botaoConfirmarCadastro.textContent = 'Confirmar e criar conta';
        }
    }
});

// Solicitar outro código, respeitando o intervalo definido no backend.
botaoReenviarCodigo.addEventListener('click', async () => {
    botaoReenviarCodigo.disabled = true;
    limparMensagem(mensagemVerificacao);
    mostrarMensagem(mensagemVerificacao, 'Solicitando novo código...', true);

    try {
        const resposta = await fetch(`${URL_API}/auth/reenviar-codigo-cadastro`, {
            method: 'POST',
            credentials: 'include'
        });

        const resultado = await lerResposta(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || 'Não foi possível reenviar o código.');
        }

        mostrarMensagem(mensagemVerificacao, resultado.mensagem, true);

    } catch (erro) {
        mostrarMensagem(mensagemVerificacao, erro.message || 'Não foi possível reenviar o código.');
    } finally {
        botaoReenviarCodigo.disabled = false;
    }
});

// Permitir retornar ao formulário sem perder os campos já digitados.
botaoVoltarCadastro.addEventListener('click', () => {
    sessionStorage.removeItem(CHAVE_CADASTRO_PENDENTE);
    dadosPendentes = null;
    campoCodigo.value = '';
    mostrarEtapaCadastro();
});

// Aceitar somente números no campo do código.
campoCodigo.addEventListener('input', () => {
    campoCodigo.value = campoCodigo.value.replace(/\D/g, '').slice(0, 6);
});

restaurarEtapaPendente();
