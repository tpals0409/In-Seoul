import type { HelpTopic } from '@/types/contracts'
import { Icons } from '@/components/Icons'
import { useAppStore } from '@/store/appStore'

interface TopicEntry {
  title: string
  body: string
  ask: string
}

const TOPICS: Record<HelpTopic, TopicEntry> = {
  ltv: {
    title: 'LTV가 뭐예요?',
    body:
      'LTV(주택담보대출비율)는 집값 대비 대출 비율이에요.\n\n예를 들어 10억 원 집에 LTV 40%를 적용하면 단순 계산상 최대 4억 원까지 대출로 계산해요.',
    ask: 'LTV가 제 결과에 어떻게 영향을 주나요?',
  },
  dsr: {
    title: 'DSR이 뭐예요?',
    body:
      'DSR(총부채원리금상환비율)은 소득 대비 대출 상환 부담을 보는 기준이에요.\n\n소득에 비해 갚아야 할 돈이 많으면 대출 가능 금액이 줄어들 수 있어요.',
    ask: '제 조건에서 DSR은 어떤가요?',
  },
  rate: {
    title: '대출 금리란?',
    body:
      '대출 금리는 빌린 돈에 대해 매달 부담하는 이자 비율이에요.\n\n금리가 1%p만 올라도 30년 상환 기준 월 상환액은 꽤 큰 폭으로 늘어날 수 있어요.',
    ask: '금리가 오르면 제 부담은 얼마나 커져요?',
  },
  growth: {
    title: '집값 상승률이란?',
    body:
      '집값 상승률은 한 해 동안 주택 가격이 얼마나 오르는지를 나타내요.\n\n서울 5년 평균은 약 3% 수준으로, 시점에 따라 상하 변동이 클 수 있어요.',
    ask: '집값 상승률을 바꾸면 결과가 어떻게 달라져요?',
  },
  return: {
    title: '투자 수익률이란?',
    body:
      '투자 수익률은 자산을 굴려서 얻는 연평균 기대 수익률이에요.\n\nMMF·예금은 3~4%, 주식·ETF는 5~7% 수준이 일반적인 가정이에요.',
    ask: '제 자산 구조에 맞는 수익률은 얼마쯤일까요?',
  },
  'tx-cost': {
    title: '거래 비용이란?',
    body:
      '주택 매수 시 발생하는 취득세, 중개 수수료, 등기 비용 등을 합한 비율이에요.\n\nInSeoul은 단순화를 위해 주택 가격의 약 5%로 일괄 가정해요.',
    ask: '거래 비용은 제 결과에 어떤 영향을 줘요?',
  },
}

export function HelpSheet() {
  const topic = useAppStore((s) => s.ui.helpTopic)
  const closeHelp = useAppStore((s) => s.closeHelp)
  const openAi = useAppStore((s) => s.openAi)

  if (topic === null) return null
  const t = TOPICS[topic]

  const askAi = (q: string) => {
    closeHelp()
    openAi('question', q)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={closeHelp} />
      <div className="sheet" style={{ maxHeight: 380 }}>
        <div className="sheet-handle" />
        <div className="pad col gap-12" style={{ padding: '8px 24px 24px' }}>
          <div className="t-title" style={{ fontSize: 20 }}>{t.title}</div>
          <div className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{t.body}</div>
          <button
            className="ai-chip"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => askAi(t.ask)}
          >
            <Icons.Sparkles s={14} /> {t.ask}
          </button>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 4 }}
            onClick={closeHelp}
          >
            닫기
          </button>
        </div>
      </div>
    </>
  )
}
