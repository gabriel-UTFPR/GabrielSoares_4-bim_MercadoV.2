-- Necessário para gerar hashes de senha nos dados de demonstração.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ATENÇÃO: este script recria o banco de demonstração e apaga as tabelas listadas abaixo.
-- Não execute em um banco com dados importantes sem fazer backup.
DROP TABLE IF EXISTS
    public.recuperacao_senha,
    public.item_pedido,
    public.pedido,
    public.funcionario,
    public.cliente,
    public.produto,
    public.unidade_medida,
    public.fornecedor,
    public.categoria,
    public.cargo,
    public.pessoa
CASCADE;
CREATE TABLE public.pessoa (
    cpf_pessoa VARCHAR(14) PRIMARY KEY,
    nome_pessoa  VARCHAR(100) not null,
    data_nascimento_pessoa  DATE not null,
	endereco_pessoa varchar(150) not null,
	email_pessoa varchar(100) not null,
    senha_hash VARCHAR(255),
	constraint pessoa_unique unique(email_pessoa)
);

CREATE TABLE public.cargo (
    id_cargo SERIAL PRIMARY KEY,
    nome_cargo VARCHAR(50) not null
);

CREATE TABLE public.categoria (
    id_categoria SERIAL PRIMARY KEY,
    nome_categoria VARCHAR(50) not null
);

CREATE TABLE public.unidade_medida (
    id_unidade_medida VARCHAR(2) PRIMARY KEY,
    nome_unidade_medida VARCHAR(50) NOT NULL
);

CREATE TABLE public.fornecedor (
    id_fornecedor SERIAL PRIMARY KEY,
    nome_fornecedor VARCHAR(100) not null,
    cnpj VARCHAR(18) not null,
    telefone VARCHAR(20) not null,
    email VARCHAR(100)not null,
    endereco VARCHAR(150) not null
);

CREATE TABLE public.cliente (
    pessoa_cpf_pessoa VARCHAR(14) PRIMARY KEY,
    renda_cliente NUMERIC(10,2) not null,
    data_cadastro_cliente DATE not null,
    FOREIGN KEY (pessoa_cpf_pessoa)
    REFERENCES public.pessoa(cpf_pessoa)
);

CREATE TABLE public.funcionario (
    pessoa_cpf_pessoa VARCHAR(14) PRIMARY KEY,
    salario_funcionario NUMERIC(10,2) not null,
    cargo_id_cargo INTEGER not null,

    FOREIGN KEY (pessoa_cpf_pessoa)
        REFERENCES public.pessoa(cpf_pessoa),

    FOREIGN KEY (cargo_id_cargo)
        REFERENCES public.cargo(id_cargo)
);

CREATE TABLE public.produto (
    id_produto serial PRIMARY KEY,
    descricao VARCHAR(100) not null,
    preco NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
    estoque NUMERIC(10,3) NOT NULL CHECK (estoque >= 0),
    id_categoria INTEGER not null,
    id_fornecedor INTEGER NOT NULL,
    id_unidade_medida VARCHAR(2) NOT NULL,

    CONSTRAINT produtos_categoria_fk FOREIGN KEY (id_categoria)
        REFERENCES public.categoria(id_categoria),

    CONSTRAINT produtos_fornecedor_fk FOREIGN KEY (id_fornecedor)
        REFERENCES public.fornecedor(id_fornecedor),

	CONSTRAINT produtos_unidade_medida_fk
    FOREIGN KEY (id_unidade_medida)
    REFERENCES public.unidade_medida(id_unidade_medida)
);


-- Pedido: pertence a um cliente e mantém o total e a situação da compra.
CREATE TABLE public.pedido (
    id_pedido SERIAL PRIMARY KEY,
    cliente_cpf VARCHAR(14) NOT NULL,
    data_pedido TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_pedido VARCHAR(30) NOT NULL DEFAULT 'CARRINHO'
        CHECK (status_pedido IN (
            'CARRINHO',
            'AGUARDANDO_PAGAMENTO',
            'PAGO',
            'CANCELADO',
            'FINALIZADO'
        )),
    valor_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),

    CONSTRAINT pedido_cliente_fk
        FOREIGN KEY (cliente_cpf)
        REFERENCES public.cliente(pessoa_cpf_pessoa)
        ON DELETE RESTRICT
);

-- Itens do pedido. O preço e a descrição são copiados no momento da compra
-- para preservar o histórico mesmo que o cadastro do produto mude depois.
CREATE TABLE public.item_pedido (
    id_item_pedido SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER,
    descricao_produto VARCHAR(100) NOT NULL,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),

    CONSTRAINT item_pedido_pedido_fk
        FOREIGN KEY (pedido_id)
        REFERENCES public.pedido(id_pedido)
        ON DELETE CASCADE,

    CONSTRAINT item_pedido_produto_fk
        FOREIGN KEY (produto_id)
        REFERENCES public.produto(id_produto)
        ON DELETE SET NULL
);

-- Recuperação de senha: armazenar somente o hash do token, nunca o token original.
CREATE TABLE public.recuperacao_senha (
    id_recuperacao SERIAL PRIMARY KEY,
    pessoa_cpf VARCHAR(14) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_expiracao TIMESTAMP NOT NULL,
    data_utilizacao TIMESTAMP,

    CONSTRAINT recuperacao_senha_pessoa_fk
        FOREIGN KEY (pessoa_cpf)
        REFERENCES public.pessoa(cpf_pessoa)
        ON DELETE CASCADE,

    CONSTRAINT recuperacao_senha_expiracao_ck
        CHECK (data_expiracao > data_criacao)
);

CREATE INDEX pedido_cliente_idx ON public.pedido(cliente_cpf);
CREATE INDEX pedido_data_idx ON public.pedido(data_pedido);
CREATE INDEX item_pedido_pedido_idx ON public.item_pedido(pedido_id);
CREATE INDEX recuperacao_senha_pessoa_idx ON public.recuperacao_senha(pessoa_cpf);


-- O carrinho é representado por um pedido com status CARRINHO.
-- Por isso, não existem triggers nem referências às antigas tabelas carrinho/item_carrinho.

-- Valida cada item do pedido quando ele é cadastrado.
CREATE OR REPLACE FUNCTION public.validar_estoque_item_pedido()
RETURNS TRIGGER AS $$
DECLARE
    estoque_atual NUMERIC(10,3);
BEGIN
    IF NEW.produto_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT estoque INTO estoque_atual
    FROM public.produto
    WHERE id_produto = NEW.produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto % não encontrado.', NEW.produto_id;
    END IF;

    IF NEW.quantidade > estoque_atual THEN
        RAISE EXCEPTION 'Estoque insuficiente para o produto %. Disponível: %, solicitado: %.',
            NEW.produto_id, estoque_atual, NEW.quantidade;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_pedido_validar_estoque
BEFORE INSERT OR UPDATE OF quantidade, produto_id
ON public.item_pedido
FOR EACH ROW
EXECUTE FUNCTION public.validar_estoque_item_pedido();

-- Ao marcar o pedido como Pago, verifica o total de cada produto no pedido
-- e baixa o estoque uma única vez. Se não houver estoque, a alteração falha.
CREATE OR REPLACE FUNCTION public.baixar_estoque_ao_pagar_pedido()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    estoque_atual NUMERIC(10,3);
BEGIN
    IF NEW.status_pedido = 'PAGO'
       AND OLD.status_pedido IS DISTINCT FROM 'PAGO' THEN
        FOR item IN
            SELECT produto_id, SUM(quantidade)::NUMERIC(10,3) AS quantidade_total
            FROM public.item_pedido
            WHERE pedido_id = NEW.id_pedido
              AND produto_id IS NOT NULL
            GROUP BY produto_id
            ORDER BY produto_id
        LOOP
            SELECT estoque INTO estoque_atual
            FROM public.produto
            WHERE id_produto = item.produto_id
            FOR UPDATE;

            IF NOT FOUND OR estoque_atual < item.quantidade_total THEN
                RAISE EXCEPTION 'Estoque insuficiente para o produto %. Disponível: %, solicitado no pedido: %.',
                    item.produto_id, COALESCE(estoque_atual, 0), item.quantidade_total;
            END IF;
        END LOOP;

        UPDATE public.produto p
        SET estoque = p.estoque - itens.quantidade_total
        FROM (
            SELECT produto_id, SUM(quantidade)::NUMERIC(10,3) AS quantidade_total
            FROM public.item_pedido
            WHERE pedido_id = NEW.id_pedido
              AND produto_id IS NOT NULL
            GROUP BY produto_id
        ) AS itens
        WHERE p.id_produto = itens.produto_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pedido_baixar_estoque_ao_pagar
BEFORE UPDATE OF status_pedido
ON public.pedido
FOR EACH ROW
EXECUTE FUNCTION public.baixar_estoque_ao_pagar_pedido();

-- Recalcula automaticamente o valor_total do pedido sempre que seus itens
-- são inseridos, alterados ou removidos (soma de quantidade * preco_unitario).
CREATE OR REPLACE FUNCTION public.atualizar_valor_total_pedido()
RETURNS TRIGGER AS $$
DECLARE
    pedido_afetado INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        pedido_afetado := OLD.pedido_id;
    ELSE
        pedido_afetado := NEW.pedido_id;
    END IF;

    UPDATE public.pedido
    SET valor_total = COALESCE((
        SELECT SUM(quantidade * preco_unitario)
        FROM public.item_pedido
        WHERE pedido_id = pedido_afetado
    ), 0)
    WHERE id_pedido = pedido_afetado;

    -- Se o item foi movido para outro pedido, recalcula também o pedido antigo.
    IF TG_OP = 'UPDATE' AND OLD.pedido_id IS DISTINCT FROM NEW.pedido_id THEN
        UPDATE public.pedido
        SET valor_total = COALESCE((
            SELECT SUM(quantidade * preco_unitario)
            FROM public.item_pedido
            WHERE pedido_id = OLD.pedido_id
        ), 0)
        WHERE id_pedido = OLD.pedido_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_pedido_atualizar_valor_total
AFTER INSERT OR DELETE OR UPDATE OF quantidade, preco_unitario, pedido_id
ON public.item_pedido
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_valor_total_pedido();

-- Ao cancelar um pedido que já tinha baixado o estoque (Pago, Em separacao,
-- Enviado ou Entregue), devolve ao estoque a quantidade de cada produto.
CREATE OR REPLACE FUNCTION public.devolver_estoque_ao_cancelar_pedido()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status_pedido = 'CANCELADO'
       AND OLD.status_pedido IN ('PAGO', 'FINALIZADO') THEN
        UPDATE public.produto p
        SET estoque = p.estoque + itens.quantidade_total
        FROM (
            SELECT produto_id, SUM(quantidade)::NUMERIC(10,3) AS quantidade_total
            FROM public.item_pedido
            WHERE pedido_id = NEW.id_pedido
              AND produto_id IS NOT NULL
            GROUP BY produto_id
        ) AS itens
        WHERE p.id_produto = itens.produto_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pedido_devolver_estoque_ao_cancelar
AFTER UPDATE OF status_pedido
ON public.pedido
FOR EACH ROW
EXECUTE FUNCTION public.devolver_estoque_ao_cancelar_pedido();

--inserts

--Pessoas
-- Senha provisória de TODAS as contas de demonstração: Mercado123!
-- O banco armazena somente o hash bcrypt gerado por pgcrypto, não a senha em texto puro.
-- Troque essas credenciais antes de qualquer uso real.
INSERT INTO public.pessoa
(cpf_pessoa, nome_pessoa, data_nascimento_pessoa, endereco_pessoa, email_pessoa, senha_hash)
VALUES
('11111111101', 'Gabriel Silva', '2008-03-15', 'Rua das Flores, 100', 'gabriel@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('22222222202', 'João Oliveira', '2007-07-22', 'Rua Paraná, 200', 'joao@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('33333333303', 'Maria Santos', '1995-01-10', 'Rua Brasil, 300', 'maria@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('44444444404', 'Carlos Pereira', '1988-11-05', 'Av. Central, 400', 'carlos@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('55555555505', 'Ana Souza', '1992-06-18', 'Rua São Paulo, 500', 'ana@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('66666666606', 'Pedro Costa', '1990-09-30', 'Rua Paraná, 600', 'pedro@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('77777777707', 'Julia Martins', '1998-02-14', 'Rua das Palmeiras, 700', 'julia@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('88888888808', 'Lucas Almeida', '1985-12-01', 'Av. Brasil, 800', 'lucas@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('99999999909', 'Fernanda Lima', '1996-04-25', 'Rua das Acácias, 900', 'fernanda@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('12345678910', 'Rafael Gomes', '1982-08-12', 'Rua Paraná, 1000', 'rafael@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('23456789011', 'Beatriz Rocha', '2001-03-20', 'Rua Central, 1100', 'beatriz@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('34567890112', 'Mateus Ribeiro', '1999-05-11', 'Av. Brasil, 1200', 'mateus@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('45678901213', 'Larissa Mendes', '2000-10-07', 'Rua das Flores, 1300', 'larissa@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('56789012314', 'Diego Barbosa', '1994-01-29', 'Rua Paraná, 1400', 'diego@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('67890123415', 'Camila Ferreira', '1997-08-16', 'Av. Central, 1500', 'camila@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('78901234516', 'Andre Carvalho', '1993-12-09', 'Rua Brasil, 1600', 'andre@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('89012345617', 'Isabela Dias', '2002-06-02', 'Rua das Palmeiras, 1700', 'isabela@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('90123456718', 'Thiago Nunes', '1991-04-19', 'Rua Central, 1800', 'thiago@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('11234567819', 'Mariana Castro', '1998-09-23', 'Av. Brasil, 1900', 'mariana@email.com', crypt('Mercado123!', gen_salt('bf', 10))),
('19876543220', 'Eduardo Teixeira', '1989-07-14', 'Rua Paraná, 2000', 'eduardo@email.com', crypt('Mercado123!', gen_salt('bf', 10)));
--cargos
INSERT INTO public.cargo (nome_cargo)
VALUES
('Gerente'),
('Operador de Caixa'),
('Repositor'),
('Auxiliar de Limpeza'),
('Fiscal de Loja'),
('Açougueiro'),
('Padeiro'),
('Estoquista'),
('Auxiliar Administrativo'),
('Supervisor');

--categorias
INSERT INTO public.categoria (nome_categoria)
VALUES
('Bebidas'),
('Higiene Pessoal'),
('Limpeza'),
('Hortifruti'),
('Perecíveis'),
('Mercearia'),
('Padaria'),
('Congelados'),
('Pet Shop'),
('Bebidas Alcoólicas');

--fornecedores

INSERT INTO public.fornecedor
(nome_fornecedor, cnpj, telefone, email, endereco)
VALUES
('Distribuidora Alimentos Brasil', '12.345.678/0001-01', '(44) 99999-0001', 'contato@alimentosbrasil.com', 'Rua das Flores, 100'),
('Bebidas Paraná', '23.456.789/0001-02', '(44) 99999-0002', 'vendas@bebidaspr.com', 'Av. Brasil, 200'),
('Higiene Total', '34.567.890/0001-03', '(44) 99999-0003', 'contato@higienetotal.com', 'Rua Central, 300'),
('Limpeza Forte', '45.678.901/0001-04', '(44) 99999-0004', 'vendas@limpezaforte.com', 'Rua Paraná, 400'),
('Hortifruti Verde', '56.789.012/0001-05', '(44) 99999-0005', 'contato@hortiverde.com', 'Estrada Rural, 500'),
('Maria Macia Cooperativa', '67.890.123/0001-06', '(44) 99999-0006', 'contato@mariamacia.com', 'Rua Cooperativa, 600'),
('Padaria do Campo', '78.901.234/0001-07', '(44) 99999-0007', 'vendas@padariadocampo.com', 'Rua do Pão, 700'),
('Congelados Paraná', '89.012.345/0001-08', '(44) 99999-0008', 'contato@congeladospr.com', 'Rua Industrial, 800'),
('Pet Alimentos', '90.123.456/0001-09', '(44) 99999-0009', 'vendas@petalimentos.com', 'Rua dos Animais, 900'),
('Importadora Nacional', '01.234.567/0001-10', '(44) 99999-0010', 'contato@importnacional.com', 'Av. das Nações, 1000');

--clientes

INSERT INTO public.cliente
(pessoa_cpf_pessoa, renda_cliente, data_cadastro_cliente)
VALUES
('11111111101', 2500.00, '2026-09-01'),
('22222222202', 3200.00, '2026-09-01'),
('33333333303', 1800.00, '2026-09-02'),
('44444444404', 4500.00, '2026-09-02'),
('55555555505', 2100.00, '2026-09-03'),
('66666666606', 3800.00, '2026-09-03'),
('77777777707', 2900.00, '2026-09-04'),
('88888888808', 5100.00, '2026-09-04'),
('99999999909', 1700.00, '2026-09-05'),
('12345678910', 6000.00, '2026-09-05');

--funcionario
INSERT INTO public.funcionario
(pessoa_cpf_pessoa, salario_funcionario, cargo_id_cargo)
VALUES
('23456789011', 4500.00, 1),
('34567890112', 2100.00, 2),
('45678901213', 1900.00, 3),
('56789012314', 1800.00, 4),
('67890123415', 2300.00, 5),
('78901234516', 2800.00, 6),
('89012345617', 2500.00, 7),
('90123456718', 2200.00, 8),
('11234567819', 3000.00, 9),
('19876543220', 3500.00, 10);
--unidades de medida
INSERT INTO public.unidade_medida (id_unidade_medida, nome_unidade_medida)
VALUES
('UN', 'Unidade'),
('KG', 'Quilograma'),
('L', 'Litro'),
('ML', 'Mililitro'),
('PC', 'Pacote');

--produtos
INSERT INTO public.produto
(id_produto, descricao, preco, estoque, id_categoria, id_fornecedor, id_unidade_medida)
VALUES
(1, 'Arroz Tipo 1 5kg', 28.90, 50, 6, 1, 'PC'),
(2, 'Refrigerante Cola 2L', 9.50, 80, 1, 2, 'UN'),
(3, 'Sabonete 90g', 3.50, 120, 2, 3, 'UN'),
(4, 'Detergente 500ml', 2.99, 100, 3, 4, 'UN'),
(5, 'Banana Prata 1kg', 6.99, 40, 4, 5, 'KG'),
(6, 'Carne Bovina 1kg', 39.90, 30, 5, 6, 'KG'),
(7, 'Pão Francês 1kg', 14.90, 60, 7, 7, 'KG'),
(8, 'Pizza Congelada', 18.90, 45, 8, 8, 'UN'),
(9, 'Ração para Cães 10kg', 89.90, 25, 9, 9, 'PC'),
(10, 'Vinho Tinto 750ml', 35.90, 20, 10, 10, 'UN'),
(11, 'Feijao Carioca 1kg', 8.49, 70, 6, 1, 'PC'),
(12, 'Oleo de Soja 900ml', 6.79, 90, 6, 1, 'UN'),
(13, 'Leite Integral 1L', 5.29, 85, 5, 1, 'UN'),
(14, 'Maçã Gala', 9.99, 35, 4, 5, 'KG'),
(15, 'Tomate Italiano', 7.49, 45, 4, 5, 'KG'),
(16, 'Cafe Torrado 500g', 16.90, 55, 6, 1, 'PC'),
(17, 'Creme Dental 90g', 4.99, 100, 2, 3, 'UN'),
(18, 'Agua Sanitaria 2L', 7.90, 60, 3, 4, 'UN'),
(19, 'Ervilha Congelada 300g', 8.50, 40, 8, 8, 'PC'),
(20, 'Racao para Gatos 1kg', 21.90, 30, 9, 9, 'PC');

-- =========================================
-- INSERTS NA TABELA PEDIDO
-- =========================================

INSERT INTO public.pedido
(cliente_cpf, data_pedido, status_pedido)
SELECT '11111111101', '2026-11-06 10:00:00', 'AGUARDANDO_PAGAMENTO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedido
    WHERE cliente_cpf = '11111111101'
      AND data_pedido = '2026-11-06 10:00:00'
);

INSERT INTO public.pedido
(cliente_cpf, data_pedido, status_pedido)
SELECT '22222222202', '2026-11-06 11:00:00', 'PAGO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedido
    WHERE cliente_cpf = '22222222202'
      AND data_pedido = '2026-11-06 11:00:00'
);

INSERT INTO public.pedido
(cliente_cpf, data_pedido, status_pedido)
SELECT '33333333303', '2026-11-06 12:00:00', 'FINALIZADO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedido
    WHERE cliente_cpf = '33333333303'
      AND data_pedido = '2026-11-06 12:00:00'
);

INSERT INTO public.pedido
(cliente_cpf, data_pedido, status_pedido)
SELECT '44444444404', '2026-11-06 13:00:00', 'CANCELADO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedido
    WHERE cliente_cpf = '44444444404'
      AND data_pedido = '2026-11-06 13:00:00'
);

INSERT INTO public.pedido
(cliente_cpf, data_pedido, status_pedido)
SELECT '55555555505', '2026-11-06 14:00:00', 'CARRINHO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedido
    WHERE cliente_cpf = '55555555505'
      AND data_pedido = '2026-11-06 14:00:00'
);

-- =========================================
-- INSERTS NA TABELA ITEM_PEDIDO
-- =========================================

-- PEDIDO 1: AGUARDANDO_PAGAMENTO
INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 1, 'Arroz Tipo 1 5kg', 2, 28.90
FROM public.pedido p
WHERE p.cliente_cpf = '11111111101'
  AND p.data_pedido = '2026-11-06 10:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 1
  );


INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 5, 'Banana Prata 1kg', 1, 6.99
FROM public.pedido p
WHERE p.cliente_cpf = '11111111101'
  AND p.data_pedido = '2026-11-06 10:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 5
  );


-- PEDIDO 2: PAGO
INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 2, 'Refrigerante Cola 2L', 2, 9.50
FROM public.pedido p
WHERE p.cliente_cpf = '22222222202'
  AND p.data_pedido = '2026-11-06 11:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 2
  );


INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 3, 'Sabonete 90g', 3, 3.50
FROM public.pedido p
WHERE p.cliente_cpf = '22222222202'
  AND p.data_pedido = '2026-11-06 11:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 3
  );


-- PEDIDO 3: FINALIZADO
INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 6, 'Carne Bovina 1kg', 1, 39.90
FROM public.pedido p
WHERE p.cliente_cpf = '33333333303'
  AND p.data_pedido = '2026-11-06 12:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 6
  );


INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 7, 'Pao Frances 1kg', 2, 14.90
FROM public.pedido p
WHERE p.cliente_cpf = '33333333303'
  AND p.data_pedido = '2026-11-06 12:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 7
  );


-- PEDIDO 4: CANCELADO
INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 11, 'Feijao Carioca 1kg', 2, 8.49
FROM public.pedido p
WHERE p.cliente_cpf = '44444444404'
  AND p.data_pedido = '2026-11-06 13:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 11
  );


INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 14, 'Maca Gala', 1, 9.99
FROM public.pedido p
WHERE p.cliente_cpf = '44444444404'
  AND p.data_pedido = '2026-11-06 13:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 14
  );


-- PEDIDO 5: CARRINHO
INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 16, 'Cafe Torrado 500g', 1, 16.90
FROM public.pedido p
WHERE p.cliente_cpf = '55555555505'
  AND p.data_pedido = '2026-11-06 14:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 16
  );


INSERT INTO public.item_pedido
(pedido_id, produto_id, descricao_produto, quantidade, preco_unitario)
SELECT p.id_pedido, 17, 'Creme Dental 90g', 2, 4.99
FROM public.pedido p
WHERE p.cliente_cpf = '55555555505'
  AND p.data_pedido = '2026-11-06 14:00:00'
  AND NOT EXISTS (
      SELECT 1 FROM public.item_pedido i
      WHERE i.pedido_id = p.id_pedido
        AND i.produto_id = 17
  );
select * from public.item_pedido order by pedido_id;
-- Sincroniza as sequências SERIAL após os INSERTs com IDs explícitos.
SELECT setval(pg_get_serial_sequence('public.cargo', 'id_cargo'), COALESCE((SELECT MAX(id_cargo) FROM public.cargo), 1), EXISTS (SELECT 1 FROM public.cargo));
SELECT setval(pg_get_serial_sequence('public.categoria', 'id_categoria'), COALESCE((SELECT MAX(id_categoria) FROM public.categoria), 1), EXISTS (SELECT 1 FROM public.categoria));
SELECT setval(pg_get_serial_sequence('public.fornecedor', 'id_fornecedor'), COALESCE((SELECT MAX(id_fornecedor) FROM public.fornecedor), 1), EXISTS (SELECT 1 FROM public.fornecedor));
SELECT setval(pg_get_serial_sequence('public.produto', 'id_produto'), COALESCE((SELECT MAX(id_produto) FROM public.produto), 1), EXISTS (SELECT 1 FROM public.produto));
SELECT setval(pg_get_serial_sequence('public.pedido', 'id_pedido'), COALESCE((SELECT MAX(id_pedido) FROM public.pedido), 1), EXISTS (SELECT 1 FROM public.pedido));
SELECT setval(pg_get_serial_sequence('public.item_pedido', 'id_item_pedido'), COALESCE((SELECT MAX(id_item_pedido) FROM public.item_pedido), 1), EXISTS (SELECT 1 FROM public.item_pedido));
SELECT setval(pg_get_serial_sequence('public.recuperacao_senha', 'id_recuperacao'), COALESCE((SELECT MAX(id_recuperacao) FROM public.recuperacao_senha), 1), EXISTS (SELECT 1 FROM public.recuperacao_senha));

