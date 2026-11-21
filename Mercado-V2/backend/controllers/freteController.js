'use strict';

/* =====================================================
   Mercado V.2 - Controlador de Frete

   Apenas recebe o CEP, chama o serviço e responde.
   Toda a regra de cálculo está em services/freteService.js.
===================================================== */

const {
    ErroFrete,
    calcularFrete,
    gerarTokenFrete
} = require('../services/freteService');

// POST /frete/calcular
exports.calcularFrete = async (req, res) => {
    try {
        const cep = String(req.body?.cep || '').replace(/\D/g, '');

        if (!/^\d{8}$/.test(cep)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Informe um CEP válido com 8 dígitos.'
            });
        }

        const frete = await calcularFrete(cep);

        // Token assinado: permite à finalização reaproveitar o cálculo
        const freteToken = gerarTokenFrete({
            cpf: req.sessao.cpf_pessoa,
            cep: frete.cepDestino,
            distanciaKm: frete.distanciaKm,
            valorFrete: frete.valorFrete
        });

        return res.json({ ...frete, freteToken });

    } catch (erro) {

        // Erros previstos (CEP inválido, fora da área, serviço fora do ar...)
        if (erro instanceof ErroFrete) {
            console.warn(`[frete] ${erro.status} - ${erro.message}`);

            return res.status(erro.status).json({
                sucesso: false,
                mensagem: erro.message
            });
        }

        console.error('[frete] Erro inesperado ao calcular frete:', erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno ao calcular o frete.'
        });
    }
};