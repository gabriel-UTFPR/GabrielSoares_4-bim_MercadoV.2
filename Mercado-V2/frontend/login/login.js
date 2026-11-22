'use strict';

const URL_API = 'http://127.0.0.1:3001';

// ELEMENTOS DA PÁGINA
const formLogin = document.getElementById('formLogin');
const campoEmail = document.getElementById('email');
const campoSenha = document.getElementById('senha');
const campoCodigo = document.getElementById('codigo');
const areaCodigo = document.getElementById('campoCodigo');
const botaoEntrar = formLogin.querySelector('button[type="submit"]');
const botaoMostrarSenha = document.getElementById('mostrarSenha');
const mensagemLogin = document.getElementById('mensagemLogin');
const linkRecuperar = document.getElementById('linkRecuperar');
const areaCadastro = document.getElementById('areaCadastro');
const separadorCadastro = document.getElementById('separadorCadastro');

// ELEMENTOS DA ESCOLHA DE ACESSO
const areaEscolhaAcesso = document.getElementById('areaEscolhaAcesso');
const botaoGerente = document.getElementById('entrarComoGerente');
const botaoCliente = document.getElementById('entrarComoCliente');
const botaoCadastrarCliente = document.getElementById('cadastrarComoCliente');

let etapaLogin = 'CREDENCIAIS';

function ocultarLinksDeEntrada() {
    linkRecuperar.hidden = true;
    areaCadastro.hidden = true;
    separadorCadastro.hidden = true;
}

// A escolha e seus botões começam ocultos. O backend decide quando aparecem.
areaEscolhaAcesso.hidden = true;
botaoGerente.hidden = true;
botaoCliente.hidden = true;
botaoCadastrarCliente.hidden = true;

// MOSTRAR OU OCULTAR A SENHA
botaoMostrarSenha.addEventListener('click', () => {
    const senhaVisivel = campoSenha.type === 'text';

    campoSenha.type = senhaVisivel ? 'password' : 'text';
    botaoMostrarSenha.textContent = senhaVisivel ? 'Mostrar' : 'Ocultar';
    botaoMostrarSenha.setAttribute(
        'aria-label',
        senhaVisivel ? 'Mostrar senha' : 'Ocultar senha'
    );
});

// ENVIO DO FORMULÁRIO: CREDENCIAIS E, DEPOIS, CÓDIGO DE VERIFICAÇÃO.
formLogin.addEventListener('submit', async (event) => {
    event.preventDefault();

    mensagemLogin.textContent = 'Aguarde...';
    botaoEntrar.disabled = true;

    try {
        let resposta;

        if (etapaLogin === 'CREDENCIAIS') {
            resposta = await fetch(`${URL_API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email: campoEmail.value.trim(),
                    senha: campoSenha.value
                })
            });
        } else {
            resposta = await fetch(`${URL_API}/auth/validar-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    codigo: campoCodigo.value.trim()
                })
            });
        }

        const resultado = await resposta.json();
        mensagemLogin.textContent = resultado.mensagem || '';

        if (!resposta.ok || !resultado.sucesso) {
            return;
        }

        if (etapaLogin === 'CREDENCIAIS') {
            etapaLogin = 'CODIGO';

            campoEmail.closest('.campo').hidden = true;
            campoSenha.closest('.campo').hidden = true;
            campoEmail.required = false;
            campoSenha.required = false;
            botaoMostrarSenha.closest('.campo-senha').hidden = true;

            areaCodigo.hidden = false;
            campoCodigo.required = true;
            campoCodigo.focus();

            ocultarLinksDeEntrada();
            botaoEntrar.textContent = 'Verificar código';
            mensagemLogin.textContent = 'Código enviado! Confira seu e-mail.';
            return;
        }

        if (resultado.proximaEtapa === 'ENTRAR_LOJA') {
            mensagemLogin.textContent = 'E-mail verificado! Entrando na loja...';
            window.location.href = '../visaoCliente/loja/loja.html';
            return;
        }

        if (resultado.proximaEtapa === 'ENTRAR_GERENCIAMENTO') {
            mensagemLogin.textContent = 'E-mail verificado! Entrando no gerenciamento...';
            window.location.href = '../visaoGerente/menu/menu.html';
            return;
        }

        if (resultado.proximaEtapa === 'ESCOLHER_ACESSO') {
            campoEmail.closest('.campo').hidden = true;
            campoSenha.closest('.campo').hidden = true;
            areaCodigo.hidden = true;
            campoCodigo.required = false;
            ocultarLinksDeEntrada();
            botaoEntrar.hidden = true;

            const opcoes = Array.isArray(resultado.opcoes)
                ? resultado.opcoes
                : [];

            // O backend define as opções permitidas para cada tipo de usuário.
            botaoGerente.hidden = !opcoes.includes('GERENTE');
            botaoCliente.hidden = !opcoes.includes('CLIENTE');
            botaoCadastrarCliente.hidden = !opcoes.includes('CADASTRAR_CLIENTE');

            areaEscolhaAcesso.hidden = false;
            mensagemLogin.textContent = 'E-mail verificado! Escolha uma opção para continuar.';
            return;
        }

        mensagemLogin.textContent = resultado.mensagem || 'Não foi possível continuar.';
    } catch (erro) {
        console.error('Erro no login:', erro);
        mensagemLogin.textContent = 'Não foi possível conectar ao servidor.';
    } finally {
        botaoEntrar.disabled = false;
    }
});

// ENVIA A ESCOLHA AO BACKEND. O SERVIDOR CONFERE A PERMISSÃO NOVAMENTE.
async function selecionarAcesso(tipoAcesso) {
    mensagemLogin.textContent = 'Aguarde...';

    botaoGerente.disabled = true;
    botaoCliente.disabled = true;
    botaoCadastrarCliente.disabled = true;

    try {
        const resposta = await fetch(`${URL_API}/auth/escolher-acesso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tipoAcesso })
        });

        const resultado = await resposta.json();
        mensagemLogin.textContent = resultado.mensagem || '';

        if (!resposta.ok || !resultado.sucesso) {
            return;
        }

        if (resultado.proximaEtapa === 'ENTRAR_LOJA') {
            window.location.href = '../visaoCliente/loja/loja.html';
            return;
        }

        if (resultado.proximaEtapa === 'ENTRAR_GERENCIAMENTO') {
            window.location.href = '../visaoGerente/menu/menu.html';
            return;
        }

        if (resultado.proximaEtapa === 'CADASTRAR_CLIENTE') {
            window.location.href = '../cadastro/cadastro.html';
        }
    } catch (erro) {
        console.error('Erro ao selecionar acesso:', erro);
        mensagemLogin.textContent = 'Não foi possível conectar ao servidor.';
    } finally {
        botaoGerente.disabled = false;
        botaoCliente.disabled = false;
        botaoCadastrarCliente.disabled = false;
    }
}

botaoGerente.addEventListener('click', () => selecionarAcesso('GERENTE'));
botaoCliente.addEventListener('click', () => selecionarAcesso('CLIENTE'));
botaoCadastrarCliente.addEventListener('click', () => {
    selecionarAcesso('CADASTRAR_CLIENTE');
});
