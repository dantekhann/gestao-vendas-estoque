'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  nome: string;
  estoque_atual: number;
  tipo: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Estados dos Filtros
  const [buscaNome, setBuscaNome] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [filtroEstoque, setFiltroEstoque] = useState<string>('TODOS');

  // Formata os tipos para exibição na tela (ex: PRODUTO_FINAL -> PRODUTO FINAL)
  const formatarTipo = (tipo: string) => {
    if (!tipo) return '';
    return tipo.replace(/_/g, ' ');
  };

  useEffect(() => {
    let montado = true;

    async function carregarProdutos() {
      try {
        setCarregando(true);
        setErro(null);

        // Busca os produtos ordenando pelos maiores estoques no topo
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, estoque_atual, tipo')
          .order('estoque_atual', { ascending: false });

        if (error) throw error;

        if (montado && data) {
          setProdutos(data);
        }
      } catch (err: any) {
        console.error('Erro ao carregar estoque:', err);
        if (montado) {
          setErro(err.message || 'Erro ao conectar com o banco de dados.');
        }
      } finally {
        if (montado) {
          setCarregando(false);
        }
      }
    }

    carregarProdutos();

    return () => {
      montado = false;
    };
  }, []);

  // Lista dinâmica de categorias únicas extraídas do banco de dados
  const categoriasUnicas = useMemo(() => {
    const tipos = produtos.map((p) => p.tipo).filter(Boolean);
    return Array.from(new Set(tipos));
  }, [produtos]);

  // Aplicador dos Filtros combinados
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((produto) => {
      // 1. Filtro por Nome
      const bateuNome = produto.nome.toLowerCase().includes(buscaNome.toLowerCase());

      // 2. Filtro por Categoria
      const bateuCategoria =
        filtroCategoria === 'TODAS' || produto.tipo === filtroCategoria;

      // 3. Filtro por Situação de Estoque
      let bateuEstoque = true;
      if (filtroEstoque === 'DISPONIVEL') {
        bateuEstoque = produto.estoque_atual > 0;
      } else if (filtroEstoque === 'ESGOTADO') {
        bateuEstoque = produto.estoque_atual <= 0;
      }

      return bateuNome && bateuCategoria && bateuEstoque;
    });
  }, [produtos, buscaNome, filtroCategoria, filtroEstoque]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Situação de Estoque</h1>
            <p className="text-sm text-slate-400">Gestão simplificada de itens e produtos - OrC Brasil</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/estoque/movimentar')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 shadow-sm transition-colors flex items-center gap-2 text-sm"
            >
              <span>📦</span>
              <span>Lançar Entrada/Ajuste</span>
            </button>

            <button
              onClick={() => router.push('/vendas/nova')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm"
            >
              <span className="text-lg">+</span>
              <span>Nova Venda</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* Filtro por Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Buscar por Nome
            </label>
            <input
              type="text"
              value={buscaNome}
              onChange={(e) => setBuscaNome(e.target.value)}
              placeholder="Digite para pesquisar..."
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Filtro por Categoria/Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Categoria / Tipo
            </label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="TODAS" className="bg-slate-900">Todas as Categorias</option>
              {categoriasUnicas.map((cat) => (
                <option key={cat} value={cat} className="bg-slate-900">
                  {formatarTipo(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Status do Estoque */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Situação do Estoque
            </label>
            <select
              value={filtroEstoque}
              onChange={(e) => setFiltroEstoque(e.target.value)}
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="TODOS" className="bg-slate-900">Todos os Status</option>
              <option value="DISPONIVEL" className="bg-slate-900">Apenas Disponíveis (&gt; 0)</option>
              <option value="ESGOTADO" className="bg-slate-900">Apenas Esgotados (≤ 0)</option>
            </select>
          </div>

        </div>

        {/* Tabela de Produtos Simplificada */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md">
          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse font-medium">
              Carregando produtos do banco de dados...
            </div>
          ) : erro ? (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm">
              {erro}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Nome do Item</th>
                    <th className="p-3.5">Categoria / Tipo</th>
                    <th className="p-3.5 text-right">Estoque Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center p-6 text-slate-500 font-medium">
                        Nenhum item encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    produtosFiltrados.map((produto) => (
                      <tr key={produto.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-100">{produto.nome}</td>
                        <td className="p-3.5 text-xs font-bold">
                          <span className={`px-2.5 py-1 rounded-full ${
                            produto.tipo === 'PRODUTO_FINAL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' :
                            produto.tipo === 'EMBALAGEM' ? 'bg-amber-950 text-amber-400 border border-amber-800/50' :
                            produto.tipo === 'INSUMO' ? 'bg-blue-950 text-blue-400 border border-blue-800/50' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {formatarTipo(produto.tipo)}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-100">
                          <span className={produto.estoque_atual <= 0 ? 'text-red-400' : 'text-slate-100'}>
                            {produto.estoque_atual} un
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}