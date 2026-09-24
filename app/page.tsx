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
  classificacao?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  estoque_atual: number;
}

// Função para formatar o rótulo dando prioridade absoluta à nova coluna 'classificacao'
function formatarRotulo(classificacao: string | null | undefined, cat: string | null | undefined, tipo: string | null | undefined, nomeProduto: string = '') {
  // 1. Se já tiver preenchido na nova coluna do Supabase, usa diretamente
  if (classificacao && classificacao.trim() !== '') {
    return classificacao.toUpperCase().trim();
  }

  // 2. Fallback de segurança para itens antigos
  const valor = (tipo || cat || '').toUpperCase().trim();
  const nome = nomeProduto.toUpperCase().trim();

  if (
    nome.includes('LUVA') || 
    nome.includes('MÁSCARA') || 
    nome.includes('PROPÉ') || 
    nome.includes('TOUCA') ||
    valor.includes('EPI')
  ) {
    return 'EPI';
  }

  if (valor.includes('MATERIA') || valor.includes('INSUMO')) return 'INSUMO (MATÉRIA-PRIMA)';
  if (valor.includes('CONSUMO') || valor.includes('ALMOXARIFADO')) return 'ALMOXARIFADO (CONSUMO INTERNO)';
  if (valor.includes('EMBALAGEM')) return 'EMBALAGEM';
  if (valor.includes('ACABADO') || valor.includes('PRODUTO')) return 'PRODUTO FINALIZADO';
  
  return 'PRODUTO FINALIZADO';
}

// Cores personalizadas para cada classificação
function obterEstiloRotulo(rotulo: string) {
  const r = rotulo.toUpperCase();
  if (r.includes('EPI')) {
    return 'bg-emerald-950/65 text-emerald-400 border-emerald-800/40';
  }
  if (r.includes('INSUMO') || r.includes('MATÉRIA')) {
    return 'bg-blue-950/65 text-blue-400 border-blue-800/40';
  }
  if (r.includes('ALMOXARIFADO') || r.includes('CONSUMO')) {
    return 'bg-purple-950/65 text-purple-400 border-purple-800/40';
  }
  if (r.includes('EMBALAGEM')) {
    return 'bg-amber-950/65 text-amber-400 border-amber-800/40';
  }
  if (r.includes('FINALIZADO')) {
    return 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/40';
  }
  return 'bg-slate-800 text-slate-400 border-slate-700';
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
    const rotuloAtual = formatarRotulo(p.classificacao, p.categoria, p.tipo, p.nome);

    const matchNome = p.nome.toLowerCase().includes(busca.toLowerCase());
    
    let matchCat = true;
    if (categoriaFiltro !== 'TODAS') {
      matchCat = rotuloAtual.includes(categoriaFiltro.toUpperCase());
    }
    
    let matchStatus = true;
    if (statusFiltro === 'ZERADO') {
      matchStatus = p.estoque_atual === 0;
    } else if (statusFiltro === 'DISPONIVEL') {
      matchStatus = p.estoque_atual > 0;
    }

    return matchNome && matchCat && matchStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Situação de Estoque</h1>
            <p className="text-sm text-slate-400 mt-1">Gestão de Insumos e Produtos Finalizados - OrC Brasil</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/produtos')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>⚙️</span> Gestão de Produtos
            </button>
            <button
              onClick={() => router.push('/vendas')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>🕒</span> Histórico de Vendas
            </button>
            <button
              onClick={() => router.push('/movimentacoes')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>📋</span> Movimentações
            </button>
            <button
              onClick={() => router.push('/movimentar')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>📦</span> Lançar Entrada
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Classificação / Tipo</label>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="TODAS">Todas as Classificações</option>
              <option value="Produto Finalizado">Produto Finalizado</option>
              <option value="Insumo">Insumo (Matéria-Prima)</option>
              <option value="Almoxarifado">Almoxarifado (Consumo Interno)</option>
              <option value="Embalagem">Embalagem</option>
              <option value="EPI">EPI</option>
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
              <option value="DISPONIVEL">Em Estoque (&gt; 0)</option>
              <option value="ZERADO">Zerado (0)</option>
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
                  <th className="p-4 sm:p-5">Classificação</th>
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
                  produtosFiltrados.map((p) => {
                    const rotuloExibicao = formatarRotulo(p.classificacao, p.categoria, p.tipo, p.nome);
                    const estiloCor = obterEstiloRotulo(rotuloExibicao);
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 sm:p-5 font-semibold text-slate-100">{p.nome}</td>
                        <td className="p-4 sm:p-5">
                          <span className={`px-3 py-1 border rounded-lg text-xs font-bold uppercase tracking-wide ${estiloCor}`}>
                            {rotuloExibicao}
                          </span>
                        </td>
                        <td className="p-4 sm:p-5 text-right font-extrabold text-emerald-400">
                          {p.estoque_atual} un
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}