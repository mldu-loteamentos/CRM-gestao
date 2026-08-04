// Banco de dados Mockado - Moura Leite Loteamentos (Simulação de Retorno do ERP Sienge)

const MOCK_COMPANIES = [
  { id: 1, name: "MOURA LEITE DESENVOLVIMENTO E URBANIZAÇÃO LTDA" },
  { id: 2, name: "EMPREENDIMENTOS IMOBILIARIOS CHACARA MOURA LEITE" },
  { id: 3, name: "TERRA DO ARAÇARI EMPREENDIMENTOS IMOBILIARIOS LTDA" },
  { id: 4, name: "TERRAS DE ITU EMPREENDIMENTOS & PARTICIPAÇÕES LTDA" },
  { id: 5, name: "MLES EMPREENDIMENTO IMOBILIARIO SPE LTDA" },
  { id: 6, name: "ARAÇARI EMPREENDIMENTO IMOBILIÁRIO SPE LTDA" },
  { id: 13, name: "Moura Leite Desenvolvimento Urbano - Empresa 13" }
];

const MOCK_COST_CENTERS = [
  { id: "10100", name: "CHÁCARA MOURA LEITE", companyId: 2, city: "Cerqueira César" },
  { id: "10200", name: "JARDIM PRIMAVERA", companyId: 2, city: "Cerqueira César" },
  { id: "10300", name: "JARDIM PRIMAVERA III", companyId: 2, city: "Cerqueira César" },
  { id: "10400", name: "JARDIM PRIMAVERA", companyId: 1, city: "Taguai" },
  { id: "10500", name: "TRÊS RANCHOS I", companyId: 1, city: "Cerqueira César" },
  { id: "10600", name: "TRÊS RANCHOS II", companyId: 1, city: "Cerqueira César" },
  { id: "10700", name: "TRÊS RANCHOS III", companyId: 1, city: "Cerqueira César" },
  { id: "13700", name: "Residencial Avaré I - Fase A", companyId: 1, city: "Avaré" },
  { id: "13800", name: "Residencial Avaré I - Fase B", companyId: 1, city: "Avaré" },
  { id: "13900", name: "Residencial Avaré II - Fase A", companyId: 1, city: "Avaré" },
  { id: "14000", name: "Residencial Avaré II - Fase B", companyId: 1, city: "Avaré" },
  { id: "20100", name: "Residencial Bella Vista", companyId: 2, city: "Botucatu" },
  { id: "20200", name: "Jardim das Palmeiras", companyId: 2, city: "Avaré" },
  { id: "60100", name: "Residencial Moura Leite 6", companyId: 6, city: "Cerqueira César" },
  { id: "130100", name: "Residencial Moura Leite 13", companyId: 13, city: "Bauru" }
];

const MOCK_UNITS = {
  "U-13700-Q01-L01": { id: "U-13700-Q01-L01", costCenterId: "13700", block: "Q01", lot: "L01", area: 250, status: "Vendido" },
  "U-13700-Q02-L15": { id: "U-13700-Q02-L15", costCenterId: "13700", block: "Q02", lot: "L15", area: 300, status: "Vendido" },
  "U-13800-Q05-L10": { id: "U-13800-Q05-L10", costCenterId: "13800", block: "Q05", lot: "L10", area: 280, status: "Vendido" },
  "U-13900-QA-L04": { id: "U-13900-QA-L04", costCenterId: "13900", block: "QA", lot: "L04", area: 260, status: "Vendido" },
  "U-14000-QB-L08": { id: "U-14000-QB-L08", costCenterId: "14000", block: "QB", lot: "L08", area: 275, status: "Vendido" },
  "U-20100-Q10-L12": { id: "U-20100-Q10-L12", costCenterId: "20100", block: "Q10", lot: "L12", area: 320, status: "Vendido" },
  "U-20200-Q03-L22": { id: "U-20200-Q03-L22", costCenterId: "20200", block: "Q03", lot: "L22", area: 240, status: "Vendido" },
  "U-60100-Q01-L30": { id: "U-60100-Q01-L30", costCenterId: "60100", block: "Q01", lot: "L30", area: 350, status: "Vendido" },
  "U-130100-Q12-L11": { id: "U-130100-Q12-L11", costCenterId: "130100", block: "Q12", lot: "L11", area: 290, status: "Vendido" },
  "U-20100-Q04-L05": { id: "U-20100-Q04-L05", costCenterId: "20100", block: "Q04", lot: "L05", area: 250, status: "Vendido" },
  "U-20200-Q08-L09": { id: "U-20200-Q08-L09", costCenterId: "20200", block: "Q08", lot: "L09", area: 260, status: "Vendido" },
  "U-20100-Q09-L44": { id: "U-20100-Q09-L44", costCenterId: "20100", block: "Q09", lot: "L44", area: 310, status: "Vendido" }
};

const MOCK_CUSTOMERS = {
  "1": {
    id: 1,
    name: "Carlos Alberto de Souza",
    cpfCnpj: "123.456.789-01",
    email: "carlos.souza@gmail.com",
    phone: "(14) 99876-5432",
    birthDate: "1978-05-15",
    address: "Rua das Flores, 120, Avaré - SP",
    subtypes: ["Parceiro"]
  },
  "2": {
    id: 2,
    name: "Mariana Costa Oliveira",
    cpfCnpj: "987.654.321-09",
    email: "mariana.costa@outlook.com",
    phone: "(14) 99765-4321",
    birthDate: "1985-11-23",
    address: "Av. Major Rangel, 540, Avaré - SP",
    subtypes: ["Falecido"]
  },
  "3": {
    id: 3,
    name: "Loteamentos Parceria EIRELI",
    cpfCnpj: "12.345.678/0001-99",
    email: "financeiro@parceria.com.br",
    phone: "(11) 3210-9876",
    birthDate: "2012-04-10",
    address: "Av. Paulista, 1000, 12º andar, São Paulo - SP"
  },
  "4": {
    id: 4,
    name: "Reginaldo da Silva Cordeiro",
    cpfCnpj: "456.789.012-34",
    email: "reginaldo.silva@yahoo.com.br",
    phone: "(14) 99123-4567",
    birthDate: "1966-07-30",
    address: "Rua Bahia, 1280, Avaré - SP"
  },
  "5": {
    id: 5,
    name: "Beatriz Helena Marques",
    cpfCnpj: "789.012.345-67",
    email: "beatriz.marques@gmail.com",
    phone: "(15) 99654-3210",
    birthDate: "1992-09-02",
    address: "Rua XV de Novembro, 45, Cerqueira César - SP"
  },
  "6": {
    id: 6,
    name: "Douglas Pereira Santos",
    cpfCnpj: "234.567.890-12",
    email: "douglas.pereira@hotmail.com",
    phone: "(14) 99345-6789",
    birthDate: "1989-12-14",
    address: "Av. Itália, 98, Botucatu - SP"
  },
  "7": {
    id: 7,
    name: "Sandra Mara de Almeida",
    cpfCnpj: "345.678.901-23",
    email: "sandra.mara@outlook.com",
    phone: "(14) 98877-6655",
    birthDate: "1973-03-25",
    address: "Rua Mato Grosso, 310, Avaré - SP"
  },
  "8": {
    id: 8,
    name: "Wellington Alves de Oliveira",
    cpfCnpj: "567.890.123-45",
    email: "wellington.alves@gmail.com",
    phone: "(14) 98111-2222",
    birthDate: "1995-01-18",
    address: "Rua Pará, 1500, Avaré - SP"
  },
  "9": {
    id: 9,
    name: "Imobiliária Moura Leite Parceira",
    cpfCnpj: "99.888.777/0001-66",
    email: "contato@imobiliariamoura.com.br",
    phone: "(14) 3732-1010",
    birthDate: "2015-08-20",
    address: "Rua Pernambuco, 330, Avaré - SP"
  },
  "10": {
    id: 10,
    name: "Antônio Carlos Figueiredo",
    cpfCnpj: "678.901.234-56",
    email: "ac.figueiredo@gmail.com",
    phone: "(14) 98777-8888",
    birthDate: "1954-10-05",
    address: "Rua Maranhão, 250, Avaré - SP"
  }
};

const MOCK_SALES = [
  {
    id: 101,
    customerId: 1,
    unitId: "U-13700-Q01-L01",
    saleDate: "2018-05-10",
    contractValue: 120000.00,
    updatedContractValue: 155000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.45,
    lastPaymentDate: "2026-04-20",
    status: "Ativo"
  },
  {
    id: 102,
    customerId: 2,
    unitId: "U-13700-Q02-L15",
    saleDate: "2020-08-15",
    contractValue: 180000.00,
    updatedContractValue: 210000.00,
    interestRate: 0.008,
    subjudice: "N",
    percPaid: 0.00,
    lastPaymentDate: null,
    status: "Ativo"
  },
  {
    id: 103,
    customerId: 3,
    unitId: "U-20100-Q10-L12",
    saleDate: "2021-02-22",
    contractValue: 250000.00,
    updatedContractValue: 290000.00,
    interestRate: 0.01,
    subjudice: "S",
    percPaid: 0.15,
    lastPaymentDate: "2025-10-15",
    status: "Ativo"
  },
  {
    id: 104,
    customerId: 4,
    unitId: "U-60100-Q01-L30",
    saleDate: "2019-10-11",
    contractValue: 140000.00,
    updatedContractValue: 165000.00,
    interestRate: 0.009,
    subjudice: "N",
    percPaid: 0.30,
    lastPaymentDate: "2026-03-05",
    status: "Ativo"
  },
  {
    id: 105,
    customerId: 5,
    unitId: "U-130100-Q12-L11",
    saleDate: "2022-01-05",
    contractValue: 160000.00,
    updatedContractValue: 185000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.22,
    lastPaymentDate: "2026-04-30",
    status: "Ativo"
  },
  {
    id: 106,
    customerId: 6,
    unitId: "U-13900-QA-L04",
    saleDate: "2023-04-12",
    contractValue: 130000.00,
    updatedContractValue: 145000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.12,
    lastPaymentDate: "2026-02-10",
    status: "Ativo"
  },
  {
    id: 107,
    customerId: 7,
    unitId: "U-20200-Q03-L22",
    saleDate: "2022-09-01",
    contractValue: 110000.00,
    updatedContractValue: 125000.00,
    interestRate: 0.012,
    subjudice: "N",
    percPaid: 0.04,
    lastPaymentDate: null,
    status: "Ativo"
  },
  {
    id: 108,
    customerId: 8,
    unitId: "U-20100-Q04-L05",
    saleDate: "2024-02-18",
    contractValue: 145000.00,
    updatedContractValue: 155000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.40,
    lastPaymentDate: "2026-05-10",
    status: "Ativo"
  },
  {
    id: 109,
    customerId: 9,
    unitId: "U-20200-Q08-L09",
    saleDate: "2020-03-20",
    contractValue: 200000.00,
    updatedContractValue: 235000.00,
    interestRate: 0.009,
    subjudice: "N",
    percPaid: 0.60,
    lastPaymentDate: "2026-02-28",
    status: "Ativo"
  },
  {
    id: 110,
    customerId: 10,
    unitId: "U-20100-Q09-L44",
    saleDate: "2017-06-15",
    contractValue: 150000.00,
    updatedContractValue: 195000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.55,
    lastPaymentDate: "2026-01-10",
    status: "Ativo"
  },
  {
    id: 111,
    customerId: 10,
    unitId: "U-13800-Q05-L10",
    saleDate: "2018-09-22",
    contractValue: 115000.00,
    updatedContractValue: 140000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.35,
    lastPaymentDate: "2026-01-15",
    status: "Ativo"
  },
  {
    id: 112,
    customerId: 1,
    unitId: "U-20100-Q09-L44",
    saleDate: "2015-04-10",
    contractValue: 90000.00,
    updatedContractValue: 110000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 1.00,
    lastPaymentDate: "2020-04-10",
    status: "Quitado"
  },
  {
    id: 113,
    customerId: 1,
    unitId: "U-13800-Q05-L10",
    saleDate: "2020-01-10",
    contractValue: 130000.00,
    updatedContractValue: 140000.00,
    interestRate: 0.01,
    subjudice: "N",
    percPaid: 0.10,
    lastPaymentDate: "2021-02-15",
    status: "Distratado"
  }
];

const MOCK_DEFAULTERS_RECEIVABLE_BILLS = [
  // Títulos em atraso das Empresas
  // Carlos (Cli 1, Contr 101, Emp 1)
  {
    id: "B-101-01",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 48,
    dueDate: "2026-03-10",
    value: 1200.00,
    interest: 35.50,
    fine: 24.00,
    totalValue: 1259.50,
    daysDelay: 74, // Mais de 61 dias -> WE SEND
    slipStatus: "Vencido"
  },
  {
    id: "B-101-02",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 49,
    dueDate: "2026-04-10",
    value: 1200.00,
    interest: 18.20,
    fine: 24.00,
    totalValue: 1242.20,
    daysDelay: 43,
    slipStatus: "Vencido"
  },
  {
    id: "B-101-03",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 50,
    dueDate: "2026-05-10",
    value: 1200.00,
    interest: 2.10,
    fine: 24.00,
    totalValue: 1226.10,
    daysDelay: 13,
    slipStatus: "Vencido"
  },

  // Mariana (Cli 2, Contr 102, Emp 1) - 0% pago
  {
    id: "B-102-01",
    saleId: 102,
    customerId: 2,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 1,
    dueDate: "2026-02-15",
    value: 1850.00,
    interest: 120.40,
    fine: 37.00,
    totalValue: 2007.40,
    daysDelay: 98, // > 61 dias
    slipStatus: "Vencido"
  },
  {
    id: "B-102-02",
    saleId: 102,
    customerId: 2,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 2,
    dueDate: "2026-03-15",
    value: 1850.00,
    interest: 85.30,
    fine: 37.00,
    totalValue: 1972.30,
    daysDelay: 69, // > 61 dias
    slipStatus: "Vencido"
  },

  // Loteamentos Parceria (Cli 3, Contr 103, Emp 2) - SUB JUDICE
  {
    id: "B-103-01",
    saleId: 103,
    customerId: 3,
    companyId: 2,
    costCenterId: "20100",
    installmentNum: 35,
    dueDate: "2025-11-10",
    value: 2800.00,
    interest: 450.00,
    fine: 56.00,
    totalValue: 3306.00,
    daysDelay: 195,
    slipStatus: "Vencido"
  },

  // Reginaldo (Cli 4, Contr 104, Emp 6)
  {
    id: "B-104-01",
    saleId: 104,
    customerId: 4,
    companyId: 6,
    costCenterId: "60100",
    installmentNum: 40,
    dueDate: "2026-03-10",
    value: 1500.00,
    interest: 65.00,
    fine: 30.00,
    totalValue: 1595.00,
    daysDelay: 74, // > 61 dias
    slipStatus: "Vencido"
  },

  // Beatriz (Cli 5, Contr 105, Emp 13)
  {
    id: "B-105-01",
    saleId: 105,
    customerId: 5,
    companyId: 13,
    costCenterId: "130100",
    installmentNum: 15,
    dueDate: "2026-04-10",
    value: 1750.00,
    interest: 35.80,
    fine: 35.00,
    totalValue: 1820.80,
    daysDelay: 43,
    slipStatus: "Vencido"
  },

  // Douglas (Cli 6, Contr 106, Emp 1 - Avaré Fase II, C.Custo 13900)
  {
    id: "B-106-01",
    saleId: 106,
    customerId: 6,
    companyId: 1,
    costCenterId: "13900",
    installmentNum: 25,
    dueDate: "2026-03-10",
    value: 1350.00,
    interest: 58.00,
    fine: 27.00,
    totalValue: 1435.00,
    daysDelay: 74,
    slipStatus: "Vencido"
  },

  // Sandra (Cli 7, Contr 107, Emp 2) - < 5% pago, sem pagamentos
  {
    id: "B-107-01",
    saleId: 107,
    customerId: 7,
    companyId: 2,
    costCenterId: "20200",
    installmentNum: 3,
    dueDate: "2026-01-10",
    value: 1100.00,
    interest: 92.50,
    fine: 22.00,
    totalValue: 1214.50,
    daysDelay: 133,
    slipStatus: "Vencido"
  },

  // Wellington (Cli 8, Contr 108, Emp 2) - Atraso curto <= 15 dias, 1 parcela
  {
    id: "B-108-01",
    saleId: 108,
    customerId: 8,
    companyId: 2,
    costCenterId: "20100",
    installmentNum: 10,
    dueDate: "2026-05-15",
    value: 1400.00,
    interest: 2.50,
    fine: 28.00,
    totalValue: 1430.50,
    daysDelay: 8, // Atraso curto (8 dias)
    slipStatus: "Vencido"
  },

  // Imobiliária Moura Leite (Cli 9, Contr 109, Emp 2) - Acordo recente, 1 vencida
  {
    id: "B-109-01",
    saleId: 109,
    customerId: 9,
    companyId: 2,
    costCenterId: "20200",
    installmentNum: 5,
    dueDate: "2026-05-10",
    value: 2350.00,
    interest: 15.00,
    fine: 47.00,
    totalValue: 2412.00,
    daysDelay: 13,
    slipStatus: "Vencido"
  },

  // Antônio (Cli 10, Contr 110 e 111, Emp 2 e 1) - Vários Contratos Vencidos
  {
    id: "B-110-01",
    saleId: 110,
    customerId: 10,
    companyId: 2,
    costCenterId: "20100",
    installmentNum: 88,
    dueDate: "2026-02-10",
    value: 1600.00,
    interest: 88.00,
    fine: 32.00,
    totalValue: 1720.00,
    daysDelay: 103,
    slipStatus: "Vencido"
  },
  {
    id: "B-110-02",
    saleId: 110,
    customerId: 10,
    companyId: 2,
    costCenterId: "20100",
    installmentNum: 89,
    dueDate: "2026-03-10",
    value: 1600.00,
    interest: 60.00,
    fine: 32.00,
    totalValue: 1692.00,
    daysDelay: 74,
    slipStatus: "Vencido"
  },
  {
    id: "B-111-01",
    saleId: 111,
    customerId: 10,
    companyId: 1,
    costCenterId: "13800",
    installmentNum: 70,
    dueDate: "2026-02-15",
    value: 1300.00,
    interest: 70.00,
    fine: 26.00,
    totalValue: 1396.00,
    daysDelay: 98,
    slipStatus: "Vencido"
  }
];

// Mock da carteira de recebíveis futuros (API /income) - Projeção de fluxo de caixa
const MOCK_INCOME = [
  // Lançamentos sintéticos de recebíveis para 2026, 2027 e 2028 por Empreendimento/Empresa
  { year: 2026, month: 6, companyId: 1, costCenterId: "13700", value: 125000.00, status: "A vencer" },
  { year: 2026, month: 6, companyId: 1, costCenterId: "13800", value: 98000.00, status: "A vencer" },
  { year: 2026, month: 6, companyId: 2, costCenterId: "20100", value: 245000.00, status: "A vencer" },
  { year: 2026, month: 6, companyId: 2, costCenterId: "20200", value: 180000.00, status: "A vencer" },
  { year: 2026, month: 6, companyId: 6, costCenterId: "60100", value: 85000.00, status: "A vencer" },
  { year: 2026, month: 6, companyId: 13, costCenterId: "130100", value: 74000.00, status: "A vencer" },

  { year: 2026, month: 7, companyId: 1, costCenterId: "13700", value: 126000.00, status: "A vencer" },
  { year: 2026, month: 7, companyId: 1, costCenterId: "13800", value: 99000.00, status: "A vencer" },
  { year: 2026, month: 7, companyId: 2, costCenterId: "20100", value: 247000.00, status: "A vencer" },
  { year: 2026, month: 7, companyId: 2, costCenterId: "20200", value: 182000.00, status: "A vencer" },
  { year: 2026, month: 7, companyId: 6, costCenterId: "60100", value: 86000.00, status: "A vencer" },
  { year: 2026, month: 7, companyId: 13, costCenterId: "130100", value: 75000.00, status: "A vencer" },

  { year: 2026, month: 8, companyId: 1, costCenterId: "13700", value: 120000.00, status: "A vencer" },
  { year: 2026, month: 8, companyId: 2, costCenterId: "20100", value: 235000.00, status: "A vencer" },

  { year: 2026, month: 9, companyId: 1, costCenterId: "13700", value: 122000.00, status: "A vencer" },
  { year: 2026, month: 9, companyId: 2, costCenterId: "20100", value: 238000.00, status: "A vencer" },

  { year: 2026, month: 10, companyId: 1, costCenterId: "13700", value: 124000.00, status: "A vencer" },
  { year: 2026, month: 10, companyId: 2, costCenterId: "20100", value: 240000.00, status: "A vencer" },

  { year: 2026, month: 11, companyId: 1, costCenterId: "13700", value: 125000.00, status: "A vencer" },
  { year: 2026, month: 11, companyId: 2, costCenterId: "20100", value: 242000.00, status: "A vencer" },

  { year: 2026, month: 12, companyId: 1, costCenterId: "13700", value: 130000.00, status: "A vencer" },
  { year: 2026, month: 12, companyId: 2, costCenterId: "20100", value: 250000.00, status: "A vencer" },

  // Prospecção 2027
  { year: 2027, month: 1, companyId: 1, costCenterId: "13700", value: 115000.00, status: "A vencer" },
  { year: 2027, month: 1, companyId: 2, costCenterId: "20100", value: 220000.00, status: "A vencer" },
  { year: 2027, month: 2, companyId: 1, costCenterId: "13700", value: 115000.00, status: "A vencer" },
  { year: 2027, month: 2, companyId: 2, costCenterId: "20100", value: 220000.00, status: "A vencer" },
  { year: 2027, month: 3, companyId: 1, costCenterId: "13700", value: 115000.00, status: "A vencer" },
  { year: 2027, month: 2, companyId: 2, costCenterId: "20100", value: 220000.00, status: "A vencer" },

  // Prospecção 2028 (Geral)
  { year: 2028, month: 1, companyId: 1, costCenterId: "13700", value: 95000.00, status: "A vencer" },
  { year: 2028, month: 1, companyId: 2, costCenterId: "20100", value: 180000.00, status: "A vencer" }
];

const MOCK_COLLECTIONS_NOTIFICATION_HISTORY = {
  "101": [
    { id: 1, date: "2026-03-15", type: "SMS", desc: "Aviso de atraso parcela 48", status: "Entregue" },
    { id: 2, date: "2026-03-25", type: "E-mail", desc: "Notificação extrajudicial eletrônica amigável", status: "Visualizado" },
    { id: 3, date: "2026-04-12", type: "SMS", desc: "Aviso de atraso parcela 49", status: "Entregue" },
    { id: 4, date: "2026-04-25", type: "Telefonema", desc: "Tentativa de contato - Caixa postal", status: "Sem Sucesso" }
  ],
  "102": [
    { id: 5, date: "2026-02-20", type: "SMS", desc: "Aviso de atraso parcela 1", status: "Entregue" },
    { id: 6, date: "2026-03-20", type: "Carta AR", desc: "Aviso de notificação Correios", status: "Entregue" }
  ],
  "107": [
    { id: 7, date: "2026-01-15", type: "SMS", desc: "Lembrete de vencimento", status: "Entregue" },
    { id: 8, date: "2026-01-25", type: "E-mail", desc: "Aviso de atraso de parcela", status: "Entregue" }
  ]
};

const MOCK_REMADE_INSTALLMENTS = {
  "101": [
    { id: 501, date: "2025-05-12", origValue: 24000.00, remadeValue: 26500.00, numInstallments: 24, reason: "Diluição de saldo devedor" }
  ],
  "109": [
    { id: 502, date: "2026-04-20", origValue: 12000.00, remadeValue: 12500.00, numInstallments: 5, reason: "Acordo de atraso de boleto" }
  ]
};

// Parcelas pagas mockadas para demonstrar o extrato completo com descontos e datas de pagamento
const MOCK_PAID_RECEIVABLE_BILLS = [
  {
    id: "P-101-01",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 1,
    dueDate: "2022-06-10",
    paymentDate: "2022-06-08",
    value: 1200.00,
    discount: 50.00,
    interestPaid: 0.00,
    finePaid: 0.00,
    totalPaid: 1150.00,
    slipStatus: "Pago"
  },
  {
    id: "P-101-02",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 2,
    dueDate: "2022-07-10",
    paymentDate: "2022-07-10",
    value: 1200.00,
    discount: 0.00,
    interestPaid: 0.00,
    finePaid: 0.00,
    totalPaid: 1200.00,
    slipStatus: "Pago"
  },
  {
    id: "P-101-03",
    saleId: 101,
    customerId: 1,
    companyId: 1,
    costCenterId: "13700",
    installmentNum: 3,
    dueDate: "2022-08-10",
    paymentDate: "2022-08-15",
    value: 1200.00,
    discount: 0.00,
    interestPaid: 12.50,
    finePaid: 24.00,
    totalPaid: 1236.50,
    slipStatus: "Pago"
  },
  // Reginaldo (Cli 4, Contr 104)
  {
    id: "P-104-01",
    saleId: 104,
    customerId: 4,
    companyId: 6,
    costCenterId: "60100",
    installmentNum: 1,
    dueDate: "2023-11-10",
    paymentDate: "2023-11-05",
    value: 1500.00,
    discount: 75.00,
    interestPaid: 0.00,
    finePaid: 0.00,
    totalPaid: 1425.00,
    slipStatus: "Pago"
  },
  // Beatriz (Cli 5, Contr 105)
  {
    id: "P-105-01",
    saleId: 105,
    customerId: 5,
    companyId: 13,
    costCenterId: "130100",
    installmentNum: 1,
    dueDate: "2025-02-10",
    paymentDate: "2025-02-10",
    value: 1750.00,
    discount: 0.00,
    interestPaid: 0.00,
    finePaid: 0.00,
    totalPaid: 1750.00,
    slipStatus: "Pago"
  },
  // Imobiliária Moura Leite (Cli 9, Contr 109)
  {
    id: "P-109-01",
    saleId: 109,
    customerId: 9,
    companyId: 2,
    costCenterId: "20200",
    installmentNum: 1,
    dueDate: "2026-01-10",
    paymentDate: "2026-01-09",
    value: 2350.00,
    discount: 100.00,
    interestPaid: 0.00,
    finePaid: 0.00,
    totalPaid: 2250.00,
    slipStatus: "Pago"
  }
];

// Histórico de ocorrências registrado pelo operador no CRM (inicialmente vazio, gravado no localStorage)
const INITIAL_MOCK_NOTES = {};

// Cadastro dos Preâmbulos Jurídicos dos Sócios por Empreendimento (Simulador SharePoint)
const INITIAL_PREAMBLE_DATA = {
  "13700": "MOURA LEITE EMPREENDIMENTOS AVARÉ LTDA., pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº 11.222.333/0001-44, com sede na Rua Minas Gerais, 100, Centro, Avaré/SP, representada por seu sócio-gerente Sr. CARLOS DE MOURA LEITE JÚNIOR, brasileiro, casado, empresário, portador do RG nº 9.876.543-2 e inscrito no CPF/MF sob o nº 123.123.123-12.",
  "13800": "MOURA LEITE EMPREENDIMENTOS AVARÉ LTDA., pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº 11.222.333/0001-44, com sede na Rua Minas Gerais, 100, Centro, Avaré/SP, representada por seu sócio-gerente Sr. CARLOS DE MOURA LEITE JÚNIOR, brasileiro, casado, empresário, portador do RG nº 9.876.543-2 e inscrito no CPF/MF sob o nº 123.123.123-12.",
  "13900": "MOURA LEITE INCORPORAÇÕES AVARÉ II LTDA., inscrita no CNPJ/MF sob o nº 22.333.444/0001-55, com sede na Rua Major Rangel, 200, Centro, Avaré/SP, neste ato representada por seus sócios Sra. ELISA LEITE, brasileira, solteira, engenheira, portadora do RG nº 8.765.432-1 e inscrita no CPF/MF sob o nº 234.234.234-23.",
  "14000": "MOURA LEITE INCORPORAÇÕES AVARÉ II LTDA., inscrita no CNPJ/MF sob o nº 22.333.444/0001-55, com sede na Rua Major Rangel, 200, Centro, Avaré/SP, neste ato representada por seus sócios Sra. ELISA LEITE, brasileira, solteira, engenheira, portadora do RG nº 8.765.432-1 e inscrita no CPF/MF sob o nº 234.234.234-23.",
  "20100": "MOURA LEITE LOTEAMENTOS LTDA., com sede na Av. Prefeito Misael Eufrásio Leite, 350, Avaré/SP, inscrita no CNPJ/MF sob o nº 44.555.666/0001-77, representada legalmente por seu Diretor Administrativo Sr. ROBERTO DE MOURA LEITE, brasileiro, divorciado, administrador, portador do RG nº 7.654.321-0 e inscrito no CPF/MF sob o nº 345.345.345-34.",
  "20200": "MOURA LEITE LOTEAMENTOS LTDA., com sede na Av. Prefeito Misael Eufrásio Leite, 350, Avaré/SP, inscrita no CNPJ/MF sob o nº 44.555.666/0001-77, representada legalmente por seu Diretor Administrativo Sr. ROBERTO DE MOURA LEITE, brasileiro, divorciado, administrador, portador do RG nº 7.654.321-0 e inscrito no CPF/MF sob o nº 345.345.345-34.",
  "60100": "MOURA LEITE DESENVOLVIMENTO IMOBILIÁRIO SPE LTDA, inscrita no CNPJ sob o nº 66.777.888/0001-99, com sede em Botucatu/SP, representada por seu procurador constituído Sr. MÁRCIO CORDEIRO, brasileiro, casado, advogado, portador do RG nº 6.543.210-9 e inscrito no CPF/MF sob o nº 456.456.456-45.",
  "130100": "MOURA LEITE URBANISMO E PARTICIPAÇÕES S.A., inscrita no CNPJ sob o nº 88.999.000/0001-11, com sede em Bauru/SP, representada por seus diretores Sr. FÁBIO LEITE SILVA, brasileiro, engenheiro civil, portador do RG nº 5.432.109-8, inscrito no CPF sob o nº 567.567.567-56 e Sr. PAULO MOURA LEITE, brasileiro, administrador, portador do RG nº 4.321.098-7, inscrito no CPF sob o nº 678.678.678-67."
};

const MOCK_BANK_MOVEMENTS = [
  { bankMovementAmount: 150000.00, companyId: 1, companyName: "Moura Leite Empreendimentos Avaré Ltda", bankMovementDate: "2026-06-05T10:00:00Z" },
  { bankMovementAmount: 50000.00, companyId: 1, companyName: "Moura Leite Empreendimentos Avaré Ltda", bankMovementDate: "2026-06-12T10:00:00Z" },
  { bankMovementAmount: 320000.00, companyId: 2, companyName: "Moura Leite Loteamentos Principal", bankMovementDate: "2026-06-08T10:00:00Z" },
  { bankMovementAmount: -15000.00, companyId: 2, companyName: "Moura Leite Loteamentos Principal", bankMovementDate: "2026-06-09T10:00:00Z" },
  { bankMovementAmount: 75000.00, companyId: 6, companyName: "Loteadora Moura Leite - Empresa 06", bankMovementDate: "2026-06-15T10:00:00Z" }
];

// Exportar para que outros módulos possam ler
window.MOCK_DATA = {
  COMPANIES: MOCK_COMPANIES,
  COST_CENTERS: MOCK_COST_CENTERS,
  UNITS: MOCK_UNITS,
  CUSTOMERS: MOCK_CUSTOMERS,
  SALES: MOCK_SALES,
  DEFAULTERS_RECEIVABLE_BILLS: MOCK_DEFAULTERS_RECEIVABLE_BILLS,
  PAID_RECEIVABLE_BILLS: MOCK_PAID_RECEIVABLE_BILLS,
  INCOME: MOCK_INCOME,
  COLLECTIONS_NOTIFICATION_HISTORY: MOCK_COLLECTIONS_NOTIFICATION_HISTORY,
  REMADE_INSTALLMENTS: MOCK_REMADE_INSTALLMENTS,
  INITIAL_MOCK_NOTES: INITIAL_MOCK_NOTES,
  INITIAL_PREAMBLE_DATA: INITIAL_PREAMBLE_DATA,
  BANK_MOVEMENTS: MOCK_BANK_MOVEMENTS
};
