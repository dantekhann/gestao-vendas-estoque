'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  nome: string;
  categoria?: string;
  estoque_atual: number;
}

export default function EstoquePage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [statusFiltro, setStatusFiltro] = useState('TODOS');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarEstoque() {
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .order('nome', { ascending: true });
        if (error) throw error;
        if (data) setProdutos(data);
      } catch (err) {
        console.error('Erro ao carregar estoque:', err);
      } finally {
        setCarregando(false);
      }
    }
    carregarEstoque();
  }, []);

  const produtosFiltrados = produtos.filter((p) => {
    const matchNome = p.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoriaFiltro === 'TODAS' || p.categoria === categoriaFiltro;
    return matchNome && matchCat;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Situação de Estoque</h1>
            <p className="text-sm text-slate-400 mt-1">Gestão simplificada de itens e produtos - OrC Brasil</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/vendas')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              Histórico de Vendas
            </button>
            <button
              onClick={() => router.push('/movimentacoes')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              Movimentações
            </button>
            <button
              onClick={() => router.push('/estoque/entrada')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              Lançar Entrada
            </button>
            <button
              onClick={() => router.push('/vendas/lancar')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
            >
              + Nova Venda
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Buscar por Nome</label>
            <input
              type="text"
              placeholder="Digite para pesquisar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Categoria / Tipo</label>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="TODAS">Todas as Categorias</option>
              <option value="EMBALAGEM">Embalagem</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Situação do Estoque</label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="TODOS">Todos os Status</option>
            </select>
          </div>
        </div>

        {/* Tabela de Estoque */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-4 sm:p-5">Nome do Item</th>
                  <th className="p-4 sm:p-5">Categoria / Tipo</th>
                  <th className="p-4 sm:p-5 text-right">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {carregando ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500">
                      A carregar stock...
                    </td>
                  </tr>
                ) : produtosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  produtosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 sm:p-5 font-semibold text-slate-100">{p.nome}</td>
                      <td className="p-4 sm:p-5">
                        <span className="px-3 py-1 bg-amber-950/60 text-amber-500 border border-amber-800/40 rounded-lg text-xs font-bold uppercase tracking-wide">
                          {p.categoria || 'EMBALAGEM'}
                        </span>
                      </td>
                      <td className="p-4 sm:p-5 text-right font-extrabold text-emerald-400">
                        {p.estoque_atual} un
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}