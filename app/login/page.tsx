'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'


export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()
  

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setCarregando(false)
      return
    }
    router.push('/')
    router.refresh() // garante que os Server Components vejam a nova sessão
  }

  return (
    <form onSubmit={handleLogin} /* use as classes de estilo que você já usa */>
      <h1>OrC Brasil — Acesso</h1>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail" />
      <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required placeholder="Senha" />
      {erro && <p>{erro}</p>}
      <button type="submit" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
    </form>
  )
}