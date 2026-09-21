import { supabase } from '../lib/supabase';

export const revalidate = 0;

export default async function Home() {
  // Busca a lista de produtos no Supabase ordenada por nome
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
            <p className="text-slate-400 text-sm font-medium">Total de Produtos</p>
            <p className="text-3xl font-bold mt-2 text-slate-100">{totalProdutos}</p>
            <p className="text-xs text-slate-500 mt-1">Cadastrados no banco de dados</p>
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

        {/* Tabela de Produtos */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              Catálogo de Produtos & Estoque
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">Preço Custo</th>
                  <th className="py-3 px-4">Preço Venda</th>
                  <th className="py-3 px-4">Estoque</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {listaProdutos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-500">
                      Nenhum produto cadastrado no momento.
                    </td>
                  </tr>
                ) : (
                  listaProdutos.map((item) => {
                    const emAlerta = item.estoque_atual <= item.estoque_minimo;
                    
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">{item.sku}</td>
                        <td className="py-3 px-4 font-medium text-slate-200">{item.nome}</td>
                        <td className="py-3 px-4 font-mono">
                          R$ {Number(item.preco_custo).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-400">
                          R$ {Number(item.preco_venda).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-semibold">{item.estoque_atual} un</td>
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
        </section>

      </div>
    </main>
  );
}