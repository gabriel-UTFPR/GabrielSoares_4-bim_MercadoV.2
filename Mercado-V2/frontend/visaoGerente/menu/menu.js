'use strict';

const URL_API = 'http://127.0.0.1:3001';
const PAGINA_LOGIN = '../../login/login.html';
const PAGINA_LOJA = '../../visaoCliente/loja/loja.html';

const elementos = {
    perfil: document.getElementById('perfilMenu'),
    botaoPerfil: document.getElementById('botaoPerfil'),
    nomeUsuario: document.getElementById('nomeUsuario'),
    opcoesPerfil: document.getElementById('opcoesPerfil'),
    botaoTrocarCliente: document.getElementById('botaoTrocarCliente'),
    botaoLogout: document.getElementById('botaoLogout')
};

function obterPrimeiroNome(nomeCompleto) {
    const nome = String(nomeCompleto || '').trim();
    return nome ? nome.split(/\s+/)[0] : 'Minha conta';
}

function fecharMenuPerfil() {
    elementos.opcoesPerfil.hidden = true;
    elementos.botaoPerfil.setAttribute('aria-expanded', 'false');
}

function alternarMenuPerfil() {
    const vaiAbrir = elementos.opcoesPerfil.hidden;
    elementos.opcoesPerfil.hidden = !vaiAbrir;
    elementos.botaoPerfil.setAttribute('aria-expanded', String(vaiAbrir));
}

async function lerResposta(resposta) {
    const texto = await resposta.text();

    try {
        return texto ? JSON.parse(texto) : {};
    } catch {
        throw new Error('O servidor retornou uma resposta inválida. Verifique se o backend está ativo.');
    }
}

async function trocarParaCliente() {
    const botao = elementos.botaoTrocarCliente;
    botao.disabled = true;
    botao.textContent = 'Alterando acesso...';

    try {
        const resposta = await fetch(`${URL_API}/auth/trocar-acesso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tipoAcesso: 'CLIENTE' })
        });

        const resultado = await lerResposta(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || 'Não foi possível trocar o acesso.');
        }

        window.location.replace(PAGINA_LOJA);
    } catch (erro) {
        console.error('Erro ao trocar para cliente:', erro);
        alert(erro.message || 'Não foi possível trocar o acesso.');
        botao.disabled = false;
        botao.textContent = 'Acessar loja como cliente';
    }
}

async function encerrarSessao() {
    const botao = elementos.botaoLogout;
    botao.disabled = true;
    botao.textContent = 'Encerrando sessão...';

    try {
        const resposta = await fetch(`${URL_API}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        const resultado = await lerResposta(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || 'Não foi possível encerrar a sessão.');
        }

        window.location.replace(PAGINA_LOGIN);
    } catch (erro) {
        console.error('Erro ao encerrar sessão:', erro);
        alert(erro.message || 'Não foi possível encerrar a sessão.');
        botao.disabled = false;
        botao.textContent = 'Sair da conta';
    }
}

async function carregarSessao() {
    try {
        const resposta = await fetch(`${URL_API}/auth/minha-sessao`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!resposta.ok) {
            window.location.replace(PAGINA_LOGIN);
            return;
        }

        const resultado = await lerResposta(resposta);
        const sessao = resultado.sessao;

        if (!resultado.sucesso || !sessao || sessao.tipo_acesso !== 'GERENTE') {
            alert('Acesso permitido somente para gerentes.');
            window.location.replace(PAGINA_LOGIN);
            return;
        }

        elementos.nomeUsuario.textContent = obterPrimeiroNome(sessao.nome_pessoa);
        elementos.botaoPerfil.hidden = false;

        // A troca para cliente só aparece se a pessoa também estiver cadastrada como cliente.
        elementos.botaoTrocarCliente.hidden = sessao.eh_cliente !== true;

        console.log('Acesso de gerente autorizado.');
    } catch (erro) {
        console.error('Erro ao verificar acesso:', erro);
        alert(erro.message || 'Não foi possível verificar sua sessão.');
        window.location.replace(PAGINA_LOGIN);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Evita erro silencioso caso alguém remova algum elemento do menu HTML.
    const elementosObrigatorios = [
        elementos.perfil,
        elementos.botaoPerfil,
        elementos.nomeUsuario,
        elementos.opcoesPerfil,
        elementos.botaoTrocarCliente,
        elementos.botaoLogout
    ];

    if (elementosObrigatorios.some((elemento) => !elemento)) {
        console.error('O menu HTML não contém todos os elementos do perfil.');
        return;
    }

    elementos.botaoPerfil.addEventListener('click', alternarMenuPerfil);
    elementos.botaoTrocarCliente.addEventListener('click', trocarParaCliente);
    elementos.botaoLogout.addEventListener('click', encerrarSessao);

    document.addEventListener('click', (evento) => {
        if (!elementos.perfil.contains(evento.target)) {
            fecharMenuPerfil();
        }
    });

    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') fecharMenuPerfil();
    });

    carregarSessao();
});
