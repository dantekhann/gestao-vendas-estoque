'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  sku?: string;
  nome: string;
  preco_custo: number;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo: number;
  classificacao?: string;
  Classificacao?: string;
  classificação?: string;
  categoria?: string;
}

const OPCOES_CLASSIFICACAO = [
  'Produto Finalizado',
  'Insumo (Matéria-Prima)',
  'Almoxarifado (Consumo Interno)',
  'Embalagem',
  'EPI'
];

export default function EstoquePage() {
  const router = useRouter();
  
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const [buscaNome, setBuscaNome] = useState<string>('');
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('TODAS');
  const [filtroEstoque, setFiltroEstoque] = useState<string>('TODOS');

  useEffect(() => {
    let montado = true;

    async function carregarProdutos() {
      try {
        setCarregando(true);
        setErro(null);

        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .order('nome', { ascending: true });

        if (error) throw error;

        if (montado && data) {
          console.log("Dados vindos do Supabase (Estoque):", data); // <--- Veja isto no F12 > Console
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

  const produtosFiltrados = useMemo(() => {
    return produtos.filter((produto) => {
      const bateuNome = produto.nome.toLowerCase().includes(buscaNome.toLowerCase());
      
      // Tenta apanhar qualquer variação de nome de coluna que possa vir do Supabase
      const valorClassificacao = produto.classificacao || produto.Classificacao || produto.classificação || produto.categoria || 'Produto Finalizado';
      
      const bateuClassificacao = filtroClassificacao === 'TODAS' || valorClassificacao === filtroClassificacao;

      let bateuEstoque = true;
      if (filtroEstoque === 'DISPONIVEL') {
        bateuEstoque = produto.estoque_atual > 0;
      } else if (filtroEstoque === 'ESGOTADO') {
        bateuEstoque = produto.estoque_atual <= 0;
      }

      return bateuNome && bateuClassificacao && bateuEstoque;
    });
  }, [produtos, buscaNome, filtroClassificacao, filtroEstoque]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Inventário Completo - OrC Brasil</h1>
            <p className="text-sm text-slate-400">Gestão detalhada de stock e matérias-primas</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 shadow-sm transition-colors text-sm cursor-pointer"
            >
              ← Voltar ao Início
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Buscar por Nome</label>
            <input
              type="text"
              value={buscaNome}
              onChange={(e) => setBuscaNome(e.target.value)}
              placeholder="Digite para pesquisar..."
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Classificação / Tipo</label>
            <select
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="TODAS" className="bg-slate-900">Todas as Classificações</option>
              {OPCOES_CLASSIFICACAO.map((opt) => (
                <option key={opt} value={opt} className="bg-slate-900">{opt}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Situação do Estoque</label>
            <select
              value={filtroEstoque}
              onChange={(e) => setFiltroEstoque(e.target.value)}
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="TODOS" className="bg-slate-900">Todos os Status</option>
              <option value="DISPONIVEL" className="bg-slate-900">Apenas Disponíveis (&gt; 0)</option>
              <option value="ESGOTADO" className="bg-slate-900">Apenas Esgotados (≤ 0)</option>
            </select>
          </div>
        </div>

        {/* Tabela */}
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
                    <th className="p-3.5">Classificação</th>
                    <th className="p-3.5 text-right">Preço Venda</th>
                    <th className="p-3.5 text-right">Estoque Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-6 text-slate-500 font-medium">
                        Nenhum item encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    produtosFiltrados.map((produto) => {
                      const tipoExibicao = produto.classificacao || produto.Classificacao || produto.classificação || produto.categoria || 'Produto Finalizado';

                      return (
                        <tr key={produto.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-semibold text-slate-100">{produto.nome}</td>
                          <td className="p-3.5 text-xs font-bold">
                            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-block">
                              {tipoExibicao}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-mono text-emerald-400">
                            {produto.preco_venda > 0 ? `R$ ${Number(produto.preco_venda).toFixed(2)}` : '—'}
                          </td>
                          <td className="p-3.5 text-right font-bold text-slate-100">
                            <span className={produto.estoque_atual <= (produto.estoque_minimo || 0) ? 'text-amber-400' : 'text-slate-100'}>
                              {produto.estoque_atual} un
                            </span>
                          </td>
                        </tr>
                      );
                    })
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