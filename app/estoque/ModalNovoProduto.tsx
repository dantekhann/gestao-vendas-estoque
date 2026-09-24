'use client';

import { useState } from 'react';
import { criarProduto } from '../components/actions';
import { useRouter } from 'next/navigation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ModalNovoProduto({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const res = await criarProduto(formData);

    setLoading(false);
    if (res.success) {
      onClose();
      router.refresh();
    } else {
      alert('Erro ao guardar o produto: ' + res.error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Adicionar Novo Item ao Estoque</h2>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">Nome do Item</label>
            <input required name="nome" type="text" placeholder="Ex: Embalagem YERBA 500g" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">SKU / Código</label>
              <input required name="sku" type="text" placeholder="Ex: EMB-001" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Categoria</label>
              <select name="categoria" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500">
                <option value="ACABADO">Produto Final</option>
                <option value="EMBALAGEM">Embalagem</option>
                <option value="MATERIA_PRIMA">Matéria-Prima</option>
                <option value="EPI">EPI</option>
                <option value="CONSUMO_INTERNO">Limpeza/Consumo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400">Preço Custo</label>
              <input name="preco_custo" type="number" step="0.01" defaultValue="0" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Preço Venda</label>
              <input name="preco_venda" type="number" step="0.01" defaultValue="0" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Estoque Ini.</label>
              <input name="estoque_atual" type="number" defaultValue="0" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50">
              {loading ? 'A guardar...' : 'Salvar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}