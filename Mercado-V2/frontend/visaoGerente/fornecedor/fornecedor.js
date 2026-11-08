const URL_API = 'http://localhost:3001';

let oQueEstaFazendo = '';
let fornecedor = null;
const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const regexCNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const regexTelefone = /^\(\d{2}\) \d{4,5}-\d{4}$/;


bloquearAtributos(true);

async function procurePorChavePrimaria(chave) {
    try {
        const resposta = await fetch(`${URL_API}/fornecedor/${chave}`);
        const data = await resposta.json();
        return data.sucesso ? data.fornecedor : null;
    } catch (erro) {
        return null;
    }
}

async function procure() {
    const id_fornecedor = parseInt(document.getElementById("inputId_fornecedor").value);
    if (isNaN(id_fornecedor) ) {
        mostrarAviso("O ID deve ser um número.");
        return;
    }

    document.getElementById("inputId_fornecedor").value = id_fornecedor;
    fornecedor = await procurePorChavePrimaria(id_fornecedor);
    oQueEstaFazendo = '';
    
    if (fornecedor) {
        mostrarDadosFornecedor(fornecedor);
        visibilidadeDosBotoes('inline', 'none', 'inline', 'inline', 'none');
        mostrarAviso("Achou no banco, pode alterar ou excluir");
    } else {
        limparAtributos();
        visibilidadeDosBotoes('inline', 'inline', 'none', 'none', 'none');
        mostrarAviso("Não achou no banco, pode inserir");
    }
}

function inserir() {
    bloquearAtributos(false);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'inserindo';
    mostrarAviso("INSERINDO - Digite o nome da fornecedor e clique em salvar");
}

function alterar() {
    bloquearAtributos(false);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'alterando';
    mostrarAviso("ALTERANDO - Digite o novo nome e clique em salvar");
}

function excluir() {
    bloquearAtributos(true);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'excluindo';
    mostrarAviso("EXCLUINDO - Clique em salvar para confirmar a exclusão");
}

async function salvar() {
    const id_fornecedor = parseInt(document.getElementById("inputId_fornecedor").value);
    const nome_fornecedor = document.getElementById("inputNome_fornecedor").value;
    if (nome_fornecedor=="") {
        alert("Erro no nome");
        document.getElementById("inputNome_fornecedor").focus();
        return;
    }
    const cnpj = document.getElementById("inputCnpj").value;
    if (!regexCNPJ.test(cnpj)) {
        alert("CNPJ inválido!");
        document.getElementById("inputCnpj").focus();
        return;
    }
    const telefone = document.getElementById("inputTelefone").value;
    if (!regexTelefone.test(telefone)) {
        alert("telefone inválido")
        document.getElementById("inputTelefone").focus();
        return;
    }
    const email = document.getElementById("inputEmail").value;
    if (!regexEmail.test(email)) {
       alert("Email inválido!");
       document.getElementById("inputEmail").focus();
       return;
    }
    const endereco = document.getElementById("inputEndereco").value;
    if (endereco=="") {
       alert("endereço inválido!");
       document.getElementById("inputEndereco").focus();
       return;
    }

    const dadosFornecedor = { id_fornecedor, nome_fornecedor,cnpj,telefone,email,endereco};

    try {
        if (oQueEstaFazendo === 'inserindo') {
            const resp = await fetch(`${URL_API}/fornecedor/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosFornecedor) });
            const data = await resp.json();
            if (!data.sucesso) return mostrarAviso(data.mensagem);
            mostrarAviso("Inserido no Banco de Dados com sucesso!");
        } else if (oQueEstaFazendo === 'alterando') {
            const resp = await fetch(`${URL_API}/fornecedor/${id_fornecedor}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosFornecedor) });
            const data = await resp.json();
            if (!data.sucesso) return mostrarAviso(data.mensagem);
            mostrarAviso("Alterado no Banco de Dados com sucesso!");
        } else if (oQueEstaFazendo === 'excluindo') {
            const resposta = await fetch(`${URL_API}/fornecedor/${id_fornecedor}`, { method: 'DELETE' });
            const data = await resposta.json();
            if (!data.sucesso) {
                mostrarAviso(data.mensagem || "Erro ao excluir no servidor.");
                return;
            }
            mostrarAviso("Excluído do Banco de Dados!");
        }

        visibilidadeDosBotoes('inline', 'none', 'none', 'none', 'none');
        limparAtributos();
        document.getElementById("inputId_fornecedor").value = "";
        listar();
    } catch (erro) {
        mostrarAviso("Erro ao efetuar operação no servidor.");
    }
}

async function listar() {
    try {
        const resposta = await fetch(`${URL_API}/fornecedor/listar`);
        const data = await resposta.json();
        
        if (data.sucesso) {
            let texto = "";
            for (let linha of data.fornecedores) {
                texto += `<b>[${linha.id_fornecedor}]</b> - ${linha.nome_fornecedor} - ${linha.cnpj} - ${linha.telefone} - ${linha.email} - ${linha.endereco}<br>`;
            }
            document.getElementById("outputSaida").innerHTML = texto || "Nenhum fornecedor cadastrado.";
        } else {
            document.getElementById("outputSaida").innerHTML = `Erro no banco: ${data.mensagem}`;
        }
    } catch (erro) {
        console.error("Erro ao listar:", erro);
        document.getElementById("outputSaida").innerHTML = "Servidor offline ou erro de conexão (CORS).";
    }
}

function cancelarOperacao() {
    limparAtributos();
    bloquearAtributos(true);
    visibilidadeDosBotoes('inline', 'none', 'none', 'none', 'none');
    mostrarAviso("Cancelou a operação");
}

function mostrarAviso(mensagem) {
    document.getElementById("divAviso").innerHTML = mensagem;
}

function mostrarDadosFornecedor(u) {
    document.getElementById("inputId_fornecedor").value = u.id_fornecedor;
    document.getElementById("inputNome_fornecedor").value = u.nome_fornecedor;
    document.getElementById("inputCnpj").value = u.cnpj;
    document.getElementById("inputTelefone").value = u.telefone;
    document.getElementById("inputEmail").value = u.email;
    document.getElementById("inputEndereco").value = u.endereco;
    bloquearAtributos(true);
}

function limparAtributos() {
    fornecedor = null;
    oQueEstaFazendo = '';
    document.getElementById("inputNome_fornecedor").value = "";
    document.getElementById("inputCnpj").value = "";
    document.getElementById("inputTelefone").value ="";
    document.getElementById("inputEmail").value = "";
    document.getElementById("inputEndereco").value ="";
    bloquearAtributos(true);
}

function bloquearAtributos(soLeitura) {
    document.getElementById("inputId_fornecedor").readOnly = !soLeitura;
    document.getElementById("inputNome_fornecedor").readOnly = soLeitura;
    document.getElementById("inputCnpj").readOnly = soLeitura;
    document.getElementById("inputTelefone").readOnly = soLeitura;
    document.getElementById("inputEmail").readOnly = soLeitura;
    document.getElementById("inputEndereco").readOnly = soLeitura;
}

function visibilidadeDosBotoes(btP, btI, btA, btE, btS) {
    document.getElementById("btProcure").style.display = btP;
    document.getElementById("btInserir").style.display = btI;
    document.getElementById("btAlterar").style.display = btA;
    document.getElementById("btExcluir").style.display = btE;
    document.getElementById("btSalvar").style.display = btS;
    document.getElementById("btCancelar").style.display = btS;
}