import { supabase } from '../lib/supabase';
import TabelaProdutos from './components/TabelaProdutos';

export const revalidate = 0;

export default async function Home() {
  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    console.error('Erro ao carregar lista de produtos:', error);
  }

  const listaProdutos = produtos || [];
  const totalProdutos = listaProdutos.length;
  
  const itensEmAlerta = listaProdutos.filter(
    (item) => item.estoque_atual <= item.estoque_minimo
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <header className="border-b border-slate-800 pb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">
              OrC Brasil — Gestão de Vendas & Estoque
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Ambiente de Desenvolvimento | Painel Conectado ao Supabase
            </p>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300">
            Status: <span className="text-emerald-400 font-semibold">Online</span>
          </div>
        </header>

        {/* Dashboard Dinâmico */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">Total de Itens Cadastrados</p>
            <p className="text-3xl font-bold mt-2 text-slate-100">{totalProdutos}</p>
            <p className="text-xs text-slate-500 mt-1">Produtos acabados + Almoxarifado</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">Vendas Realizadas</p>
            <p className="text-3xl font-bold mt-2 text-emerald-400">R$ 0,00</p>
            <p className="text-xs text-slate-500 mt-1">Mês atual</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">Itens em Alerta</p>
            <p className={`text-3xl font-bold mt-2 ${itensEmAlerta > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
              {itensEmAlerta}
            </p>
            <p className="text-xs text-slate-500 mt-1">Estoque crítico / Ponto de pedido</p>
          </div>
        </section>

        {/* Tabela Interativa de Produtos */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              Catálogo Geral & Almoxarifado
            </h2>
          </div>

          <TabelaProdutos produtos={listaProdutos} />
        </section>

      </div>
    </main>
  );
}