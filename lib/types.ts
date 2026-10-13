// lib/types.ts

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'VENDA';

export interface Produto {
  id: string
  nome: string
  sku?: string | null          // ← ADICIONE (a busca nem sempre traz sku)
  classificacao?: string | null
  categoria?: string | null
  tipo?: string | null
  estoque_atual: number
  estoque_minimo?: number | null
  preco_venda?: number | null  // ← TORNE OPCIONAL (era obrigatório)
}

export interface Venda {
  id: string
  cliente: string
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export interface ItemVenda {
  produto_id: string
  nome: string        // ou produto_nome — confira como a página usa
  quantidade: number
  preco_unitario: number
  subtotal: number
}

export interface Movimentacao {
  id: string;
  produto_id?: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
  created_at?: string;
  produtos?: Produto | Produto[] | null;
  produto_nome?: string;
}