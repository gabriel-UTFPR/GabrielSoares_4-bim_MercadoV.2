# Sistema Mercado V.2

Sistema web full-stack para gerenciamento de mercado/loja, desenvolvido como projeto acadêmico. Permite o cadastro e controle de pessoas (clientes e funcionários), produtos, categorias, fornecedores e cargos.

## 📋 Sumário

- [Tecnologias](#-tecnologias)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Modelo de Dados](#-modelo-de-dados)
- [Rotas da API](#-rotas-da-api)
- [Guia de Execução](#-guia-de-execução)

## 🛠 Tecnologias

- **Frontend:** HTML5, CSS3, JavaScript puro (Vanilla JS)
- **Backend:** Node.js + Express
- **Banco de Dados:** PostgreSQL
- **Outras libs:** `cors`, `dotenv`, `pg`

## 📁 Estrutura do Projeto

```
Mercado-V2/
├── backend/
│   ├── server.js              # Ponto de entrada da API
│   ├── database.js            # Configuração da conexão com o PostgreSQL (pool)
│   ├── .env                    # Variáveis de ambiente (não versionado)
│   ├── controllers/
│   │   ├── produtoController.js
│   │   ├── categoriaController.js
│   │   ├── cargoController.js
│   │   ├── fornecedorController.js
│   │   ├── clienteController.js
│   │   ├── funcionarioController.js
│   │   └── pessoaController.js
│   └── routes/
│       ├── produtoRoutes.js
│       ├── categoriaRoutes.js
│       ├── cargoRoutes.js
│       ├── fornecedorRoutes.js
│       ├── clienteRoutes.js
│       ├── funcionarioRoutes.js
│       └── pessoaRoutes.js
├── imagens/                     # Imagens de produtos (servidas estaticamente)
├── frontend/
│   ├── menu/
│   │   ├── menu.html
│   │   ├── menu.css
│   │   └── menu.js
│   ├── pessoa/
│   │   ├── pessoa.html
│   │   ├── pessoa.css
│   │   └── pessoa.js
│   ├── produto/
│   │   ├── produto.html
│   │   ├── produto.css
│   │   └── produto.js
│   ├── categoria/
│   │   ├── categoria.html
│   │   ├── categoria.css
│   │   └── categoria.js
│   ├── fornecedor/
│   │   ├── fornecedor.html
│   │   ├── fornecedor.css
│   │   └── fornecedor.js
│   └── cargo/
│       ├── cargo.html
│       ├── cargo.css
│       └── cargo.js
├── documentacao/
│   └── Banco Mercado V.1.sql    # Script DDL + dados iniciais (seed)
└── README.md
```


## 🗄 Modelo de Dados

O banco é composto por 7 tabelas. `pessoa` é a entidade central: `cliente` e `funcionario` são especializações de `pessoa` (relação 1:1 via chave estrangeira que também é chave primária), permitindo que uma mesma pessoa seja cliente, funcionário, ambos, ou nenhum dos dois.

```
erDiagram
    PESSOA ||--o| CLIENTE : "pode ser"
    PESSOA ||--o| FUNCIONARIO : "pode ser"
    CARGO ||--o{ FUNCIONARIO : "ocupa"
    CATEGORIA ||--o{ PRODUTO : "classifica"
    FORNECEDOR ||--o{ PRODUTO : "fornece"

    PESSOA {
        varchar cpf_pessoa PK
        varchar nome_pessoa
        date data_nascimento_pessoa
        varchar endereco_pessoa
        varchar email_pessoa UK
    }

    CLIENTE {
        varchar pessoa_cpf_pessoa PK_FK
        numeric renda_cliente
        date data_cadastro_cliente
    }

    FUNCIONARIO {
        varchar pessoa_cpf_pessoa PK_FK
        numeric salario_funcionario
        integer cargo_id_cargo FK
    }

    CARGO {
        serial id_cargo PK
        varchar nome_cargo
    }

    CATEGORIA {
        serial id_categoria PK
        varchar nome_categoria
    }

    FORNECEDOR {
        serial id_fornecedor PK
        varchar nome_fornecedor
        varchar cnpj
        varchar telefone
        varchar email
        varchar endereco
    }

    PRODUTO {
        serial id_produto PK
        varchar descricao
        numeric preco
        integer estoque
        integer id_categoria FK
        integer id_fornecedor FK
    }
```

### Descrição das tabelas

| Tabela | Chave primária | Descrição |
|---|---|---|
| `pessoa` | `cpf_pessoa` | Cadastro geral de pessoas físicas do sistema |
| `cliente` | `pessoa_cpf_pessoa` (FK → `pessoa`) | Dados adicionais de pessoas que são clientes |
| `funcionario` | `pessoa_cpf_pessoa` (FK → `pessoa`) | Dados adicionais de pessoas que são funcionários, vinculadas a um `cargo` |
| `cargo` | `id_cargo` | Cargos que um funcionário pode ocupar |
| `categoria` | `id_categoria` | Categorias de classificação de produtos |
| `fornecedor` | `id_fornecedor` | Fornecedores de produtos |
| `produto` | `id_produto` | Produtos do estoque, vinculados a uma categoria e a um fornecedor |

## 🔌 Rotas da API

Base URL padrão: `http://localhost:3001`

### Pessoa
| Método | Rota | Descrição |
|---|---|---|
| GET | `/pessoa` | Lista todas as pessoas |
| GET | `/pessoa/:cpf` | Busca uma pessoa pelo CPF |
| POST | `/pessoa` | Insere uma nova pessoa |
| PUT | `/pessoa/:cpf` | Altera uma pessoa existente |
| DELETE | `/pessoa/:cpf` | Exclui uma pessoa |

### Cliente
| Método | Rota | Descrição |
|---|---|---|
| GET | `/cliente/:cpf` | Verifica/busca dados de cliente de uma pessoa |
| POST | `/cliente` | Torna uma pessoa um cliente |
| PUT | `/cliente/:cpf` | Altera dados de cliente |
| DELETE | `/cliente/:cpf` | Remove o vínculo de cliente |

### Funcionário
| Método | Rota | Descrição |
|---|---|---|
| GET | `/funcionario/:cpf` | Verifica/busca dados de funcionário de uma pessoa |
| POST | `/funcionario` | Torna uma pessoa um funcionário |
| PUT | `/funcionario/:cpf` | Altera dados de funcionário |
| DELETE | `/funcionario/:cpf` | Remove o vínculo de funcionário |

### Cargo
| Método | Rota | Descrição |
|---|---|---|
| GET | `/cargo/listar` | Lista todos os cargos |
| GET | `/cargo/:id` | Busca um cargo pelo ID |
| POST | `/cargo` | Insere um novo cargo |
| PUT | `/cargo/:id` | Altera um cargo |
| DELETE | `/cargo/:id` | Exclui um cargo |

### Categoria
| Método | Rota | Descrição |
|---|---|---|
| GET | `/categoria/listar` | Lista todas as categorias |
| GET | `/categoria/:id` | Busca uma categoria pelo ID |
| POST | `/categoria` | Insere uma nova categoria |
| PUT | `/categoria/:id` | Altera uma categoria |
| DELETE | `/categoria/:id` | Exclui uma categoria |

### Fornecedor
| Método | Rota | Descrição |
|---|---|---|
| GET | `/fornecedor/listar` | Lista todos os fornecedores |
| GET | `/fornecedor/:id` | Busca um fornecedor pelo ID |
| POST | `/fornecedor` | Insere um novo fornecedor |
| PUT | `/fornecedor/:id` | Altera um fornecedor |
| DELETE | `/fornecedor/:id` | Exclui um fornecedor |

### Produto
| Método | Rota | Descrição |
|---|---|---|
| GET | `/produto/listar` | Lista todos os produtos |
| GET | `/produto/:id` | Busca um produto pelo ID |
| POST | `/produto` | Insere um novo produto |
| PUT | `/produto/:id` | Altera um produto |
| DELETE | `/produto/:id` | Exclui um produto |
| POST | `/produto/upload/:id` | Faz upload da imagem do produto (multipart/form-data) |

### Imagens
| Método | Rota | Descrição |
|---|---|---|
| GET | `/imagens/:arquivo` | Serve arquivos estáticos de imagem (produtos, ícones) |

Todas as respostas seguem o padrão `{ sucesso: boolean, mensagem?: string, ...dados }`.

## 🚀 Guia de Execução

### Pré-requisitos

- [Node.js](https://nodejs.org/) (v16+)
- [PostgreSQL](https://www.postgresql.org/) instalado e em execução

### 1. Clonar/baixar o projeto

```bash
git clone <url-do-repositorio>
cd mercado-v1
```

### 2. Criar o banco de dados

Crie um banco no PostgreSQL (ex: `mercado_v1`) e execute o script `documentacao/Banco Mercado V.1.sql` para criar as tabelas e popular os dados iniciais:

```bash
psql -U seu_usuario -d mercado_v1 -f documentacao/Banco Mercado V.1.sql
```

### 3. Configurar o backend

```bash
cd backend
npm install
```

Crie um arquivo `.env` dentro da pasta `backend/` com as credenciais do banco:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mercado_v1
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
PORT=3001
```

### 4. Iniciar o servidor

```bash
node server.js
```

Se tudo estiver correto, o console exibirá:

```
🚀 Servidor executando na porta 3001
✅ Banco de Dados conectado com sucesso!
```

### 5. Abrir o frontend

Com o backend em execução, abra o arquivo `frontend/menu.html` no navegador (recomenda-se usar uma extensão como o *Live Server* do VS Code para evitar problemas de CORS com `file://`). A partir do menu principal é possível navegar para os módulos de Produtos, Pessoas, Categorias, Fornecedores e Cargos.

### Fluxo de uso do módulo Pessoa

1. Informe um CPF e clique em **Buscar**.
2. Se não encontrado, clique em **Incluir** para cadastrar uma nova pessoa.
3. Marque as caixas **Funcionário** e/ou **Cliente** para vincular esses papéis à pessoa, preenchendo os campos correspondentes (cargo/salário ou renda/data de cadastro).
4. Clique em **Salvar** para confirmar a operação.


## Observação sobre a versão atual

Esta adaptação reorganiza a estrutura dos arquivos existentes. O código enviado contém CRUDs de pessoa, produto, categoria, fornecedor, cargo e unidade de medida. As áreas de login, cliente, gerente, carrinho e pedidos ainda precisam ser implementadas e integradas ao banco da versão atual; elas não foram simuladas nesta reorganização.

O arquivo SQL preservado é o banco identificado no projeto enviado como **Mercado V.1**. Antes de utilizá-lo como banco do Mercado V.2, confira se ele corresponde ao modelo de dados mais recente.
