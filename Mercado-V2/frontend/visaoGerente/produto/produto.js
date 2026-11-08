const URL_API = 'http://localhost:3001';
const SILHUETA_URL = `${URL_API}/imagens/silhueta.jpg`;

let oQueEstaFazendo = '';
let produto = null;
bloquearAtributos(true);

async function inicializar() {
    await carregarCategoria();
    await carregarFornecedor();
    await carregarUnidadesMedida();
    await listar();
}

async function carregarCategoria() {
    const select = document.getElementById("selectId_categoria");
    try {
        const resposta = await fetch(`${URL_API}/categoria/listar`);
        const data = await resposta.json();
        if (data.sucesso) {
            select.innerHTML = '<option value="">-- Selecione uma categoria --</option>';
            data.categorias.forEach(um => {
                select.innerHTML += `<option value="${um.id_categoria}">${um.id_categoria} - ${um.nome_categoria}</option>`;
            });
        }
    } catch (erro) {
        select.innerHTML = '<option value="">Erro ao carregar categorias</option>';
    }
}

async function carregarUnidadesMedida() {
    const select = document.getElementById("selectId_unidade_medida");
    try {
        const resposta = await fetch(`${URL_API}/unidade_medida/listar`);
        const data = await resposta.json();
        if (data.sucesso) {
            select.innerHTML = '<option value="">-- Selecione uma Unidade --</option>';
            data.unidades.forEach(um => {
                select.innerHTML += `<option value="${um.id_unidade_medida}">${um.id_unidade_medida} - ${um.nome_unidade_medida}</option>`;
            });
        }
    } catch (erro) {
        select.innerHTML = '<option value="">Erro ao carregar unidades</option>';
    }
}

async function carregarFornecedor() {
    const select = document.getElementById("selectId_Fornecedor");
    try {
        const resposta = await fetch(`${URL_API}/fornecedor/listar`);
        const data = await resposta.json();
        if (data.sucesso) {
            select.innerHTML = '<option value="">-- Selecione um fornecedor --</option>';
            data.fornecedores.forEach(um => {
                select.innerHTML += `<option value="${um.id_fornecedor}">${um.id_fornecedor} - ${um.nome_fornecedor}</option>`;
            });
        }
    } catch (erro) {
        select.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
    }
}

function carregarImagem(id) {
    const img = document.getElementById('imgProduto');
    if (!id) {
        img.src = SILHUETA_URL;
        return;
    }
    img.src = `${URL_API}/imagens/${id}.png?t=${new Date().getTime()}`;
    img.onerror = () => { img.src = SILHUETA_URL; };
}

function acionarUpload() {
    if (oQueEstaFazendo !== 'inserindo' && oQueEstaFazendo !== 'alterando') {
        mostrarAviso("Clique em Inserir ou Alterar primeiro para poder escolher uma imagem.");
        return;
    }
    document.getElementById('inputImagem').click();
}

function previewImagem() {
    const inputFiles = document.getElementById('inputImagem').files;
    if (inputFiles.length > 0) {
        const url = URL.createObjectURL(inputFiles[0]);
        document.getElementById('imgProduto').src = url;
        mostrarAviso("Imagem escolhida! Clique em Salvar para concluir.");
    }
}

async function uploadImagemParaServidor(id) {
    const inputFiles = document.getElementById('inputImagem').files;
    if (inputFiles.length === 0) return;

    const formData = new FormData();
    formData.append('imagem', inputFiles[0]);

    try {
        await fetch(`${URL_API}/produto/upload/${id}`, {
            method: 'POST',
            body: formData
        });
    } catch (erro) {
        console.error("Erro ao enviar imagem:", erro);
    }
}

async function procurePorChavePrimaria(chave) {
    try {
        const resposta = await fetch(`${URL_API}/produto/${chave}`);
        const data = await resposta.json();
        return data.sucesso ? data.produto : null;
    } catch (erro) {
        return null;
    }
}

async function procure() {
    const id_produto = document.getElementById("inputId_produto").value;
    if (isNaN(id_produto) || !Number.isInteger(Number(id_produto)) || id_produto === "") {
        mostrarAviso("Precisa ser um número inteiro");
        return;
    }

    produto = await procurePorChavePrimaria(id_produto);
    oQueEstaFazendo = '';
    
    if (produto) {
        mostrarDadosProduto(produto);
        carregarImagem(id_produto);
        visibilidadeDosBotoes('inline', 'none', 'inline', 'inline', 'none');
        mostrarAviso("Achou no banco, pode alterar ou excluir");
    } else {
        limparAtributos();
        carregarImagem(null);
        visibilidadeDosBotoes('inline', 'inline', 'none', 'none', 'none');
        mostrarAviso("Não achou no banco, pode inserir");
    }
}

function inserir() {
    bloquearAtributos(false);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'inserindo';
    mostrarAviso("INSERINDO - Digite os atributos, escolha a imagem e clique em salvar");
}

function alterar() {
    bloquearAtributos(false);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'alterando';
    mostrarAviso("ALTERANDO - Digite os atributos, mude a imagem (opcional) e clique em salvar");
}

function excluir() {
    bloquearAtributos(true);
    visibilidadeDosBotoes('none', 'none', 'none', 'none', 'inline');
    oQueEstaFazendo = 'excluindo';
    mostrarAviso("EXCLUINDO - Clique em salvar para confirmar a exclusão");
}

async function salvar() {
    let id_produto = document.getElementById("inputId_produto").value;
    const descricao = document.getElementById("inputDescricao").value;
    const id_unidade_medida = document.getElementById("selectId_unidade_medida").value || null;
    const id_categoria = document.getElementById("selectId_categoria").value || null;
    const id_fornecedor = document.getElementById("selectId_Fornecedor").value || null;
    const estoque = parseInt(document.getElementById("inputQuantidade_estoque_produto").value) || 0;
    const preco = parseFloat(document.getElementById("inputPreco_unitario_produto").value) || 0.0;

    const dadosProduto = { id_produto, descricao,id_unidade_medida, id_categoria,id_fornecedor, estoque, preco };

    try {
        if (oQueEstaFazendo === 'inserindo') {
            await fetch(`${URL_API}/produto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosProduto) });
            await uploadImagemParaServidor(id_produto);
            mostrarAviso("Inserido no Banco de Dados com sucesso!");
        } else if (oQueEstaFazendo === 'alterando') {
            await fetch(`${URL_API}/produto/${id_produto}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosProduto) });
            await uploadImagemParaServidor(id_produto);
            mostrarAviso("Alterado no Banco de Dados com sucesso!");
        } else if (oQueEstaFazendo === 'excluindo') {
            await fetch(`${URL_API}/produto/${id_produto}`, { method: 'DELETE' });
            carregarImagem(null);
            mostrarAviso("Excluído do Banco de Dados!");
        }

        visibilidadeDosBotoes('inline', 'none', 'none', 'none', 'none');
        limparAtributos();
        document.getElementById("inputId_produto").value = "";
        listar();
    } catch (erro) {
        mostrarAviso("Erro ao efetuar operação no servidor.");
    }
}

async function listar() {
    try {
        const resposta = await fetch(`${URL_API}/produto/listar`);
        const fornecedor = await fetch(`${URL_API}/fornecedor/listar`);
        const categoria = await fetch(`${URL_API}/categoria/listar`);
        const unidade_medida = await fetch(`${URL_API}/unidade_medida/listar`);
        const data = await resposta.json();
        const datafornecedor = await fornecedor.json();
        const datacategoria = await categoria.json();
        const dataunidade_medida = await unidade_medida.json();


        if (data.sucesso && datafornecedor && datacategoria) {
            let texto = "";
            for (let linha of data.produtos) {
                const categoriaEncontrada = datacategoria.categorias.find(c => c.id_categoria === linha.id_categoria);
                const fornecedorEncontrado = datafornecedor.fornecedores.find(f => f.id_fornecedor === linha.id_fornecedor);
                const unidade_medidaEncontrada = dataunidade_medida.unidades.find(u => u.id_unidade_medida === linha.id_unidade_medida);

                const um = linha.id_categoria ? ` [${linha.id_categoria}-${categoriaEncontrada.nome_categoria}]` : '';
                const dois= linha.id_fornecedor ? ` [${linha.id_fornecedor}-${fornecedorEncontrado.nome_fornecedor}]` : '';
                const tres= linha.id_unidade_medida ? ` [${linha.id_unidade_medida}]` : '';
                texto += `${linha.id_produto} - ${linha.descricao} - ${tres} - ${um} - ${dois} - Estoque: ${linha.estoque} - Preço: R$ ${parseFloat(linha.preco).toFixed(2)}<br>`;
            }
            document.getElementById("outputSaida").innerHTML = texto || "Nenhum produto cadastrado.";
        }
    } catch (erro) {
        document.getElementById("outputSaida").innerHTML = "Servidor offline.";
    }
}

function cancelarOperacao() {
    limparAtributos();
    carregarImagem(null);
    bloquearAtributos(true);
    visibilidadeDosBotoes('inline', 'none', 'none', 'none', 'none');
    mostrarAviso("Cancelou a operação");
}

function mostrarAviso(mensagem) {
    document.getElementById("divAviso").innerHTML = mensagem;
}

function mostrarDadosProduto(p) {
    document.getElementById("inputId_produto").value = p.id_produto;
    document.getElementById("inputDescricao").value = p.descricao;
    document.getElementById("selectId_categoria").value = p.id_categoria || "";
    document.getElementById("selectId_unidade_medida").value = p.id_unidade_medida || "";
    document.getElementById("selectId_Fornecedor").value = p.id_fornecedor || "";
    document.getElementById("inputQuantidade_estoque_produto").value = p.estoque;
    document.getElementById("inputPreco_unitario_produto").value = p.preco;
    bloquearAtributos(true);
}

function limparAtributos() {
    produto = null;
    oQueEstaFazendo = '';
    document.getElementById("inputDescricao").value = "";
    document.getElementById("selectId_categoria").value = "";
    document.getElementById("selectId_Fornecedor").value = "";
    document.getElementById("selectId_unidade_medida").value = "";
    document.getElementById("inputQuantidade_estoque_produto").value = "";
    document.getElementById("inputPreco_unitario_produto").value = "";
    document.getElementById("inputImagem").value = "";
    bloquearAtributos(true);
}

function bloquearAtributos(soLeitura) {
    document.getElementById("inputId_produto").readOnly = !soLeitura;
    document.getElementById("inputDescricao").readOnly = soLeitura;
    document.getElementById("selectId_categoria").disabled = soLeitura;
    document.getElementById("selectId_Fornecedor").disabled = soLeitura;
    document.getElementById("selectId_unidade_medida").disabled = soLeitura;
    document.getElementById("inputQuantidade_estoque_produto").readOnly = soLeitura;
    document.getElementById("inputPreco_unitario_produto").readOnly = soLeitura;
}

function visibilidadeDosBotoes(btP, btI, btA, btE, btS) {
    document.getElementById("btProcure").style.display = btP;
    document.getElementById("btInserir").style.display = btI;
    document.getElementById("btAlterar").style.display = btA;
    document.getElementById("btExcluir").style.display = btE;
    document.getElementById("btSalvar").style.display = btS;
    document.getElementById("btCancelar").style.display = btS;
}