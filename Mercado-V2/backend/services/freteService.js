'use strict';

/* =====================================================
   Mercado V.2 - Serviço de Frete

   ÚNICA implementação do cálculo de frete do sistema.
   O controlador de frete e o de finalização do pedido
   usam este arquivo.

   1) Configurações
   2) Utilitários
   3) Consulta de CEP (BrasilAPI)
   4) Coordenadas (Nominatim / OpenStreetMap)
   5) Rota (OSRM)
   6) Cálculo do frete
   7) Token de integridade do frete
===================================================== */

const crypto = require('crypto');


/* =====================================================
   1) CONFIGURAÇÕES
===================================================== */

const CEP_ORIGEM = '87310590';

const COORDENADAS_ORIGEM = {
    latitude: -24.0244823,
    longitude: -52.3557903
};

const TAXA_FIXA = 5.00;
const VALOR_POR_KM = 1.50;

// Cidade atendida
const CIDADE_ATENDIDA = 'Campo Mourão';
const ESTADO_ATENDIDO_SIGLA = 'PR';
const ESTADO_ATENDIDO_NOME = 'Paraná';

/*
 * Retângulo que contém Campo Mourão (usado para limitar a busca
 * no Nominatim). É uma aproximação generosa, não um limite oficial.
 * Ordem exigida pelo Nominatim: esquerda, topo, direita, base.
 */
const AREA_BUSCA = {
    esquerda: -52.60,
    topo: -23.85,
    direita: -52.15,
    base: -24.25
};

// Proteção contra resultados errados: distância em linha reta máxima
const RAIO_MAXIMO_KM = 20;

// Regras de uso do Nominatim: no máximo 1 consulta por segundo
const INTERVALO_NOMINATIM_MS = 1100;

const TIMEOUT_MS = 15000;

// Cache em memória (evita repetir consultas ao mesmo CEP)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Validade do token de frete (tempo para o cliente concluir o checkout)
const TOKEN_TTL_MS = 15 * 60 * 1000;


/* =====================================================
   2) UTILITÁRIOS
===================================================== */

// Erro com código HTTP e mensagem que pode ser mostrada ao cliente
class ErroFrete extends Error {
    constructor(status, mensagem) {
        super(mensagem);
        this.name = 'ErroFrete';
        this.status = status;
    }
}

function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Confere se cidade/estado correspondem a Campo Mourão - PR
function ehCampoMourao(cidade, estado) {
    const estadoNormalizado = normalizarTexto(estado);

    return normalizarTexto(cidade) === normalizarTexto(CIDADE_ATENDIDA) &&
        (
            estadoNormalizado === normalizarTexto(ESTADO_ATENDIDO_SIGLA) ||
            estadoNormalizado === normalizarTexto(ESTADO_ATENDIDO_NOME)
        );
}

// Faz a requisição e devolve { ok, status, dados } sem lançar erro HTTP
async function buscarJSON(url, opcoes, servico) {
    let resposta;

    try {
        resposta = await fetch(url, {
            ...opcoes,
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (erro) {
        console.error(`[frete] Falha de conexão com ${servico}:`, erro.message);

        if (erro.name === 'TimeoutError' || erro.name === 'AbortError') {
            throw new ErroFrete(
                504,
                `O serviço de ${servico} demorou para responder. Tente novamente.`
            );
        }

        throw new ErroFrete(
            502,
            `Não foi possível conectar ao serviço de ${servico}. Tente novamente.`
        );
    }

    let dados = null;

    try {
        dados = await resposta.json();
    } catch (erro) {
        dados = null;
    }

    return { ok: resposta.ok, status: resposta.status, dados };
}

// Distância em linha reta (fórmula de Haversine), em km
function distanciaRetaKm(a, b) {
    const rad = (graus) => graus * Math.PI / 180;

    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);

    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.latitude)) *
        Math.cos(rad(b.latitude)) *
        Math.sin(dLon / 2) ** 2;

    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function coordenadaValida(coordenada) {
    return Boolean(coordenada) &&
        Number.isFinite(coordenada.latitude) &&
        Number.isFinite(coordenada.longitude) &&
        coordenada.latitude >= -90 && coordenada.latitude <= 90 &&
        coordenada.longitude >= -180 && coordenada.longitude <= 180;
}


/* =====================================================
   3) CONSULTA DE CEP (BrasilAPI)
===================================================== */

async function consultarCEP(cep) {

    const cepNumerico = String(cep || '').replace(/\D/g, '');

    if (!/^\d{8}$/.test(cepNumerico)) {
        throw new ErroFrete(400, 'Informe um CEP válido com 8 dígitos.');
    }

    const { ok, status, dados } = await buscarJSON(
        `https://brasilapi.com.br/api/cep/v2/${cepNumerico}`,
        {},
        'consulta de CEP'
    );

    if (status === 404) {
        throw new ErroFrete(404, 'CEP não encontrado.');
    }

    if (!ok || !dados || typeof dados !== 'object') {
        console.error('[frete] Resposta inesperada da BrasilAPI:', status, dados);
        throw new ErroFrete(502, 'Não foi possível consultar o CEP informado.');
    }

    // Campos retornados pela BrasilAPI v2: city, state, neighborhood, street
    if (!dados.city || !dados.state) {
        console.error('[frete] BrasilAPI sem cidade/estado:', dados);
        throw new ErroFrete(502, 'A consulta do CEP retornou dados incompletos.');
    }

    if (!ehCampoMourao(dados.city, dados.state)) {
        throw new ErroFrete(422, 'Entregamos somente em Campo Mourão - PR.');
    }

    // A BrasilAPI nem sempre informa coordenadas
    const coordenadasBrutas = dados.location?.coordinates || {};

    const coordenadasCEP = {
        latitude: Number(coordenadasBrutas.latitude),
        longitude: Number(coordenadasBrutas.longitude)
    };

    return {
        cep: cepNumerico,
        estado: String(dados.state).trim(),
        cidade: String(dados.city).trim(),
        bairro: String(dados.neighborhood || '').trim(),
        rua: String(dados.street || '').trim(),
        coordenadasCEP: coordenadaValida(coordenadasCEP)
            ? coordenadasCEP
            : null
    };
}


/* =====================================================
   4) COORDENADAS (Nominatim / OpenStreetMap)
===================================================== */

/*
 * Fila: garante intervalo mínimo entre consultas ao Nominatim,
 * mesmo que vários clientes calculem frete ao mesmo tempo.
 */
let filaNominatim = Promise.resolve();
let ultimaConsultaNominatim = 0;

function agendarNominatim(tarefa) {
    const execucao = filaNominatim.then(async () => {
        const espera = INTERVALO_NOMINATIM_MS -
            (Date.now() - ultimaConsultaNominatim);

        if (espera > 0) {
            await new Promise((resolver) => setTimeout(resolver, espera));
        }

        try {
            return await tarefa();
        } finally {
            ultimaConsultaNominatim = Date.now();
        }
    });

    filaNominatim = execucao.catch(() => {});

    return execucao;
}

function montarUserAgent() {
    const contato = process.env.NOMINATIM_EMAIL
        ? `; ${process.env.NOMINATIM_EMAIL}`
        : '';

    return `MercadoV2/1.0 (projeto escolar${contato})`;
}

// Executa UMA consulta ao Nominatim e devolve a lista de resultados
function consultarNominatim(parametrosBusca) {
    return agendarNominatim(async () => {

        const parametros = new URLSearchParams({
            ...parametrosBusca,
            format: 'jsonv2',
            limit: '1',
            addressdetails: '1',
            countrycodes: 'br',
            viewbox: [
                AREA_BUSCA.esquerda,
                AREA_BUSCA.topo,
                AREA_BUSCA.direita,
                AREA_BUSCA.base
            ].join(','),
            bounded: '1'
        });

        const { ok, status, dados } = await buscarJSON(
            `https://nominatim.openstreetmap.org/search?${parametros}`,
            {
                headers: {
                    'User-Agent': montarUserAgent(),
                    'Accept-Language': 'pt-BR'
                }
            },
            'localização (Nominatim)'
        );

        if (!ok) {
            console.error('[frete] Nominatim retornou erro HTTP', status);
            throw new ErroFrete(
                502,
                'O serviço de localização está indisponível. Tente novamente em instantes.'
            );
        }

        return Array.isArray(dados) ? dados : [];
    });
}

// Remove "Avenida", "Rua", "Travessa"... do início do nome da rua
function removerTipoLogradouro(rua) {
    return rua.replace(
        /^(avenida|av\.?|rua|r\.?|travessa|tv\.?|alameda|al\.?|pra[cç]a|rodovia|rod\.?|estrada|est\.?|beco|via)\s+/i,
        ''
    );
}

/*
 * Confere se o resultado do Nominatim é mesmo a rua procurada.
 * Evita aceitar outra rua parecida, um comércio ou um bairro.
 */
function nomeDaRuaConfere(ruaProcurada, resultado) {
    const procurada = normalizarTexto(removerTipoLogradouro(ruaProcurada));

    const encontrada = normalizarTexto(
        removerTipoLogradouro(
            resultado.address?.road || resultado.name || ''
        )
    );

    if (!procurada || !encontrada) {
        return false;
    }

    return procurada === encontrada ||
        encontrada.includes(procurada) ||
        procurada.includes(encontrada);
}

/*
 * Tenta localizar o endereço em ordem, da busca mais precisa para
 * a menos precisa. Cada resultado informa a precisão obtida:
 *
 *   'rua'    -> coordenada de uma via do OpenStreetMap
 *   'cep'    -> coordenada informada pela BrasilAPI
 *   'bairro' -> centro APROXIMADO do bairro (erro possível de
 *               algumas centenas de metros a poucos km)
 *
 * Nunca usamos uma coordenada genérica do centro da cidade.
 */
async function localizarDestino(dadosCEP) {

    const { rua, bairro } = dadosCEP;
    const cidadeEstado = [CIDADE_ATENDIDA, ESTADO_ATENDIDO_NOME, 'Brasil'];

    const tentativas = [];

    if (rua) {
        tentativas.push({
            nome: 'rua (busca estruturada)',
            precisao: 'rua',
            parametros: {
                street: rua,
                city: CIDADE_ATENDIDA,
                state: ESTADO_ATENDIDO_NOME,
                country: 'Brazil'
            }
        });

        const ruaSemTipo = removerTipoLogradouro(rua);

        if (ruaSemTipo && ruaSemTipo !== rua) {
            tentativas.push({
                nome: 'rua sem o tipo (Avenida/Rua...)',
                precisao: 'rua',
                parametros: {
                    street: ruaSemTipo,
                    city: CIDADE_ATENDIDA,
                    state: ESTADO_ATENDIDO_NOME,
                    country: 'Brazil'
                }
            });
        }

        tentativas.push({
            nome: 'rua (busca livre)',
            precisao: 'rua',
            parametros: {
                q: [rua, bairro, ...cidadeEstado].filter(Boolean).join(', ')
            }
        });
    }

    if (dadosCEP.coordenadasCEP) {
        tentativas.push({
            nome: 'coordenadas da BrasilAPI',
            precisao: 'cep',
            coordenadas: dadosCEP.coordenadasCEP
        });
    }

    if (bairro) {
        tentativas.push({
            nome: 'centro do bairro (aproximado)',
            precisao: 'bairro',
            parametros: {
                q: [bairro, ...cidadeEstado].join(', ')
            }
        });
    }

    for (const tentativa of tentativas) {

        let coordenadas = tentativa.coordenadas || null;

        if (!coordenadas) {
            const resultados = await consultarNominatim(tentativa.parametros);

            console.log(
                `[frete] Nominatim - ${tentativa.nome}:`,
                resultados.length ? 'encontrado' : 'sem resultado'
            );

            if (!resultados.length) {
                continue;
            }

            // Para buscas por rua, o resultado precisa ser a mesma rua
            if (
                tentativa.precisao === 'rua' &&
                !nomeDaRuaConfere(rua, resultados[0])
            ) {
                console.warn(
                    `[frete] Resultado descartado (rua diferente): ` +
                    `procurada "${rua}", encontrada ` +
                    `"${resultados[0].address?.road || resultados[0].name}"`
                );
                continue;
            }

            coordenadas = {
                latitude: Number(resultados[0].lat),
                longitude: Number(resultados[0].lon)
            };
        }

        if (!coordenadaValida(coordenadas)) {
            console.warn(`[frete] Coordenadas inválidas em: ${tentativa.nome}`);
            continue;
        }

        const retaKm = distanciaRetaKm(COORDENADAS_ORIGEM, coordenadas);

        if (retaKm > RAIO_MAXIMO_KM) {
            console.warn(
                `[frete] Resultado descartado (${retaKm.toFixed(1)} km em linha reta):`,
                tentativa.nome
            );
            continue;
        }

        if (tentativa.precisao !== 'rua') {
            console.warn(
                `[frete] ATENÇÃO: precisão "${tentativa.precisao}" usada para o CEP ${dadosCEP.cep}.`
            );
        }

        console.log(
            `[frete] Destino (${tentativa.nome}): ` +
            `https://www.openstreetmap.org/?mlat=${coordenadas.latitude}` +
            `&mlon=${coordenadas.longitude}#map=17/${coordenadas.latitude}/${coordenadas.longitude}`
        );

        return { coordenadas, precisao: tentativa.precisao };
    }

    throw new ErroFrete(
        422,
        'Não foi possível localizar esse endereço no mapa para calcular o frete.'
    );
}


/* =====================================================
   5) ROTA (OSRM)
===================================================== */

async function consultarRotaOSRM(origem, destino) {

    const coordenadas = [
        `${origem.longitude},${origem.latitude}`,
        `${destino.longitude},${destino.latitude}`
    ].join(';');

    const { ok, status, dados } = await buscarJSON(
        `https://router.project-osrm.org/route/v1/driving/${coordenadas}?overview=false`,
        {},
        'rotas (OSRM)'
    );

    if (!dados || (!ok && !dados.code)) {
        console.error('[frete] OSRM retornou erro HTTP', status);
        throw new ErroFrete(502, 'Não foi possível calcular a rota de entrega.');
    }

    if (
        dados.code !== 'Ok' ||
        !Array.isArray(dados.routes) ||
        dados.routes.length === 0
    ) {
        console.error('[frete] OSRM sem rota:', dados.code, dados.message);
        throw new ErroFrete(422, 'Não foi encontrada uma rota para esse endereço.');
    }

    // O OSRM retorna a distância em metros
    const distanciaMetros = Number(dados.routes[0].distance);

    if (!Number.isFinite(distanciaMetros) || distanciaMetros < 0) {
        throw new ErroFrete(502, 'A rota retornou uma distância inválida.');
    }

    return Number((distanciaMetros / 1000).toFixed(2));
}


/* =====================================================
   6) CÁLCULO DO FRETE
===================================================== */

// Fórmula do frete (mantida exatamente como era)
function calcularValorFrete(distanciaKm) {
    const valorFrete = distanciaKm <= 1
        ? TAXA_FIXA
        : TAXA_FIXA + (distanciaKm * VALOR_POR_KM);

    return Number(valorFrete.toFixed(2));
}

const cacheFrete = new Map();

async function calcularFrete(cep) {

    const cepDestino = String(cep || '').replace(/\D/g, '');

    const emCache = cacheFrete.get(cepDestino);

    if (emCache && emCache.expira > Date.now()) {
        console.log(`[frete] CEP ${cepDestino} atendido pelo cache.`);
        return { ...emCache.resultado };
    }

    // 1. CEP (valida formato e cidade)
    const dadosCEP = await consultarCEP(cepDestino);

    // 2. Coordenadas do destino
    const { coordenadas, precisao } = await localizarDestino(dadosCEP);

    // 3. Distância real da rota
    const distanciaKm = await consultarRotaOSRM(
        COORDENADAS_ORIGEM,
        coordenadas
    );

    // 4. Valor
    const valorFrete = calcularValorFrete(distanciaKm);

    const resultado = {
        sucesso: true,
        cepOrigem: CEP_ORIGEM,
        cepDestino,
        distanciaKm,
        valorFrete,
        precisao,
        endereco: {
            estado: dadosCEP.estado,
            cidade: dadosCEP.cidade,
            bairro: dadosCEP.bairro,
            rua: dadosCEP.rua
        }
    };

    cacheFrete.set(cepDestino, {
        expira: Date.now() + CACHE_TTL_MS,
        resultado
    });

    console.log('[frete] Calculado:', {
        cepDestino,
        distanciaKm,
        valorFrete,
        precisao
    });

    return { ...resultado };
}


/* =====================================================
   7) TOKEN DE INTEGRIDADE DO FRETE

   O servidor assina (HMAC-SHA256) o resultado do cálculo.
   O navegador apenas guarda e devolve o token; se alterar
   qualquer valor, a assinatura deixa de conferir.
===================================================== */

function obterSegredo() {
    const segredo = process.env.FRETE_SECRET;

    if (!segredo || segredo.length < 16) {
        throw new Error(
            'FRETE_SECRET não configurado no .env (mínimo de 16 caracteres).'
        );
    }

    return segredo;
}

function assinar(conteudo) {
    return crypto
        .createHmac('sha256', obterSegredo())
        .update(conteudo)
        .digest('base64url');
}

function gerarTokenFrete({ cpf, cep, distanciaKm, valorFrete }) {
    const conteudo = Buffer.from(JSON.stringify({
        v: 1,
        cpf: String(cpf),
        cep: String(cep),
        km: distanciaKm,
        valor: valorFrete,
        exp: Date.now() + TOKEN_TTL_MS
    })).toString('base64url');

    return `${conteudo}.${assinar(conteudo)}`;
}

/*
 * Retorna { distanciaKm, valorFrete } se o token for autêntico,
 * não estiver expirado e pertencer a este cliente e a este CEP.
 * Caso contrário retorna null (o chamador deve recalcular).
 */
function validarTokenFrete(token, { cpf, cep }) {

    if (typeof token !== 'string' || token.length > 1000) {
        return null;
    }

    const partes = token.split('.');

    if (partes.length !== 2) {
        return null;
    }

    const [conteudo, assinatura] = partes;

    const esperada = Buffer.from(assinar(conteudo));
    const recebida = Buffer.from(assinatura);

    if (
        esperada.length !== recebida.length ||
        !crypto.timingSafeEqual(esperada, recebida)
    ) {
        return null;
    }

    let dados;

    try {
        dados = JSON.parse(Buffer.from(conteudo, 'base64url').toString());
    } catch (erro) {
        return null;
    }

    if (
        dados.v !== 1 ||
        !Number.isFinite(dados.exp) ||
        dados.exp < Date.now() ||
        dados.cpf !== String(cpf) ||
        dados.cep !== String(cep)
    ) {
        return null;
    }

    // Defesa extra: o valor precisa bater com a fórmula oficial
    if (
        !Number.isFinite(dados.km) ||
        calcularValorFrete(dados.km) !== dados.valor
    ) {
        return null;
    }

    return {
        distanciaKm: dados.km,
        valorFrete: dados.valor
    };
}

module.exports = {
    ErroFrete,
    ehCampoMourao,
    calcularValorFrete,
    calcularFrete,
    gerarTokenFrete,
    validarTokenFrete
};