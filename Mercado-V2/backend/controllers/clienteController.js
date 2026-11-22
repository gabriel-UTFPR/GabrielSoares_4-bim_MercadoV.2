//import { query } from '../database.js';
const { query } = require('../database');
// Funções do controller

const path = require('path');

exports.abrirCrudCliente = (req, res) => {
 // console.log('clienteController - Rota /abrirCrudCliente - abrir o crudCliente');
  res.sendFile(path.join(__dirname, '../../frontend/cliente/cliente.html'));
}

exports.listarClientes = async (req, res) => {
  try {
    const result = await query('SELECT cli.pessoa_cpf_pessoa, p.nome_pessoa,cli.renda_cliente,cli.data_cadastro_cliente FROM public.cliente cli, public.pessoa p where cli.pessoa_cpf_pessoa = p.cpf_pessoa ORDER BY cli.pessoa_cpf_pessoa ');
   // console.log('Resultado do SELECT:', result.rows);//verifica se está retornando algo
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}


exports.criarCliente = async (req, res) => {
  //  console.log('Criando cliente com dados:', req.body);
  try {
    const { pessoa_cpf_pessoa, renda_cliente, data_cadastro_cliente } = req.body;

    // Validação básica
    if (!renda_cliente|| renda_cliente<=0) {
      return res.status(400).json({
        error: 'O renda do cliente é obrigatório'
      });
    }

    const result = await query(
      'INSERT INTO public.cliente (pessoa_cpf_pessoa, renda_cliente, data_cadastro_cliente) VALUES ($1, $2, $3) RETURNING *',
      [pessoa_cpf_pessoa, renda_cliente, data_cadastro_cliente]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);



    // Verifica se é erro de violação de constraint NOT NULL
    if (error.code === '23502') {
      return res.status(400).json({
        error: 'Dados obrigatórios não fornecidos'
      });
    }

    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

exports.obterCliente = async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/\D/g, '');

    if (!/^\d{11}$/.test(id)) {
      return res.status(400).json({ error: 'Informe um CPF válido.' });
    }

    const result = await query(
      'SELECT * FROM public.cliente WHERE pessoa_cpf_pessoa = $1',
      [id]
    );

    //console.log(result)

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao obter cliente:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

exports.atualizarCliente = async (req, res) => {

  // console.log('Atualizando cliente com dados:', req.body);

  try {
    const id = String(req.params.id || '').replace(/\D/g, '');
    const { renda_cliente, data_cadastro_cliente } = req.body;

    if (!/^\d{11}$/.test(id)) {
      return res.status(400).json({ error: 'Informe um CPF válido.' });
    }

     if (!renda_cliente|| renda_cliente<=0) {
      return res.status(400).json({
        error: 'O renda do cliente é obrigatório'
      });
    }
    // // Verifica se a cliente existe
    // const existingPersonResult = await query(
    //   'SELECT * FROM cliente WHERE pessoa_cpf_pessoa = $1',
    //   [id]
    // );

    // if (existingPersonResult.rows.length === 0) {
    //   return res.status(404).json({ error: 'Cliente não encontrada' });
    // }

    // Constrói a query de atualização dinamicamente para campos não nulos
    // const dadosDoClienteVindosViaRequisicao = existingPersonResult.rows[0];


    const updatedFields = {
      renda_cliente: renda_cliente,
      data_cadastro_cliente: data_cadastro_cliente
    };

    // Atualiza a cliente
    const updateResult = await query(
      'UPDATE public.cliente SET renda_cliente = $1, data_cadastro_cliente = $2 WHERE pessoa_cpf_pessoa = $3 RETURNING *',
      [updatedFields.renda_cliente, updatedFields.data_cadastro_cliente, id]
    );

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);


    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

exports.deletarCliente = async (req, res) => {
  const cpf = String(req.params.id || '').replace(/\D/g, '');

  if (!/^\d{11}$/.test(cpf)) {
    return res.status(400).json({ sucesso: false, mensagem: 'CPF inválido.' });
  }

  try {
    // O DELETE inclui NOT EXISTS para evitar remover o vínculo de cliente
    // enquanto houver qualquer pedido associado.
    const resultado = await query(`
      DELETE FROM public.cliente cli
      WHERE cli.pessoa_cpf_pessoa = $1
        AND NOT EXISTS (
          SELECT 1
          FROM public.pedido p
          WHERE p.cliente_cpf = cli.pessoa_cpf_pessoa
        )
      RETURNING cli.pessoa_cpf_pessoa
    `, [cpf]);

    if (resultado.rows.length > 0) {
      return res.json({ sucesso: true, mensagem: 'Cadastro de cliente removido com sucesso.' });
    }

    const existente = await query(
      'SELECT pessoa_cpf_pessoa FROM public.cliente WHERE pessoa_cpf_pessoa = $1',
      [cpf]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({ sucesso: false, mensagem: 'Cliente não encontrado.' });
    }

    const pedidos = await query(
      'SELECT COUNT(*)::INTEGER AS quantidade FROM public.pedido WHERE cliente_cpf = $1',
      [cpf]
    );

    if (Number(pedidos.rows[0].quantidade) > 0) {
      return res.status(409).json({
        sucesso: false,
        mensagem: `Este cliente possui ${pedidos.rows[0].quantidade} pedido(s) e não pode ser removido do cadastro de clientes.`
      });
    }

    return res.status(409).json({ sucesso: false, mensagem: 'Não foi possível remover o cadastro de cliente.' });
  } catch (error) {
    console.error('Erro ao deletar cliente:', error);

    // A FK pedido_cliente_fk continua sendo a última proteção contra uma
    // exclusão concorrente com a criação de um pedido.
    if (error.code === '23503') {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este cliente possui pedidos associados e não pode ser removido.'
      });
    }

    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao tentar remover o cliente.' });
  }
};
