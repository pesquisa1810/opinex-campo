import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal'
import type { ReactNode } from 'react'

function Doc({ title, version, children }: { title: string; version: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-mist px-4 py-8">
      <article className="panel mx-auto max-w-3xl space-y-3 leading-relaxed [&_h2]:mt-5 [&_h2]:font-bold [&_h2]:text-navy">
        <Logo />
        <h1 className="mt-4">{title}</h1>
        <p className="k">Versão {version}. Modelo base — <b>requer revisão jurídica</b> pelo responsável antes do uso em produção.</p>
        {children}
        <p className="pt-4"><Link to="/cadastro" className="btn-link">Voltar ao cadastro</Link></p>
      </article>
    </main>
  )
}

export function Terms() {
  return (
    <Doc title="Termos de Uso" version={TERMS_VERSION}>
      <h2>1. Objeto</h2><p>O OPINEX CAMPO é uma ferramenta de gestão e coleta presencial de pesquisas de opinião. O acesso de entrevistadores depende de cadastro e aprovação do administrador.</p>
      <h2>2. Responsabilidades do entrevistador</h2><p>Aplicar os questionários com fidelidade, sem induzir respostas; registrar a localização real da entrevista; não compartilhar sua senha nem o celular autorizado; não copiar ou divulgar respostas.</p>
      <h2>3. Dispositivos</h2><p>A coleta só pode ser feita em celular autorizado pelo administrador por QR Code. A autorização pode ser revogada a qualquer momento.</p>
      <h2>4. Controle de qualidade</h2><p>As entrevistas passam por análise de qualidade (duração, localização, consistência). Entrevistas podem ser rejeitadas pelo administrador, com justificativa.</p>
      <h2>5. Suspensão</h2><p>O descumprimento destes termos pode resultar em bloqueio do acesso.</p>
    </Doc>
  )
}

export function Privacy() {
  return (
    <Doc title="Aviso de Privacidade" version={PRIVACY_VERSION}>
      <h2>1. Dados dos entrevistadores</h2><p>Coletamos nome, telefone, e-mail, dados técnicos do celular autorizado (navegador/sistema) e registros de uso, para fins de cadastro, autenticação, segurança e gestão da equipe (LGPD, art. 7º, V e IX).</p>
      <h2>2. Localização</h2><p>A localização (GPS) é capturada <b>somente no momento da entrevista</b>, mediante sua permissão no navegador. Não há rastreamento contínuo nem em segundo plano.</p>
      <h2>3. Dados dos entrevistados</h2><p>As pesquisas são desenhadas para não identificar os entrevistados. Opiniões políticas podem constituir dados pessoais sensíveis (LGPD, art. 5º, II) e recebem acesso restrito a administradores autorizados.</p>
      <h2>4. Compartilhamento e segurança</h2><p>Os dados ficam em banco de dados controlado pelo responsável pela pesquisa, com controle de acesso por perfil, criptografia em trânsito e registro de auditoria.</p>
      <h2>5. Retenção e direitos</h2><p>Os dados são mantidos pelo período necessário à finalidade e às obrigações legais. Você pode solicitar acesso, correção ou exclusão ao responsável pela pesquisa.</p>
    </Doc>
  )
}
