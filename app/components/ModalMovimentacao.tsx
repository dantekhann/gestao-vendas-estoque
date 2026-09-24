'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  sku: string;
  nome: string;
  estoque_atual: number;
}

interface Props {
  produto: Produto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModalMovimentacao({ produto, onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'PERDA'>('ENTRADA');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!produto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantidade <= 0 && tipo !== 'AJUSTE') {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    setSalvando(true);

    const { error } = await supabase.from('movimentacoes_estoque').insert([
      {
        produto_id: produto.id,
        tipo,
        quantidade: Number(quantidade),
        observacao,
      },
    ]);

    setSalvando(false);

    if (error) {
      console.error('Erro detalhado do Supabase:', error);
      alert(`Erro ao registrar movimentação: ${error.message || error.details}`);
    } else {
      onSuccess();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-slate-100">Movimentar Estoque</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm"
          >
            ✕
          </button>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
          <p className="text-xs text-slate-400">Item Selecionado:</p>
          <p className="text-sm font-semibold text-slate-200">{produto.nome}</p>
          <p className="text-xs text-slate-500 font-mono">SKU: {produto.sku} | Atual: {produto.estoque_atual} un</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Tipo de Operação</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ENTRADA">➕ Entrada (Compra / Reposição)</option>
              <option value="SAIDA">➖ Saída (Uso / Baixa)</option>
              <option value="AJUSTE">🔄 Ajuste Direto (Novo Saldo)</option>
              <option value="PERDA">⚠️ Perda / Avaria</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {tipo === 'AJUSTE' ? 'Novo Saldo Físico' : 'Quantidade'}
            </label>
            <input
              type="number"
              min="0"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Observação / Ocorrência</label>
            <input
              type="text"
              placeholder="Ex: Compra NF 1042, contagem de inventário..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 bg-slate-800 text-slate-300 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="w-1/2 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Aguarde...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}