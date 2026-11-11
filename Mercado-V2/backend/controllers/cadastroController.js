
const { pool } = require('../database');

// Validação oficial dos dígitos verificadores do CPF.
function validarCPF(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
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

exports.cadastrarCliente = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            cpf,
            nome,
            dataNascimento,
            endereco,
            email,
            renda,
            senha
        } = req.body;

        const cpfLimpo = String(cpf || '').replace(/\D/g, '');
        const nomeLimpo = String(nome || '').trim();
        const enderecoLimpo = String(endereco || '').trim();
        const emailLimpo = String(email || '').trim().toLowerCase();
        const rendaNumerica = Number(renda);

        // Validação do CPF.
        if (!validarCPF(cpfLimpo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'CPF inválido.'
            });
        }

        // Validação dos demais campos.
        if (nomeLimpo.length < 3 || nomeLimpo.length > 100) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe um nome válido.'
            });
        }

        if (!dataNascimento ||
            !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento) ||
            !Number.isFinite(Date.parse(dataNascimento)) ||
            dataNascimento > new Date().toISOString().slice(0, 10)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Data de nascimento inválida.'
            });
        }

        if (enderecoLimpo.length < 5 || enderecoLimpo.length > 150) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe um endereço válido.'
            });
        }

        if (emailLimpo.length > 100 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'E-mail inválido.'
            });
        }

        if (!Number.isFinite(rendaNumerica) ||
            rendaNumerica <= 0 ||
            rendaNumerica > 99999999.99) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe uma renda válida.'
            });
        }

        if (typeof senha !== 'string' || senha.length < 8) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'A senha deve possuir pelo menos 8 caracteres.'
            });
        }

        await client.query('BEGIN');

        // Verifica se o CPF já pertence a alguém.
        const consultaPessoa = await client.query(`
            SELECT
                p.cpf_pessoa,
                p.email_pessoa,
                p.senha_hash,
                EXISTS (
                    SELECT 1
                    FROM public.cliente c
                    WHERE c.pessoa_cpf_pessoa = p.cpf_pessoa
                ) AS eh_cliente,
                EXISTS (
                    SELECT 1
                    FROM public.funcionario f
                    WHERE f.pessoa_cpf_pessoa = p.cpf_pessoa
                ) AS eh_funcionario
            FROM public.pessoa p
            WHERE p.cpf_pessoa = $1
            FOR UPDATE
        `, [cpfLimpo]);

        const pessoa = consultaPessoa.rows[0];

        if (pessoa) {

            // Impede cadastro duplicado.
            if (pessoa.eh_cliente) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    sucesso: false,
                    mensagem: 'Este CPF já possui cadastro de cliente.'
                });
            }

            // Não transforma pessoas sem classificação em clientes.
            if (!pessoa.eh_funcionario) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    sucesso: false,
                    mensagem: 'CPF já cadastrado. Procure o atendimento do mercado.'
                });
            }

            // O funcionário precisa utilizar o e-mail já cadastrado.
            if (pessoa.email_pessoa.toLowerCase() !== emailLimpo) {
                await client.query('ROLLBACK');

                return res.status(400).json({
                    sucesso: false,
                    mensagem: 'Confira os dados de acesso cadastrados para este CPF.'
                });
            }

            // Não permite substituir a senha de um funcionário.
            if (!pessoa.senha_hash) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    sucesso: false,
                    mensagem: 'Sua conta precisa ter uma senha configurada antes do cadastro como cliente.'
                });
            }

            const verificacaoSenha = await client.query(`
                SELECT crypt($1, senha_hash) = senha_hash AS senha_valida
                FROM public.pessoa
                WHERE cpf_pessoa = $2
            `, [senha, cpfLimpo]);

            if (!verificacaoSenha.rows[0].senha_valida) {
                await client.query('ROLLBACK');

                return res.status(401).json({
                    sucesso: false,
                    mensagem: 'Confira os dados de acesso cadastrados para este CPF.'
                });
            }

            // Funcionário: cria somente o registro de cliente.
            await client.query(`
                INSERT INTO public.cliente (
                    pessoa_cpf_pessoa,
                    renda_cliente,
                    data_cadastro_cliente
                )
                VALUES ($1, $2, CURRENT_DATE)
            `, [cpfLimpo, rendaNumerica]);

        } else {

            // Nova pessoa: cria pessoa e cliente na mesma transação.
            await client.query(`
                INSERT INTO public.pessoa (
                    cpf_pessoa,
                    nome_pessoa,
                    data_nascimento_pessoa,
                    endereco_pessoa,
                    email_pessoa,
                    senha_hash
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    crypt($6, gen_salt('bf', 10))
                )
            `, [
                cpfLimpo,
                nomeLimpo,
                dataNascimento,
                enderecoLimpo,
                emailLimpo,
                senha
            ]);

            await client.query(`
                INSERT INTO public.cliente (
                    pessoa_cpf_pessoa,
                    renda_cliente,
                    data_cadastro_cliente
                )
                VALUES ($1, $2, CURRENT_DATE)
            `, [cpfLimpo, rendaNumerica]);
        }

        await client.query('COMMIT');

        return res.status(201).json({
            sucesso: true,
            mensagem: 'Cadastro realizado com sucesso! Você já pode entrar na sua conta.'
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Erro ao cadastrar cliente:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'CPF ou e-mail já cadastrado.'
            });
        }

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno ao realizar o cadastro.'
        });

    } finally {
        client.release();
    }
};
