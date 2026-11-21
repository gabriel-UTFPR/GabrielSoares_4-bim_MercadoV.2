const { query } = require('../database');
const { enviarCodigoVerificacao, validarCodigoVerificacao } = require('../services/codigoVerificacaoService');
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

exports.iniciarLogin = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const senha = req.body.senha;

        if (!email || typeof senha !== 'string' || !senha) {
            return res.status(400).json({ sucesso: false, mensagem: 'Informe e-mail e senha.' });
        }

        const resultado = await query(`
            SELECT cpf_pessoa, email_pessoa
            FROM public.pessoa
            WHERE lower(email_pessoa) = $1
              AND senha_hash IS NOT NULL
              AND senha_hash = crypt($2, senha_hash)
            LIMIT 1
        `, [email, senha]);

        if (!resultado.rows.length) {
            return res.status(401).json({ sucesso: false, mensagem: 'E-mail ou senha incorretos.' });
        }

        const pessoa = resultado.rows[0];

        await enviarCodigoVerificacao(pessoa.cpf_pessoa, pessoa.email_pessoa, 'LOGIN');

        definirCookie(res, 'login_pendente', pessoa.cpf_pessoa, 5 * 60 * 1000);

        return res.json({ sucesso: true, mensagem: 'Código enviado para seu e-mail.' });
    } catch (erro) {
        console.error('Erro ao iniciar login:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível iniciar o login. Verifique o serviço de e-mail.' });
    }
};

exports.validarLogin = async (req, res) => {
    try {
        const cpf = req.cookies?.login_pendente;
        const codigo = String(req.body.codigo || '').trim();

        if (!cpf) {
            return res.status(401).json({ sucesso: false, mensagem: 'A etapa de login expirou. Entre novamente.' });
        }

        const valido = await validarCodigoVerificacao(cpf, codigo, 'LOGIN');

        if (!valido) {
            return res.status(401).json({ sucesso: false, mensagem: 'Código inválido ou expirado.' });
        }

        const resultado = await query(`
            SELECT
                EXISTS (SELECT 1 FROM public.cliente c WHERE c.pessoa_cpf_pessoa = $1) AS eh_cliente,
                EXISTS (
                    SELECT 1
                    FROM public.funcionario f
                    JOIN public.cargo c ON c.id_cargo = f.cargo_id_cargo
                    WHERE f.pessoa_cpf_pessoa = $1
                      AND lower(c.nome_cargo) = 'gerente'
                ) AS eh_gerente
        `, [cpf]);

        const pessoa = resultado.rows[0];
        const opcoes = [];
        if (pessoa.eh_cliente) opcoes.push('CLIENTE');
        if (pessoa.eh_gerente) opcoes.push('GERENTE');

        if (!opcoes.length) {
            res.clearCookie('login_pendente', { path: '/' });
            return res.status(403).json({ sucesso: false, mensagem: 'Esta conta não possui um tipo de acesso disponível.' });
        }

        if (opcoes.length === 1) {
            const tipo = opcoes[0];
            const { token, sessao } = await criarSessao(cpf, tipo);
            definirCookie(res, 'sessao', token, 30 * 24 * 60 * 60 * 1000);
            res.clearCookie('login_pendente', { path: '/' });

            return res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso.',
                proximaEtapa: tipo === 'CLIENTE' ? 'ENTRAR_LOJA' : 'ENTRAR_GERENCIAMENTO',
                sessao
            });
        }

        definirCookie(res, 'acesso_pendente', cpf, 5 * 60 * 1000);
        res.clearCookie('login_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Escolha como deseja acessar.',
            proximaEtapa: 'ESCOLHER_ACESSO',
            opcoes
        });
    } catch (erro) {
        console.error('Erro ao validar login:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível validar o código.' });
    }
};

exports.escolherAcesso = async (req, res) => {
    try {
        const cpf = req.cookies?.acesso_pendente;
        const tipo = String(req.body.tipoAcesso || '').toUpperCase();

        if (!cpf || !['CLIENTE', 'GERENTE'].includes(tipo)) {
            return res.status(401).json({ sucesso: false, mensagem: 'Escolha de acesso inválida ou expirada.' });
        }

        const verificacao = tipo === 'CLIENTE'
            ? await query('SELECT 1 FROM public.cliente WHERE pessoa_cpf_pessoa = $1', [cpf])
            : await query(`
                SELECT 1
                FROM public.funcionario f
                JOIN public.cargo c ON c.id_cargo = f.cargo_id_cargo
                WHERE f.pessoa_cpf_pessoa = $1 AND lower(c.nome_cargo) = 'gerente'
            `, [cpf]);

        if (!verificacao.rows.length) {
            return res.status(403).json({ sucesso: false, mensagem: 'Você não possui permissão para esse acesso.' });
        }

        const { token, sessao } = await criarSessao(cpf, tipo);
        definirCookie(res, 'sessao', token, 30 * 24 * 60 * 60 * 1000);
        res.clearCookie('acesso_pendente', { path: '/' });

        return res.json({
            sucesso: true,
            mensagem: 'Acesso autorizado.',
            proximaEtapa: tipo === 'CLIENTE' ? 'ENTRAR_LOJA' : 'ENTRAR_GERENCIAMENTO',
            sessao
        });
    } catch (erro) {
        console.error('Erro ao escolher acesso:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível selecionar o acesso.' });
    }
};

exports.logout = async (req, res) => {
    try {
        const token = req.cookies?.sessao;
        await revogarSessao(token);
        res.clearCookie('sessao', { path: '/' });
        return res.json({ sucesso: true, mensagem: 'Sessão encerrada.' });
    } catch (erro) {
        console.error('Erro ao encerrar sessão:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível encerrar a sessão.' });
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

        return res.json({
            sucesso: true,
            sessao: {
                cpf_pessoa: req.sessao.cpf_pessoa,
                tipo_acesso: req.sessao.tipo_acesso,
                data_expiracao: req.sessao.data_expiracao,
                nome_pessoa: resultado.rows[0].nome_pessoa
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