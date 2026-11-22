'use strict';

const { pool, query } = require('../database');
const {
    enviarCodigoVerificacao,
    validarCodigoVerificacao
} = require('../services/codigoVerificacaoService');

const opcoesCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
};

const TEMPO_CODIGO_MS = 5 * 60 * 1000;
const INTERVALO_REENVIO_SEGUNDOS = 30;

function definirCookie(res, nome, valor, maxAge) {
    res.cookie(nome, valor, { ...opcoesCookie, maxAge });
}

function limparCookieCadastro(res) {
    res.clearCookie('cadastro_pendente', { path: '/' });
}

// Validação dos dígitos verificadores do CPF.
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

function validarRenda(valor) {
    const renda = Number(valor);

    return Number.isFinite(renda) &&
        renda > 0 &&
        renda <= 99999999.99;
}

function validarDadosCadastro(dados) {
    const cpf = String(dados.cpf || '').replace(/\D/g, '');
    const nome = String(dados.nome || '').trim();
    const dataNascimento = String(dados.dataNascimento || '').trim();
    const endereco = String(dados.endereco || '').trim();
    const email = String(dados.email || '').trim().toLowerCase();
    const senha = dados.senha;

    if (!validarCPF(cpf)) {
        return { erro: 'CPF inválido.' };
    }

    if (nome.length < 3 || nome.length > 100) {
        return { erro: 'Informe um nome válido.' };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
        return { erro: 'Data de nascimento inválida.' };
    }

    const [ano, mes, dia] = dataNascimento.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const dataValida = data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia;

    if (!dataValida || data > new Date(new Date().toISOString().slice(0, 10))) {
        return { erro: 'Data de nascimento inválida.' };
    }

    if (endereco.length < 5 || endereco.length > 150) {
        return { erro: 'Informe um endereço válido.' };
    }

    if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { erro: 'E-mail inválido.' };
    }

    if (!validarRenda(dados.renda)) {
        return { erro: 'Informe uma renda válida.' };
    }

    if (typeof senha !== 'string' || senha.length < 8) {
        return { erro: 'A senha deve possuir pelo menos 8 caracteres.' };
    }

    return {
        dados: {
            cpf,
            nome,
            dataNascimento,
            endereco,
            email,
            renda: Number(dados.renda),
            senha
        }
    };
}

/*
 * Etapa 1: valida os dados, prepara a pessoa (se for nova) e envia o código.
 * O registro em public.cliente ainda NÃO é criado nesta etapa.
 */
exports.cadastrarCliente = async (req, res) => {
    const validacao = validarDadosCadastro(req.body || {});

    if (validacao.erro) {
        return res.status(400).json({
            sucesso: false,
            mensagem: validacao.erro
        });
    }

    const dados = validacao.dados;
    const client = await pool.connect();
    let pessoaCriadaAgora = false;

    try {
        await client.query('BEGIN');

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
                ) AS eh_funcionario,
                EXISTS (
                    SELECT 1
                    FROM public.codigo_verificacao cv
                    WHERE cv.cpf_pessoa = p.cpf_pessoa
                      AND cv.finalidade = 'ATIVACAO'
                ) AS possui_ativacao_anterior
            FROM public.pessoa p
            WHERE p.cpf_pessoa = $1
            FOR UPDATE
        `, [dados.cpf]);

        const pessoa = consultaPessoa.rows[0];

        if (pessoa) {
            if (pessoa.eh_cliente) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    sucesso: false,
                    mensagem: 'Este CPF já possui cadastro de cliente.'
                });
            }

            // Funcionários podem criar o vínculo de cliente após confirmar o e-mail.
            // Uma pessoa sem vínculos também pode retomar um cadastro pendente.
            if (!pessoa.eh_funcionario && !pessoa.possui_ativacao_anterior) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    sucesso: false,
                    mensagem: 'Este CPF já está cadastrado. Procure o atendimento do mercado.'
                });
            }

            if (String(pessoa.email_pessoa).toLowerCase() !== dados.email || !pessoa.senha_hash) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    sucesso: false,
                    mensagem: 'Confira o e-mail cadastrado para este CPF.'
                });
            }

            const verificacaoSenha = await client.query(`
                SELECT crypt($1, senha_hash) = senha_hash AS senha_valida
                FROM public.pessoa
                WHERE cpf_pessoa = $2
            `, [dados.senha, dados.cpf]);

            if (!verificacaoSenha.rows[0]?.senha_valida) {
                await client.query('ROLLBACK');
                return res.status(401).json({
                    sucesso: false,
                    mensagem: 'Confira os dados de acesso cadastrados para este CPF.'
                });
            }

            // Os dados pessoais e a senha do funcionário/pessoa existente são preservados.
        } else {
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
                dados.cpf,
                dados.nome,
                dados.dataNascimento,
                dados.endereco,
                dados.email,
                dados.senha
            ]);

            pessoaCriadaAgora = true;
        }

        await client.query('COMMIT');

        try {
            await enviarCodigoVerificacao(
                dados.cpf,
                dados.email,
                'ATIVACAO'
            );
        } catch (erroEmail) {
            // Se a pessoa foi criada nesta tentativa e o e-mail falhou,
            // remove o cadastro pendente para não reservar CPF/e-mail sem necessidade.
            if (pessoaCriadaAgora) {
                await query(`
                    DELETE FROM public.pessoa p
                    WHERE p.cpf_pessoa = $1
                      AND NOT EXISTS (
                          SELECT 1 FROM public.cliente c
                          WHERE c.pessoa_cpf_pessoa = p.cpf_pessoa
                      )
                      AND NOT EXISTS (
                          SELECT 1 FROM public.funcionario f
                          WHERE f.pessoa_cpf_pessoa = p.cpf_pessoa
                      )
                `, [dados.cpf]);
            }

            throw erroEmail;
        }

        definirCookie(res, 'cadastro_pendente', dados.cpf, TEMPO_CODIGO_MS);

        return res.status(202).json({
            sucesso: true,
            proximaEtapa: 'VERIFICAR_CADASTRO',
            mensagem: `Enviamos um código de confirmação para ${dados.email}. Ele é válido por 5 minutos.`
        });

    } catch (erro) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* transação já encerrada */ }
        }

        console.error('Erro ao iniciar cadastro de cliente:', erro);

        if (erro.code === '23505') {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'CPF ou e-mail já cadastrado.'
            });
        }

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível iniciar o cadastro. Verifique o serviço de e-mail e tente novamente.'
        });

    } finally {
        client.release();
    }
};

/*
 * Etapa 2: valida o código e cria o vínculo em public.cliente na mesma
 * transação que marca o código como utilizado.
 */
exports.confirmarCadastro = async (req, res) => {
    try {
        const cpf = req.cookies?.cadastro_pendente;
        const codigo = String(req.body.codigo || '').trim();
        const renda = Number(req.body.renda);

        if (!cpf) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'A etapa de cadastro expirou. Preencha seus dados novamente.'
            });
        }

        if (!/^\d{6}$/.test(codigo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe o código de 6 dígitos recebido por e-mail.'
            });
        }

        if (!validarRenda(renda)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'A renda informada é inválida. Volte ao formulário e tente novamente.'
            });
        }

        const valido = await validarCodigoVerificacao(
            cpf,
            codigo,
            'ATIVACAO',
            async (client) => {
                const clienteExistente = await client.query(`
                    SELECT 1
                    FROM public.cliente
                    WHERE pessoa_cpf_pessoa = $1
                    FOR UPDATE
                `, [cpf]);

                if (!clienteExistente.rows.length) {
                    await client.query(`
                        INSERT INTO public.cliente (
                            pessoa_cpf_pessoa,
                            renda_cliente,
                            data_cadastro_cliente
                        )
                        VALUES ($1, $2, CURRENT_DATE)
                    `, [cpf, renda]);
                }
            }
        );

        if (!valido) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Código inválido, expirado ou com tentativas esgotadas.'
            });
        }

        limparCookieCadastro(res);

        return res.status(201).json({
            sucesso: true,
            mensagem: 'E-mail confirmado e cadastro de cliente concluído. Você será direcionado para o login.',
            redirecionar: '../login/login.html'
        });

    } catch (erro) {
        console.error('Erro ao confirmar cadastro:', erro);

        if (erro.code === '23505') {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Este CPF já possui cadastro de cliente.'
            });
        }

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível confirmar o cadastro. Tente novamente.'
        });
    }
};

// Reenvia um código usando o CPF guardado em cookie HttpOnly.
exports.reenviarCodigoCadastro = async (req, res) => {
    try {
        const cpf = req.cookies?.cadastro_pendente;

        if (!cpf) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'A etapa de cadastro expirou. Volte ao formulário e solicite outro código.'
            });
        }

        const pessoa = await query(`
            SELECT p.email_pessoa
            FROM public.pessoa p
            WHERE p.cpf_pessoa = $1
              AND NOT EXISTS (
                  SELECT 1 FROM public.cliente c
                  WHERE c.pessoa_cpf_pessoa = p.cpf_pessoa
              )
            LIMIT 1
        `, [cpf]);

        if (!pessoa.rows.length) {
            limparCookieCadastro(res);
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Não existe um cadastro pendente para este CPF.'
            });
        }

        const ultimoCodigo = await query(`
            SELECT data_criacao
            FROM public.codigo_verificacao
            WHERE cpf_pessoa = $1
              AND finalidade = 'ATIVACAO'
            ORDER BY id_codigo DESC
            LIMIT 1
        `, [cpf]);

        if (ultimoCodigo.rows.length) {
            const criadoEm = new Date(ultimoCodigo.rows[0].data_criacao).getTime();
            const segundosDecorridos = (Date.now() - criadoEm) / 1000;

            if (segundosDecorridos < INTERVALO_REENVIO_SEGUNDOS) {
                return res.status(429).json({
                    sucesso: false,
                    mensagem: `Aguarde ${Math.ceil(INTERVALO_REENVIO_SEGUNDOS - segundosDecorridos)} segundos para solicitar outro código.`
                });
            }
        }

        await enviarCodigoVerificacao(
            cpf,
            pessoa.rows[0].email_pessoa,
            'ATIVACAO'
        );

        definirCookie(res, 'cadastro_pendente', cpf, TEMPO_CODIGO_MS);

        return res.json({
            sucesso: true,
            mensagem: 'Um novo código foi enviado para seu e-mail. Ele é válido por 5 minutos.'
        });

    } catch (erro) {
        console.error('Erro ao reenviar código de cadastro:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível reenviar o código. Tente novamente.'
        });
    }
};
