'use strict';

const crypto = require('crypto');
const { query, pool } = require('../database');
const {
    enviarCodigoVerificacao,
    validarCodigoVerificacao
} = require('../services/codigoVerificacaoService');
const { criarSessao, revogarSessao } = require('../services/sessaoService');

const opcoesCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
};

function definirCookie(res, nome, valor, maxAge) {
    res.cookie(nome, valor, { ...opcoesCookie, maxAge });
}

// Consulta os vínculos da pessoa para determinar os acessos permitidos.
async function consultarTiposUsuario(cpf) {
    const resultado = await query(`
        SELECT
            EXISTS (
                SELECT 1
                FROM public.cliente c
                WHERE c.pessoa_cpf_pessoa = $1
            ) AS eh_cliente,
            EXISTS (
                SELECT 1
                FROM public.funcionario f
                JOIN public.cargo c ON c.id_cargo = f.cargo_id_cargo
                WHERE f.pessoa_cpf_pessoa = $1
                  AND lower(trim(c.nome_cargo)) = 'gerente'
            ) AS eh_gerente,
            EXISTS (
                SELECT 1
                FROM public.funcionario f
                WHERE f.pessoa_cpf_pessoa = $1
            ) AS eh_funcionario
    `, [cpf]);

    return resultado.rows[0];
}

// Cria a sessão depois que o usuário já foi autorizado pelo backend.
async function iniciarSessao(res, cpf, tipoAcesso) {
    const { token, sessao } = await criarSessao(cpf, tipoAcesso);

    definirCookie(
        res,
        'sessao',
        token,
        30 * 24 * 60 * 60 * 1000
    );

    return sessao;
}

exports.iniciarLogin = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const senha = req.body.senha;

        if (!email || typeof senha !== 'string' || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe e-mail e senha.'
            });
        }

        const resultado = await query(`
            SELECT p.cpf_pessoa, p.email_pessoa
            FROM public.pessoa p
            WHERE lower(p.email_pessoa) = $1
              AND p.senha_hash IS NOT NULL
              AND p.senha_hash = crypt($2, p.senha_hash)
              AND (
                  EXISTS (
                      SELECT 1
                      FROM public.cliente c
                      WHERE c.pessoa_cpf_pessoa = p.cpf_pessoa
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.funcionario f
                      WHERE f.pessoa_cpf_pessoa = p.cpf_pessoa
                  )
              )
            LIMIT 1
        `, [email, senha]);

        if (!resultado.rows.length) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        const pessoa = resultado.rows[0];

        await enviarCodigoVerificacao(
            pessoa.cpf_pessoa,
            pessoa.email_pessoa,
            'LOGIN'
        );

        definirCookie(res, 'login_pendente', pessoa.cpf_pessoa, 5 * 60 * 1000);

        // Um novo login invalida qualquer escolha temporária anterior.
        res.clearCookie('acesso_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Código enviado para seu e-mail.'
        });
    } catch (erro) {
        console.error('Erro ao iniciar login:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível iniciar o login. Verifique o serviço de e-mail.'
        });
    }
};

exports.validarLogin = async (req, res) => {
    try {
        const cpf = req.cookies?.login_pendente;
        const codigo = String(req.body.codigo || '').trim();

        if (!cpf) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'A etapa de login expirou. Entre novamente.'
            });
        }

        const valido = await validarCodigoVerificacao(cpf, codigo, 'LOGIN');

        if (!valido) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Código inválido ou expirado.'
            });
        }

        const usuario = await consultarTiposUsuario(cpf);
        const opcoes = [];

        // Gerente que também é cliente pode escolher entre os dois acessos.
        if (usuario.eh_gerente && usuario.eh_cliente) {
            opcoes.push('GERENTE', 'CLIENTE');
        // Gerente sem cadastro de cliente pode entrar como gerente ou se cadastrar.
        } else if (usuario.eh_gerente && !usuario.eh_cliente) {
            opcoes.push('GERENTE', 'CADASTRAR_CLIENTE');
        // Cliente que não é gerente entra diretamente na loja.
        } else if (usuario.eh_cliente) {
            const sessao = await iniciarSessao(res, cpf, 'CLIENTE');
            res.clearCookie('login_pendente', { path: '/' });

            return res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso.',
                proximaEtapa: 'ENTRAR_LOJA',
                sessao
            });
        // Funcionário que não é gerente e ainda não é cliente só pode se cadastrar.
        } else if (usuario.eh_funcionario) {
            opcoes.push('CADASTRAR_CLIENTE');
        }

        if (!opcoes.length) {
            res.clearCookie('login_pendente', { path: '/' });

            return res.status(403).json({
                sucesso: false,
                mensagem: 'Esta conta não possui um tipo de acesso disponível.'
            });
        }

        // A escolha temporária fica vinculada ao CPF e expira em cinco minutos.
        definirCookie(res, 'acesso_pendente', cpf, 5 * 60 * 1000);
        res.clearCookie('login_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'E-mail verificado. Escolha uma opção para continuar.',
            proximaEtapa: 'ESCOLHER_ACESSO',
            opcoes
        });
    } catch (erro) {
        console.error('Erro ao validar login:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível validar o código.'
        });
    }
};

exports.escolherAcesso = async (req, res) => {
    try {
        const cpf = req.cookies?.acesso_pendente;
        const tipo = String(req.body.tipoAcesso || '').trim().toUpperCase();
        const tiposPermitidos = ['CLIENTE', 'GERENTE', 'CADASTRAR_CLIENTE'];

        if (!cpf || !tiposPermitidos.includes(tipo)) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Escolha de acesso inválida ou expirada.'
            });
        }

        // Confere novamente os vínculos no banco para impedir escolha indevida.
        const usuario = await consultarTiposUsuario(cpf);

        if (tipo === 'CADASTRAR_CLIENTE') {
            // Somente funcionário/gerente que ainda não é cliente pode seguir esse fluxo.
            if (!usuario.eh_funcionario || usuario.eh_cliente) {
                return res.status(403).json({
                    sucesso: false,
                    mensagem: 'Esta opção não está disponível para sua conta.'
                });
            }

            res.clearCookie('acesso_pendente', { path: '/' });

            return res.json({
                sucesso: true,
                mensagem: 'Opção autorizada. Continue seu cadastro como cliente.',
                proximaEtapa: 'CADASTRAR_CLIENTE'
            });
        }

        if (tipo === 'GERENTE' && !usuario.eh_gerente) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Você não possui permissão de gerente.'
            });
        }

        if (tipo === 'CLIENTE' && !usuario.eh_cliente) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Você não possui cadastro de cliente.'
            });
        }

        const sessao = await iniciarSessao(res, cpf, tipo);
        res.clearCookie('acesso_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Acesso autorizado.',
            proximaEtapa: tipo === 'CLIENTE'
                ? 'ENTRAR_LOJA'
                : 'ENTRAR_GERENCIAMENTO',
            sessao
        });
    } catch (erro) {
        console.error('Erro ao escolher acesso:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível selecionar o acesso.'
        });
    }
};

exports.trocarAcesso = async (req, res) => {
    try {
        const cpf = req.sessao.cpf_pessoa;
        const tipoAtual = String(req.sessao.tipo_acesso || '').toUpperCase();
        const tipoDestino = String(req.body.tipoAcesso || '').trim().toUpperCase();

        if (
            !['CLIENTE', 'GERENTE'].includes(tipoAtual) ||
            !['CLIENTE', 'GERENTE'].includes(tipoDestino) ||
            tipoDestino === tipoAtual
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Troca de acesso inválida.'
            });
        }

        // Confere novamente os vínculos no banco antes de alterar a sessão.
        const usuario = await consultarTiposUsuario(cpf);

        if (tipoDestino === 'GERENTE' && !usuario.eh_gerente) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Esta conta não possui acesso de gerente.'
            });
        }

        if (tipoDestino === 'CLIENTE' && !usuario.eh_cliente) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Esta conta não possui cadastro de cliente.'
            });
        }

        // Altera somente a sessão autenticada; o cookie HttpOnly permanece o mesmo.
        const atualizacao = await query(`
            UPDATE public.sessao
            SET tipo_acesso = $1
            WHERE id_sessao = $2
              AND cpf_pessoa = $3
              AND tipo_acesso = $4
              AND data_expiracao > CURRENT_TIMESTAMP
              AND data_revogacao IS NULL
            RETURNING id_sessao, cpf_pessoa, tipo_acesso, data_expiracao
        `, [tipoDestino, req.sessao.id_sessao, cpf, tipoAtual]);

        if (!atualizacao.rows.length) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Sua sessão expirou ou foi alterada. Entre novamente.'
            });
        }

        return res.json({
            sucesso: true,
            mensagem: tipoDestino === 'GERENTE'
                ? 'Acesso alterado para gerente.'
                : 'Acesso alterado para cliente.',
            proximaEtapa: tipoDestino === 'GERENTE'
                ? 'ENTRAR_GERENCIAMENTO'
                : 'ENTRAR_LOJA',
            sessao: atualizacao.rows[0]
        });
    } catch (erro) {
        console.error('Erro ao trocar acesso:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível trocar o tipo de acesso.'
        });
    }
};

exports.logout = async (req, res) => {
    try {
        const token = req.cookies?.sessao;
        await revogarSessao(token);
        res.clearCookie('sessao', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Sessão encerrada.'
        });
    } catch (erro) {
        console.error('Erro ao encerrar sessão:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível encerrar a sessão.'
        });
    }
};

exports.minhaSessao = async (req, res) => {
    try {
        const resultado = await query(`
            SELECT nome_pessoa
            FROM public.pessoa
            WHERE cpf_pessoa = $1
            LIMIT 1
        `, [req.sessao.cpf_pessoa]);

        if (!resultado.rows.length) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Pessoa não encontrada.'
            });
        }

        const tiposUsuario = await consultarTiposUsuario(req.sessao.cpf_pessoa);

        return res.json({
            sucesso: true,
            sessao: {
                cpf_pessoa: req.sessao.cpf_pessoa,
                tipo_acesso: req.sessao.tipo_acesso,
                data_expiracao: req.sessao.data_expiracao,
                nome_pessoa: resultado.rows[0].nome_pessoa,
                eh_cliente: tiposUsuario.eh_cliente === true,
                eh_gerente: tiposUsuario.eh_gerente === true
            }
        });
    } catch (erro) {
        console.error('Erro ao consultar sessão:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível consultar sua sessão.'
        });
    }
};


/* =====================================================
   RECUPERAÇÃO DE SENHA
   Fluxo:
   1. Solicitar código pelo e-mail.
   2. Validar código enviado por e-mail.
   3. Criar um token temporário e guardá-lo em cookie HttpOnly.
   4. Definir nova senha e invalidar as sessões existentes.
===================================================== */

const mensagemSolicitacaoRecuperacao =
    'Se esse e-mail estiver cadastrado, enviaremos um código de recuperação.';

function gerarTokenRecuperacao() {
    return crypto.randomBytes(32).toString('hex');
}

function gerarHashTokenRecuperacao(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

exports.solicitarRecuperacaoSenha = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        // A resposta é igual para e-mails cadastrados e não cadastrados,
        // evitando revelar quais contas existem no sistema.
        res.clearCookie('recuperacao_pendente', { path: '/' });
        res.clearCookie('recuperacao_autorizada', { path: '/' });

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({
                sucesso: true,
                mensagem: mensagemSolicitacaoRecuperacao
            });
        }

        const resultadoPessoa = await query(`
            SELECT cpf_pessoa, email_pessoa
            FROM public.pessoa
            WHERE lower(email_pessoa) = $1
            LIMIT 1
        `, [email]);

        if (!resultadoPessoa.rows.length) {
            return res.json({
                sucesso: true,
                mensagem: mensagemSolicitacaoRecuperacao
            });
        }

        const pessoa = resultadoPessoa.rows[0];

        // Limita o reenvio: no máximo um código por pessoa a cada 60 segundos.
        const consultaReenvio = await query(`
            SELECT 1
            FROM public.codigo_verificacao
            WHERE cpf_pessoa = $1
              AND finalidade = 'RECUPERACAO'
              AND data_criacao > CURRENT_TIMESTAMP - INTERVAL '60 seconds'
              AND data_utilizacao IS NULL
              AND data_invalidacao IS NULL
            ORDER BY id_codigo DESC
            LIMIT 1
        `, [pessoa.cpf_pessoa]);

        definirCookie(
            res,
            'recuperacao_pendente',
            pessoa.cpf_pessoa,
            5 * 60 * 1000
        );

        if (!consultaReenvio.rows.length) {
            await enviarCodigoVerificacao(
                pessoa.cpf_pessoa,
                pessoa.email_pessoa,
                'RECUPERACAO'
            );
        }

        return res.json({
            sucesso: true,
            mensagem: mensagemSolicitacaoRecuperacao
        });
    } catch (erro) {
        console.error('Erro ao solicitar recuperação de senha:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível processar a solicitação agora. Tente novamente.'
        });
    }
};

exports.validarCodigoRecuperacao = async (req, res) => {
    try {
        const cpf = req.cookies?.recuperacao_pendente;
        const codigo = String(req.body.codigo || '').trim();

        if (!cpf) {
            // Mesma resposta de código inválido para não revelar se o e-mail existe.
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Código inválido ou expirado. Confira o código e tente novamente.'
            });
        }

        const codigoValido = await validarCodigoVerificacao(
            cpf,
            codigo,
            'RECUPERACAO'
        );

        if (!codigoValido) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Código inválido ou expirado. Confira o código e tente novamente.'
            });
        }

        const token = gerarTokenRecuperacao();
        const tokenHash = gerarHashTokenRecuperacao(token);
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Invalida tokens anteriores ainda não utilizados dessa pessoa.
            await client.query(`
                UPDATE public.recuperacao_senha
                SET data_utilizacao = CURRENT_TIMESTAMP
                WHERE pessoa_cpf = $1
                  AND data_utilizacao IS NULL
            `, [cpf]);

            await client.query(`
                INSERT INTO public.recuperacao_senha (
                    pessoa_cpf,
                    token_hash,
                    data_expiracao
                )
                VALUES (
                    $1,
                    $2,
                    CURRENT_TIMESTAMP + INTERVAL '5 minutes'
                )
            `, [cpf, tokenHash]);

            await client.query('COMMIT');
        } catch (erro) {
            await client.query('ROLLBACK');
            throw erro;
        } finally {
            client.release();
        }

        definirCookie(
            res,
            'recuperacao_autorizada',
            token,
            5 * 60 * 1000
        );
        res.clearCookie('recuperacao_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Código confirmado. Agora escolha sua nova senha.',
            proximaEtapa: 'DEFINIR_NOVA_SENHA'
        });
    } catch (erro) {
        console.error('Erro ao validar código de recuperação:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível validar o código agora. Tente novamente.'
        });
    }
};

exports.redefinirSenha = async (req, res) => {
    const token = req.cookies?.recuperacao_autorizada;
    const senha = req.body.senha;
    const confirmarSenha = req.body.confirmarSenha;

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'A autorização expirou. Inicie a recuperação novamente.'
        });
    }

    if (typeof senha !== 'string' || senha.length < 8) {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'A nova senha deve possuir pelo menos 8 caracteres.'
        });
    }

    if (Buffer.byteLength(senha, 'utf8') > 72) {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'A nova senha deve ter no máximo 72 bytes.'
        });
    }

    if (senha !== confirmarSenha) {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'As senhas não coincidem.'
        });
    }

    const tokenHash = gerarHashTokenRecuperacao(token);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const resultadoToken = await client.query(`
            SELECT id_recuperacao, pessoa_cpf
            FROM public.recuperacao_senha
            WHERE token_hash = $1
              AND data_utilizacao IS NULL
              AND data_expiracao > CURRENT_TIMESTAMP
            LIMIT 1
            FOR UPDATE
        `, [tokenHash]);

        if (!resultadoToken.rows.length) {
            await client.query('ROLLBACK');
            res.clearCookie('recuperacao_autorizada', { path: '/' });

            return res.status(401).json({
                sucesso: false,
                mensagem: 'A autorização expirou ou já foi utilizada. Solicite outro código.'
            });
        }

        const recuperacao = resultadoToken.rows[0];

        const resultadoAtualizacao = await client.query(`
            UPDATE public.pessoa
            SET senha_hash = crypt($1, gen_salt('bf', 10))
            WHERE cpf_pessoa = $2
            RETURNING cpf_pessoa
        `, [senha, recuperacao.pessoa_cpf]);

        if (!resultadoAtualizacao.rows.length) {
            throw new Error('Pessoa vinculada à recuperação não foi encontrada.');
        }

        // Token de recuperação é de uso único.
        await client.query(`
            UPDATE public.recuperacao_senha
            SET data_utilizacao = CURRENT_TIMESTAMP
            WHERE id_recuperacao = $1
        `, [recuperacao.id_recuperacao]);

        // A troca da senha encerra as sessões abertas em outros dispositivos.
        await client.query(`
            UPDATE public.sessao
            SET data_revogacao = CURRENT_TIMESTAMP
            WHERE cpf_pessoa = $1
              AND data_revogacao IS NULL
        `, [recuperacao.pessoa_cpf]);

        // Invalida outros códigos de recuperação que ainda estejam pendentes.
        await client.query(`
            UPDATE public.codigo_verificacao
            SET data_invalidacao = CURRENT_TIMESTAMP
            WHERE cpf_pessoa = $1
              AND finalidade = 'RECUPERACAO'
              AND data_utilizacao IS NULL
              AND data_invalidacao IS NULL
        `, [recuperacao.pessoa_cpf]);

        await client.query('COMMIT');

        res.clearCookie('recuperacao_autorizada', { path: '/' });
        res.clearCookie('recuperacao_pendente', { path: '/' });
        res.clearCookie('sessao', { path: '/' });
        res.clearCookie('login_pendente', { path: '/' });
        res.clearCookie('acesso_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Senha alterada com sucesso. Entre novamente com sua nova senha.'
        });
    } catch (erro) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Erro ao redefinir senha:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível alterar sua senha. Tente novamente.'
        });
    } finally {
        client.release();
    }
};
