const { query } = require('../database');
const path = require('path');

exports.abrirCrudPessoa = (req, res) => {
  const usuario = req.cookies ? req.cookies.usuarioLogado : null;
  if (usuario) {
    res.sendFile(path.join(__dirname, '../../frontend/pessoa/pessoa.html'));
  } else {
    res.redirect('/login');
  }
};


exports.listarPessoas = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        cpf_pessoa,
        nome_pessoa,
        data_nascimento_pessoa,
        endereco_pessoa,
        email_pessoa
      FROM public.pessoa
      ORDER BY cpf_pessoa
    `);

    res.json({ sucesso: true, pessoas: result.rows });

  } catch (error) {
    console.error('Erro ao listar pessoas:', error);

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
};


function validarCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += Number(cpf[i]) * (10 - i);
  }

  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;

  if (resto !== Number(cpf[9])) {
    return false;
  }

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += Number(cpf[i]) * (11 - i);
  }

  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;

  return resto === Number(cpf[10]);
}

function validarDataNascimento(data) {
  if (!data) return false;

  const dataTexto = String(data).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTexto)) {
    return false;
  }

  const [ano, mes, dia] = dataTexto.split('-').map(Number);
  const dataVerificada = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    dataVerificada.getUTCFullYear() !== ano ||
    dataVerificada.getUTCMonth() !== mes - 1 ||
    dataVerificada.getUTCDate() !== dia
  ) {
    return false;
  }

  const hoje = new Date();
  const hojeTexto = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, '0'),
    String(hoje.getDate()).padStart(2, '0')
  ].join('-');

  return dataTexto < hojeTexto;
}

exports.criarPessoa = async (req, res) => {
  try {
    const {
      cpf_pessoa,
      nome_pessoa,
      data_nascimento_pessoa,
      endereco_pessoa,
      email_pessoa,
      senha_pessoa
    } = req.body;

  if (!validarCPF(cpf_pessoa)) {
  return res.status(400).json({
    sucesso: false,
    mensagem: 'CPF inválido. Informe um CPF válido.'
  });
}
if (!validarDataNascimento(data_nascimento_pessoa)) {
  return res.status(400).json({
    sucesso: false,
    mensagem: 'Informe uma data de nascimento válida e anterior à data atual.'
  });
}
    if (!nome_pessoa || !endereco_pessoa || !email_pessoa || !senha_pessoa) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, email, endereço e senha são obrigatórios'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email_pessoa)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Formato de email inválido'
      });
    }

    if (senha_pessoa.length < 8) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'A senha deve possuir pelo menos 8 caracteres'
      });
    }

    const result = await query(
      `INSERT INTO public.pessoa
      (cpf_pessoa, nome_pessoa, data_nascimento_pessoa, endereco_pessoa, email_pessoa, senha_hash)
      VALUES ($1, $2, $3, $4, $5, crypt($6, gen_salt('bf')))
      RETURNING cpf_pessoa, nome_pessoa, data_nascimento_pessoa, endereco_pessoa, email_pessoa`,
      [
        cpf_pessoa,
        nome_pessoa,
        data_nascimento_pessoa,
        endereco_pessoa,
        email_pessoa,
        senha_pessoa
      ]
    );

    res.status(201).json({ sucesso: true, pessoa: result.rows[0] });

  } catch (error) {
    console.error('Erro ao criar pessoa:', error);

    if (error.code === '23505') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF ou email já está em uso'
      });
    }

    if (error.code === '23502') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados obrigatórios não fornecidos'
      });
    }

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
};



exports.obterPessoa = async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/\D/g, '');

    if (!validarCPF(id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido.'
      });
    }

    const result = await query(
      `SELECT
        cpf_pessoa,
        nome_pessoa,
        data_nascimento_pessoa,
        endereco_pessoa,
        email_pessoa
       FROM public.pessoa
       WHERE cpf_pessoa = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pessoa não encontrada'
      });
    }

    res.json({ sucesso: true, pessoa: result.rows[0] });

  } catch (error) {
    console.error('Erro ao obter pessoa:', error);

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
};



exports.atualizarPessoa = async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/\D/g, '');

    if (!validarCPF(id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido.'
      });
    }
    const {
      nome_pessoa,
      data_nascimento_pessoa,
      endereco_pessoa,
      email_pessoa,
      senha_pessoa
    } = req.body;
    
    if (!validarDataNascimento(data_nascimento_pessoa)) {
  return res.status(400).json({
    sucesso: false,
    mensagem: 'Informe uma data de nascimento válida e anterior à data atual.'
  });
}


    if (email_pessoa) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email_pessoa)) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Formato de email inválido'
        });
      }
    }

    if (senha_pessoa && senha_pessoa.length < 8) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'A senha deve possuir pelo menos 8 caracteres'
      });
    }

    const existingPersonResult = await query(
      'SELECT * FROM public.pessoa WHERE cpf_pessoa = $1',
      [id]
    );

    if (existingPersonResult.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pessoa não encontrada'
      });
    }

    const currentPerson = existingPersonResult.rows[0];

    const updatedFields = {
      nome_pessoa: nome_pessoa !== undefined ? nome_pessoa : currentPerson.nome_pessoa,
      data_nascimento_pessoa: data_nascimento_pessoa !== undefined ? data_nascimento_pessoa : currentPerson.data_nascimento_pessoa,
      endereco_pessoa: endereco_pessoa !== undefined ? endereco_pessoa : currentPerson.endereco_pessoa,
      email_pessoa: email_pessoa !== undefined ? email_pessoa : currentPerson.email_pessoa
    };

    const updateResult = await query(
      `UPDATE public.pessoa
       SET nome_pessoa = $1,
           data_nascimento_pessoa = $2,
           endereco_pessoa = $3,
           email_pessoa = $4,
           senha_hash = CASE
             WHEN $5::text IS NOT NULL AND $5::text <> ''
             THEN crypt($5, gen_salt('bf'))
             ELSE senha_hash
           END
       WHERE cpf_pessoa = $6
       RETURNING cpf_pessoa, nome_pessoa, data_nascimento_pessoa, endereco_pessoa, email_pessoa`,
      [
        updatedFields.nome_pessoa,
        updatedFields.data_nascimento_pessoa,
        updatedFields.endereco_pessoa,
        updatedFields.email_pessoa,
        senha_pessoa || null,
        id
      ]
    );

    res.json({
      sucesso: true,
      pessoa: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar pessoa:', error);

    if (error.code === '23505') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF ou email já está em uso por outra pessoa'
      });
    }

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
};


exports.deletarPessoa = async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/\D/g, '');

    if (!validarCPF(id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido.'
      });
    }

    const existingPersonResult = await query(
      'SELECT cpf_pessoa FROM public.pessoa WHERE cpf_pessoa = $1',
      [id]
    );

    if (existingPersonResult.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pessoa não encontrada'
      });
    }

    await query(
      'DELETE FROM public.pessoa WHERE cpf_pessoa = $1',
      [id]
    );

    res.json({
      sucesso: true,
      mensagem: 'Pessoa excluída com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar pessoa:', error);

    if (error.code === '23503') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Não é possível deletar pessoa com dependências associadas'
      });
    }

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
};
