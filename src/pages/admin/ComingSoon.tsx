import { PageHeader, Panel } from '@/components/ui'

export default function ComingSoon({ eyebrow, title, phase, items }: { eyebrow: string; title: string; phase: string; items: string[] }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="notice"><b>{phase}.</b> O backend deste módulo já está implementado e testado; as telas serão entregues na próxima etapa.</div>
      <Panel title="O que será entregue">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">{items.map((i) => <li key={i}>{i}</li>)}</ul>
      </Panel>
    </>
  )
}
