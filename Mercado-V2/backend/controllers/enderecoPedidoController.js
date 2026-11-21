
const { query } = require('../database');

// Buscar o endereço do pedido anterior mais recente do cliente
exports.buscarUltimoEndereco = async (req, res) => {
    try {
        const cpf = req.sessao.cpf_pessoa;

        const resultado = await query(`
            SELECT
                e.id_endereco,
                e.cep,
                e.estado,
                e.cidade,
                e.bairro,
                e.rua,
                e.numero,
                e.complemento,
                e.referencia
            FROM public.pedido p
            INNER JOIN public.endereco_pedido e
                ON e.id_endereco = p.endereco_id
            WHERE p.cliente_cpf = $1
              AND p.status_pedido <> 'CARRINHO'
            ORDER BY p.data_pedido DESC, p.id_pedido DESC
            LIMIT 1
        `, [cpf]);

        if (resultado.rows.length === 0) {
            return res.json({
                sucesso: true,
                endereco: null,
                mensagem: 'Nenhum endereço anterior encontrado.'
            });
        }

        return res.json({
            sucesso: true,
            endereco: resultado.rows[0]
        });

    } catch (erro) {
        console.error('Erro ao buscar último endereço:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível buscar o endereço anterior.'
        });
    }
};
