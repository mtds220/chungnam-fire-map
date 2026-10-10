import { useEffect, useState } from 'react'
import AnalysisPanel from './components/AnalysisPanel'
import Header from './components/Header'
import Icon from './components/Icon'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import { useAnalysis, useStore } from './store'

type Tab = 'search' | 'map' | 'result'

const TABS: [Tab, string, string][] = [
  ['search', '검색·조건', 'magnifer-linear'],
  ['map', '지도', 'map-linear'],
  ['result', '분석 결과', 'chart-2-linear'],
]

export default function App() {
  const loadConfig = useStore((s) => s.loadConfig)
  const [tab, setTab] = useState<Tab>('map')
  useEffect(() => {
    loadConfig()
  }, [loadConfig])
  useAutoFill()

  return (
    <div className="flex h-[100dvh] flex-col gap-3 p-3 text-fg">
      <Header />

      {/* 모바일: 떠 있는 유리 세그먼트로 한 화면씩 */}
      <nav className="glass mx-auto grid w-full max-w-md grid-cols-3 gap-1 rounded-full p-1 text-sm lg:hidden" aria-label="화면 전환">
        {TABS.map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 transition-colors duration-500 ease-spring ${
              tab === k ? 'bg-fg font-semibold text-bg' : 'text-dim'
            }`}
            onClick={() => setTab(k)}
          >
            <Icon name={icon} size={15} />
            {label}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside className={`bezel reveal min-h-0 ${tab === 'search' ? 'flex' : 'hidden'} lg:flex`} style={{ '--i': 1 } as React.CSSProperties}>
          <div className="bezel-core min-h-0 flex-1 overflow-y-auto">
            <Sidebar onPicked={() => setTab('map')} />
          </div>
        </aside>
        {/* 지도는 숨기면 크기가 0 이 되어 다시 그려야 하므로, 모바일에서도 DOM 에 남기고 화면 밖으로만 뺀다 */}
        <section
          className={`bezel reveal relative flex min-h-0 ${tab === 'map' ? '' : 'max-lg:absolute max-lg:-left-[9999px] max-lg:h-[60vh] max-lg:w-full'}`}
          style={{ '--i': 2 } as React.CSSProperties}
          aria-label="지도"
        >
          <div className="bezel-core relative min-h-0 flex-1 overflow-hidden">
            <MapView />
          </div>
        </section>
        <aside className={`bezel reveal min-h-0 ${tab === 'result' ? 'flex' : 'hidden'} lg:flex`} style={{ '--i': 3 } as React.CSSProperties}>
          <div className="bezel-core min-h-0 flex-1 overflow-y-auto">
            <AnalysisPanel />
          </div>
        </aside>
      </main>
    </div>
  )
}

/**
 * 이미 분석한 목적지에서 조건(기준시간·출발 유형)을 바꾸면
 * 저장된 결과로 즉시 다시 판정하고, 새로 필요해진 관서만 추가로 계산한다.
 */
function useAutoFill() {
  const dest = useStore((s) => s.dest)
  const analyzed = useStore((s) => (s.dest ? Boolean(s.analyzed[s.dest.id]) : false))
  const run = useStore((s) => s.run)
  const runAnalysis = useStore((s) => s.runAnalysis)
  const pending = useAnalysis().stats.pending
  useEffect(() => {
    if (!dest || !analyzed || pending === 0 || run.status === 'running') return
    // 취소·오류 직후에는 자동으로 다시 돌리지 않는다 — 사용자가 버튼으로 다시 시작한다
    if (run.destId === dest.id && (run.status === 'canceled' || run.status === 'error')) return
    runAnalysis()
  }, [dest, analyzed, pending, run.status, run.destId, runAnalysis])
}
