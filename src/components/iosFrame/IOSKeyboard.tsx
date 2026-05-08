import { Fragment, type CSSProperties, type ReactNode } from 'react'

interface Props {
  dark?: boolean
}

interface KeyOpts {
  w?: number
  flex?: boolean
  ret?: boolean
  fs?: number
  k?: string
}

export function IOSKeyboard({ dark = false }: Props) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959'
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333'
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'

  const icons = {
    shift: (
      <svg width="19" height="17" viewBox="0 0 19 17">
        <path d="M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z" fill={glyph} />
      </svg>
    ),
    del: (
      <svg width="23" height="17" viewBox="0 0 23 17">
        <path
          d="M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z"
          fill="none"
          stroke={glyph}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M10 5l7 7M17 5l-7 7" stroke={glyph} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    ret: (
      <svg width="20" height="14" viewBox="0 0 20 14">
        <path
          d="M18 1v6H4m0 0l4-4M4 7l4 4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  }

  const renderKey = (content: ReactNode, opts: KeyOpts = {}) => {
    const { w, flex, ret, fs = 25, k } = opts
    const style: CSSProperties = {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph,
    }
    return (
      <div key={k} style={style}>
        {content}
      </div>
    )
  }

  const row = (keys: string[], pad = 0) => (
    <div style={{ display: 'flex', gap: 6.5, justifyContent: 'center', padding: `0 ${pad}px` }}>
      {keys.map((l) => renderKey(l, { flex: true, k: l }))}
    </div>
  )

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 15,
        borderRadius: 27,
        overflow: 'hidden',
        padding: '11px 0 2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: dark
          ? '0 -2px 20px rgba(0,0,0,0.09)'
          : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 27,
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 27,
          boxShadow: dark
            ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)'
            : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
          border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          padding: '8px 22px 13px',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {['"The"', 'the', 'to'].map((w, i) => (
          <Fragment key={w}>
            {i > 0 && <div style={{ width: 1, height: 25, background: '#ccc', opacity: 0.3 }} />}
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: '-apple-system, system-ui',
                fontSize: 17,
                color: sugg,
                letterSpacing: -0.43,
                lineHeight: '22px',
              }}
            >
              {w}
            </div>
          </Fragment>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
          padding: '0 6.5px',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'])}
        {row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20)}
        <div style={{ display: 'flex', gap: 14.25, alignItems: 'center' }}>
          {renderKey(icons.shift, { w: 45, k: 'shift' })}
          <div style={{ display: 'flex', gap: 6.5, flex: 1 }}>
            {['z', 'x', 'c', 'v', 'b', 'n', 'm'].map((l) => renderKey(l, { flex: true, k: l }))}
          </div>
          {renderKey(icons.del, { w: 45, k: 'del' })}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {renderKey('ABC', { w: 92.25, fs: 18, k: 'abc' })}
          {renderKey('', { flex: true, k: 'space' })}
          {renderKey(icons.ret, { w: 92.25, ret: true, k: 'ret' })}
        </div>
      </div>

      <div style={{ height: 56, width: '100%', position: 'relative' }} />
    </div>
  )
}
