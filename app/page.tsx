export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho Principal */}
        <header className="border-b border-slate-800 pb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">
              OrC Brasil — Gestão de Vendas & Estoque
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Ambiente de Desenvolvimento | Painel de Controle
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300">
            Status:{" "}
            <span className="text-emerald-400 font-semibold">Online</span>
          </div>
        </header>

        {/* Card Provisório do Dashboard */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">
              Total de Produtos
            </p>
            <p className="text-3xl font-bold mt-2 text-slate-100">0</p>
            <p className="text-xs text-slate-500 mt-1">
              Aguardando modelagem do banco
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">
              Vendas Realizadas
            </p>
            <p className="text-3xl font-bold mt-2 text-emerald-400">R$ 0,00</p>
            <p className="text-xs text-slate-500 mt-1">Mês atual</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-400 text-sm font-medium">
              Itens em Alerta
            </p>
            <p className="text-3xl font-bold mt-2 text-amber-400">0</p>
            <p className="text-xs text-slate-500 mt-1">
              Ponto de pedido / Estoque baixo
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
