// lib/types.ts

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'VENDA';

export interface Produto {
  id: string;
  nome: string;
  categoria?: string | null;
  tipo?: string | null;
  classificacao?: string | null;
  ativo?: boolean | null;
  preco_venda: number;
  estoque_atual: number;
}

export interface ItemVenda {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
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