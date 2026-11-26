const API_BASE_URL = 'http://127.0.0.1:3001';
const campoCPF = document.getElementById('searchId');

campoCPF.addEventListener('input', function () {
    let cpf = this.value.replace(/\D/g, '');

    cpf = cpf.substring(0, 11);

    if (cpf.length > 9) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    } else if (cpf.length > 6) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    } else if (cpf.length > 3) {
        cpf = cpf.replace(/(\d{3})(\d{0,3})/, '$1.$2');
    }

    this.value = cpf;
});
let currentPersonId = null;
let operacao = null;

// Elementos do DOM
const form = document.getElementById('pessoaForm');
const searchId = document.getElementById('searchId');
const btnBuscar = document.getElementById('btnBuscar');
const btnIncluir = document.getElementById('btnIncluir');
const btnAlterar = document.getElementById('btnAlterar');
const btnExcluir = document.getElementById('btnExcluir');
const btnCancelar = document.getElementById('btnCancelar');
const btnSalvar = document.getElementById('btnSalvar');
const pessoasTableBody = document.getElementById('pessoasTableBody');
const messageContainer = document.getElementById('messageContainer');

// Mostrar/ocultar a senha informada no cadastro de pessoas/clientes.
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

function ocultarSenhaFormulario() {
    document.querySelectorAll('[data-toggle-password]').forEach((botao) => {
        const campo = document.getElementById(botao.dataset.togglePassword);
        if (campo) campo.type = 'password';
        botao.textContent = 'Mostrar';
        botao.setAttribute('aria-pressed', 'false');
        botao.setAttribute('aria-label', 'Mostrar senha');
    });
}

// Carregar lista de pessoas e popular menu de cargos ao inicializar
document.addEventListener('DOMContentLoaded', () => {
    carregarPessoas();
    popularCargosSelect();
});

// Event Listeners
btnBuscar.addEventListener('click', buscarPessoa);
btnIncluir.addEventListener('click', incluirPessoa);
btnAlterar.addEventListener('click', alterarPessoa);
btnExcluir.addEventListener('click', excluirPessoa);
btnCancelar.addEventListener('click', cancelarOperacao);
btnSalvar.addEventListener('click', salvarOperacao);

mostrarBotoes(true, false, false, false, false, false);
bloquearCampos(false);

function mostrarMensagem(texto, tipo = 'info') {
    messageContainer.innerHTML = `<div class="message ${tipo}">${texto}</div>`;
    setTimeout(() => {
        messageContainer.innerHTML = '';
    }, 3000);
}

function bloquearCampos(bloquearPrimeiro) {
    const inputs = document.querySelectorAll('input, select, checkbox');
    inputs.forEach((input, index) => {
        if (index === 0) {
            input.disabled = bloquearPrimeiro;
        } else {
            input.disabled = !bloquearPrimeiro;
        }
    });
}

function limparFormulario() {
    form.reset();
    ocultarSenhaFormulario();
    document.getElementById('senha_pessoa').value = '';
    document.getElementById('checkboxFuncionario').checked = false;
    document.getElementById('salario_funcionario').value = '';
    document.getElementById('cargo_id_cargo').value = '';

    document.getElementById('checkboxCliente').checked = false;
    document.getElementById('renda_cliente').value = '';
    document.getElementById('data_cadastro_cliente').value = '';
}

function mostrarBotoes(btBuscar, btIncluir, btAlterar, btExcluir, btSalvar, btCancelar) {
    btnBuscar.style.display = btBuscar ? 'inline-block' : 'none';
    btnIncluir.style.display = btIncluir ? 'inline-block' : 'none';
    btnAlterar.style.display = btAlterar ? 'inline-block' : 'none';
    btnExcluir.style.display = btExcluir ? 'inline-block' : 'none';
    btnSalvar.style.display = btSalvar ? 'inline-block' : 'none';
    btnCancelar.style.display = btCancelar ? 'inline-block' : 'none';
}

function formatarData(dataString) {
    if (!dataString) return '';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function converterDataParaISO(dataString) {
    if (!dataString) return null;
    return new Date(dataString).toISOString();
}

function converterDataParaFormatoYYYYMMDD(isoDateString) {
    if (!isoDateString || typeof isoDateString !== 'string') {
        return '';
    }
    const partes = isoDateString.split('T');
    return partes.length > 0 ? partes[0] : '';
}

async function funcaoEhFuncionario(pessoaId) {
    try {
        const response = await fetch(`${API_BASE_URL}/funcionario/${pessoaId}`);
        const data = await response.json();

        if (response.ok && data.sucesso && data.funcionario) {
            return {
                ehFuncionario: true,
                salario_funcionario: data.funcionario.salario_funcionario,
                cargo_id_cargo: data.funcionario.cargo_id_cargo,
            };
        }
        return { ehFuncionario: false };
    } catch (error) {
        console.error('Erro ao verificar se é funcionario:', error);
        return { ehFuncionario: false };
    }
}

async function funcaoEhCliente(pessoaId) {
    try {
        const response = await fetch(`${API_BASE_URL}/cliente/${pessoaId}`);
        const data = await response.json();

        if (response.ok && (data.sucesso ? data.cliente : data)) {
            const clienteObj = data.cliente || data;
            return {
                ehCliente: true,
                renda_cliente: clienteObj.renda_cliente,
                data_cadastro_cliente: clienteObj.data_cadastro_cliente
            };
        }
        return { ehCliente: false };
    } catch (error) {
        console.error('Erro ao verificar se é cliente:', error);
        return { ehCliente: false };
    }
}

async function buscarPessoa() {
   const id = searchId.value.replace(/\D/g, '');
    if (!id) {
        mostrarMensagem('Digite um CPF para buscar', 'warning');
        return;
    }

    bloquearCampos(false);
    searchId.focus();
    try {
        const response = await fetch(`${API_BASE_URL}/pessoa/${id}`);
        const data = await response.json();

        if (response.ok && data.sucesso) {
            preencherFormulario(data.pessoa);
            mostrarBotoes(true, false, true, true, false, false);
            mostrarMensagem('Pessoa encontrada!', 'success');
        } else {
            limparFormulario();
            searchId.value = id.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            mostrarBotoes(true, true, false, false, false, false);
            mostrarMensagem('Pessoa não encontrada. Você pode incluir uma nova pessoa.', 'info');
            bloquearCampos(false);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('Erro ao buscar pessoa', 'error');
    }
}

async function preencherFormulario(pessoa) {
    ocultarSenhaFormulario();
    document.getElementById('senha_pessoa').value = '';
    currentPersonId = String(pessoa.cpf_pessoa).replace(/\D/g, '');
searchId.value = currentPersonId.replace(
    /(\d{3})(\d{3})(\d{3})(\d{2})/,
    '$1.$2.$3-$4'
);
    document.getElementById('nome_pessoa').value = pessoa.nome_pessoa || '';

    if (pessoa.data_nascimento_pessoa) {
        const data = new Date(pessoa.data_nascimento_pessoa);
        const dataFormatada = converterDataParaFormatoYYYYMMDD(data.toISOString());
        document.getElementById('data_nascimento').value = dataFormatada;
    } else {
        document.getElementById('data_nascimento').value = '';
    }
    document.getElementById('endereco_pessoa').value = pessoa.endereco_pessoa || '';
    document.getElementById('email_pessoa').value = pessoa.email_pessoa || '';

    // Verifica funcionário
    const ehFunc = await funcaoEhFuncionario(currentPersonId);
    if (ehFunc.ehFuncionario) {
        document.getElementById('checkboxFuncionario').checked = true;
        document.getElementById('cargo_id_cargo').value = ehFunc.cargo_id_cargo;
        document.getElementById('salario_funcionario').value = ehFunc.salario_funcionario;
    } else {
        document.getElementById('checkboxFuncionario').checked = false;
        document.getElementById('cargo_id_cargo').value = '';
        document.getElementById('salario_funcionario').value = '';
    }

    // Verifica cliente
    const ehCli = await funcaoEhCliente(currentPersonId);
    if (ehCli.ehCliente) {
        document.getElementById('checkboxCliente').checked = true;
        document.getElementById('renda_cliente').value = ehCli.renda_cliente;
        document.getElementById('data_cadastro_cliente').value = converterDataParaFormatoYYYYMMDD(ehCli.data_cadastro_cliente);
    } else {
        document.getElementById('checkboxCliente').checked = false;
        document.getElementById('renda_cliente').value = '';
        document.getElementById('data_cadastro_cliente').value = '';
    }
}

async function incluirPessoa() {
    mostrarMensagem('Digite os dados!', 'success');
    currentPersonId = searchId.value.replace(/\D/g, '');
    limparFormulario();
    searchId.value = currentPersonId;
    bloquearCampos(true);
    mostrarBotoes(false, false, false, false, true, true);
    document.getElementById('nome_pessoa').focus();
    operacao = 'incluir';
}

async function alterarPessoa() {
    mostrarMensagem('Digite os dados!', 'success');
    bloquearCampos(true);
    mostrarBotoes(false, false, false, false, true, true);
    document.getElementById('nome_pessoa').focus();
    operacao = 'alterar';
}

async function excluirPessoa() {
    mostrarMensagem('Excluindo pessoa...', 'info');
  currentPersonId = searchId.value.replace(/\D/g, '');
    searchId.disabled = true;
    bloquearCampos(false);
    mostrarBotoes(false, false, false, false, true, true);
    operacao = 'excluir';
}

async function salvarOperacao() {
    const formData = new FormData(form);
    const pessoa = {
        cpf_pessoa: searchId.value.replace(/\D/g, ''),
        nome_pessoa: formData.get('nome_pessoa'),
        data_nascimento_pessoa: converterDataParaISO(formData.get('data_nascimento')) || null,
        endereco_pessoa: formData.get('endereco_pessoa'),
        email_pessoa: formData.get('email_pessoa'),
        senha_pessoa: formData.get('senha_pessoa')
    };

    let funcionario = null;
    if (document.getElementById('checkboxFuncionario').checked) {
        funcionario = {
            pessoa_cpf_pessoa: pessoa.cpf_pessoa,
            salario_funcionario: document.getElementById('salario_funcionario').value,
            cargo_id_cargo: parseInt(document.getElementById('cargo_id_cargo').value, 10)
        };
    }
    const caminhoFunc = `${API_BASE_URL}/funcionario/${currentPersonId}`;

    let cliente = null;
    if (document.getElementById('checkboxCliente').checked) {
        cliente = {
            pessoa_cpf_pessoa: pessoa.cpf_pessoa,
            renda_cliente: document.getElementById('renda_cliente').value,
            data_cadastro_cliente: document.getElementById('data_cadastro_cliente').value || null
        };
    }
    const caminhoCliente = `${API_BASE_URL}/cliente/${currentPersonId}`;

    try {
        let respPessoa = null;
        switch (operacao) {
            case 'incluir':
                respPessoa = await fetch(`${API_BASE_URL}/pessoa`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pessoa)
                });
                const dataPessoaInc = await respPessoa.json();

                if (!dataPessoaInc.sucesso) {
                    throw new Error('Erro ao criar pessoa: ' + (dataPessoaInc.mensagem || respPessoa.status));
                }

                if (funcionario) {
                    await fetch(`${API_BASE_URL}/funcionario`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(funcionario)
                    });
                }

                if (cliente) {
                    await fetch(`${API_BASE_URL}/cliente`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(cliente)
                    });
                }

                mostrarMensagem('Pessoa incluída com sucesso!', 'success');
                limparFormulario();
                carregarPessoas();
                break;

            case 'alterar':
                respPessoa = await fetch(`${API_BASE_URL}/pessoa/${currentPersonId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pessoa)
                });
                const dataPessoaAlt = await respPessoa.json();
                if (!dataPessoaAlt.sucesso) {
                    throw new Error('Erro ao alterar pessoa: ' + (dataPessoaAlt.mensagem || respPessoa.status));
                }

                // Trata Cliente
                if (document.getElementById('checkboxCliente').checked) {
                    const respVerifCli = await fetch(caminhoCliente);
                    if (respVerifCli.status === 404) {
                        await fetch(`${API_BASE_URL}/cliente`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(cliente)
                        });
                    } else {
                        await fetch(caminhoCliente, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(cliente)
                        });
                    }
                } else {
                    // Só tenta remover quando a pessoa realmente possui cadastro de cliente.
                    const respVerifCli = await fetch(caminhoCliente);
                    if (respVerifCli.ok) {
                        const respCli = await fetch(caminhoCliente, { method: 'DELETE' });
                        const dataCli = await respCli.json().catch(() => ({}));

                        if (!respCli.ok || dataCli.sucesso === false) {
                            const mensagem = dataCli.mensagem || dataCli.error ||
                                'Não foi possível remover o cadastro de cliente.';
                            document.getElementById('checkboxCliente').checked = true;
                            throw new Error(mensagem);
                        }
                    }
                }

                // Trata Funcionário
                if (document.getElementById('checkboxFuncionario').checked) {
                    const respVerifFunc = await fetch(caminhoFunc);
                    const dataVerifFunc = await respVerifFunc.json().catch(() => ({}));

                    if (respVerifFunc.status === 404 || !dataVerifFunc.sucesso) {
                        await fetch(`${API_BASE_URL}/funcionario`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(funcionario)
                        });
                    } else {
                        await fetch(caminhoFunc, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(funcionario)
                        });
                    }
                } else {
                    const respVerifFunc = await fetch(caminhoFunc);
                    const dataVerifFunc = await respVerifFunc.json().catch(() => ({}));
                    if (respVerifFunc.status === 200 && dataVerifFunc.sucesso) {
                        await fetch(caminhoFunc, { method: 'DELETE' });
                    }
                }

                mostrarMensagem('Pessoa alterada com sucesso!', 'success');
                limparFormulario();
                carregarPessoas();
                break;

            case 'excluir':
                const respCliDel = await fetch(caminhoCliente);
                if (respCliDel.status === 200) {
                    const respostaExcluirCliente = await fetch(caminhoCliente, { method: 'DELETE' });
                    const dadosExcluirCliente = await respostaExcluirCliente.json().catch(() => ({}));

                    if (!respostaExcluirCliente.ok || dadosExcluirCliente.sucesso === false) {
                        throw new Error(
                            dadosExcluirCliente.mensagem || dadosExcluirCliente.error ||
                            'Não é possível excluir esta pessoa porque o cadastro de cliente possui pedidos.'
                        );
                    }
                }

                const respFuncDel = await fetch(caminhoFunc);
                const dataFuncDel = await respFuncDel.json().catch(() => ({}));
                if (respFuncDel.status === 200 && dataFuncDel.sucesso) {
                    await fetch(caminhoFunc, { method: 'DELETE' });
                }

                const respDelPessoa = await fetch(`${API_BASE_URL}/pessoa/${currentPersonId}`, { method: 'DELETE' });
                const dataDelPessoa = await respDelPessoa.json();

                if (!dataDelPessoa.sucesso) {
                    throw new Error('Erro ao excluir pessoa: ' + (dataDelPessoa.mensagem || respDelPessoa.status));
                }

                mostrarMensagem('Pessoa excluída com sucesso!', 'success');
                limparFormulario();
                carregarPessoas();
                break;
        }
 } catch (error) {
    console.error('Erro salvarOperacao:', error);
    mostrarMensagem(error.message || 'Erro ao processar operação', 'error');

    if (operacao === 'incluir') {
        limparFormulario();
        searchId.value = '';
        currentPersonId = null;
    }
} finally {
        mostrarBotoes(true, false, false, false, false, false);
        bloquearCampos(false);
        document.getElementById('searchId').focus();
    }
}

function cancelarOperacao() {
    limparFormulario();
    mostrarBotoes(true, false, false, false, false, false);
    bloquearCampos(false);
    document.getElementById('searchId').focus();
    mostrarMensagem('Operação cancelada', 'info');
}

async function carregarPessoas() {
    try {
        const response = await fetch(`${API_BASE_URL}/pessoa`);
        const data = await response.json();

        if (response.ok && data.sucesso) {
            renderizarTabelaPessoas(data.pessoas);
        } else {
            throw new Error(data.mensagem || 'Erro ao carregar pessoas');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('Erro ao carregar lista de pessoas', 'error');
    }
}

function renderizarTabelaPessoas(pessoas) {
    pessoasTableBody.innerHTML = '';

    pessoas.forEach(pessoa => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <button class="btn-id" onclick="selecionarPessoa(${pessoa.cpf_pessoa})">
                    ${pessoa.cpf_pessoa}
                </button>
            </td>
            <td>${pessoa.nome_pessoa}</td>
            <td>${formatarData(pessoa.data_nascimento_pessoa)}</td>                 
            <td>${pessoa.endereco_pessoa}</td>
            <td>${pessoa.email_pessoa}</td>
        `;
        pessoasTableBody.appendChild(row);
    });
}

async function selecionarPessoa(id) {
    searchId.value = id;
    await buscarPessoa();
}

// Busca os cargos no backend e preenche o select
async function popularCargosSelect() {
    const selectCargo = document.getElementById('cargo_id_cargo');
    selectCargo.innerHTML = '<option value="">Cargo</option>';

    try {
        const response = await fetch(`${API_BASE_URL}/cargo/listar`);
        const data = await response.json();

        if (data.sucesso && Array.isArray(data.cargos)) {
            data.cargos.forEach(cargo => {
                const option = document.createElement('option');
                option.value = cargo.id_cargo;
                option.textContent = cargo.nome_cargo;
                selectCargo.appendChild(option);
            });
        } else {
            console.error('Erro ao listar cargos:', data.mensagem);
        }
    } catch (error) {
        console.error('Falha ao popular o menu de cargos:', error);
        const optionErro = document.createElement('option');
        optionErro.textContent = 'Erro ao carregar cargos';
        optionErro.disabled = true;
        selectCargo.appendChild(optionErro);
    }
}