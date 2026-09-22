'use client';

import { useState, useMemo } from 'react';

interface Produto {
  id: string;
  sku: string;
  nome: string;
  preco_custo: number;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo: number;
  categoria?: string;
}

interface Props {
  produtos: Produto[];
}

export default function TabelaProdutos({ produtos }: Props) {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'normal' | 'alerta'>('todos');
  const [categoriaSel, setCategoriaSel] = useState<string>('todos');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  // Filtragem combinada (Busca + Status + Categoria)
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((item) => {
      const emAlerta = item.estoque_atual <= item.estoque_minimo;
      const catItem = item.categoria || 'ACABADO';
      
      const bateBusca = 
        item.nome.toLowerCase().includes(busca.toLowerCase()) ||
        item.sku.toLowerCase().includes(busca.toLowerCase());

      if (!bateBusca) return false;

      // Filtro de Categoria
      if (categoriaSel !== 'todos' && catItem !== categoriaSel) return false;

      // Filtro de Status
      if (filtroStatus === 'alerta') return emAlerta;
      if (filtroStatus === 'normal') return !emAlerta;

      return true;
    });
  }, [produtos, busca, filtroStatus, categoriaSel]);

  // Paginação
  const totalPaginas = Math.ceil(produtosFiltrados.length / itensPorPagina) || 1;
  const produtosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return produtosFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [produtosFiltrados, paginaAtual]);

  const formatarCategoria = (cat?: string) => {
    switch (cat) {
      case 'MATERIA_PRIMA': return 'Matéria-Prima';
      case 'EMBALAGEM': return 'Embalagem';
      case 'EPI': return 'EPI';
      case 'CONSUMO_INTERNO': return 'Limpeza/Consumo';
      default: return 'Produto Acabado';
    }
  };

  return (
    <div className="space-y-4">
      {/* Abas de Navegação por Categoria */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-2 text-xs font-medium text-slate-400">
        {[
          { id: 'todos', label: 'Todos os Itens' },
          { id: 'ACABADO', label: 'Produtos para Venda' },
          { id: 'EMBALAGEM', label: 'Embalagens' },
          { id: 'MATERIA_PRIMA', label: 'Matérias-Primas' },
          { id: 'EPI', label: 'EPIs' },
          { id: 'CONSUMO_INTERNO', label: 'Almoxarifado / Limpeza' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setCategoriaSel(cat.id);
              setPaginaAtual(1);
            }}
            className={`px-3 py-2 rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              categoriaSel === cat.id
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/40'
                : 'border-transparent hover:text-slate-200 hover:bg-slate-800/20'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Barra de Busca e Filtros de Status */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
        <input
          type="text"
          placeholder="Buscar por nome ou SKU..."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPaginaAtual(1);
          }}
          className="w-full md:w-80 bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
        />

        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => { setFiltroStatus('todos'); setPaginaAtual(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroStatus === 'todos' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            Todos
          </button>
          
          <button
            onClick={() => { setFiltroStatus('alerta'); setPaginaAtual(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroStatus === 'alerta' 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            Alerta
          </button>

          <button
            onClick={() => { setFiltroStatus('normal'); setPaginaAtual(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroStatus === 'normal' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            Normal
          </button>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">SKU</th>
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Preço Venda</th>
              <th className="py-3 px-4">Estoque</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {produtosPaginados.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-slate-500">
                  Nenhum item encontrado nesta categoria.
                </td>
              </tr>
            ) : (
              produtosPaginados.map((item) => {
                const emAlerta = item.estoque_atual <= item.estoque_minimo;
                
                return (
                  <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">{item.sku}</td>
                    <td className="py-3 px-4 font-medium text-slate-200">{item.nome}</td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      <span className="bg-slate-800 px-2 py-1 rounded-md border border-slate-700">
                        {formatarCategoria(item.categoria)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400">
                      {item.preco_venda > 0 ? `R$ ${Number(item.preco_venda).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold">{item.estoque_atual}</td>
                    <td className="py-3 px-4">
                      {emAlerta ? (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs font-medium">
                          Repor Estoque
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-medium">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé de Paginação */}
      <div className="flex justify-between items-center pt-2 text-xs text-slate-400">
        <span>
          Página {paginaAtual} de {totalPaginas} ({produtosFiltrados.length} itens exibidos)
        </span>
        <div className="flex gap-2">
          <button
            disabled={paginaAtual === 1}
            onClick={() => setPaginaAtual((p) => p - 1)}
            className="px-3 py-1 bg-slate-950 border border-slate-800 rounded disabled:opacity-40 hover:bg-slate-800 transition-colors"
          >
            Anterior
          </button>
          <button
            disabled={paginaAtual === totalPaginas}
            onClick={() => setPaginaAtual((p) => p + 1)}
            className="px-3 py-1 bg-slate-950 border border-slate-800 rounded disabled:opacity-40 hover:bg-slate-800 transition-colors"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}