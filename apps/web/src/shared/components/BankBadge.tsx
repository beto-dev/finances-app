import { useState } from 'react'

interface BankConfig {
  domain: string
  short: string
  textColor: string
  bgColor: string
  borderColor: string
}

const BANK_CONFIG: Record<string, BankConfig> = {
  'Banco de Chile':          { domain: 'bancochile.cl',        short: 'BCH', textColor: '#B91C1C', bgColor: '#FEF2F2', borderColor: '#FECACA' },
  'Banco Santander':         { domain: 'santander.cl',         short: 'SAN', textColor: '#B91C1C', bgColor: '#FEF2F2', borderColor: '#FECACA' },
  'BancoEstado':             { domain: 'bancoestado.cl',       short: 'BE',  textColor: '#1D4ED8', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  'Banco BCI':               { domain: 'bci.cl',               short: 'BCI', textColor: '#1E40AF', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  'Banco Itaú':              { domain: 'itau.cl',              short: 'ITÁ', textColor: '#C2410C', bgColor: '#FFF7ED', borderColor: '#FED7AA' },
  'Banco Scotiabank Chile':  { domain: 'scotiabank.cl',        short: 'SCO', textColor: '#9B1C1C', bgColor: '#FEF2F2', borderColor: '#FECACA' },
  'Banco Falabella':         { domain: 'bancofalabella.cl',    short: 'FAL', textColor: '#065F46', bgColor: '#ECFDF5', borderColor: '#A7F3D0' },
  'Banco Ripley':            { domain: 'bancoripley.cl',       short: 'RIP', textColor: '#5B21B6', bgColor: '#F5F3FF', borderColor: '#DDD6FE' },
  'Banco Security':          { domain: 'security.cl',          short: 'SEC', textColor: '#1E3A5F', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  'Banco BICE':              { domain: 'bice.cl',              short: 'BCE', textColor: '#1E3A5F', bgColor: '#F0F9FF', borderColor: '#BAE6FD' },
  'Banco Internacional':     { domain: 'bancointernacional.cl',short: 'INT', textColor: '#1E40AF', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  'Banco Consorcio':         { domain: 'bancoconsorcio.cl',    short: 'CON', textColor: '#1E3A5F', bgColor: '#F0F9FF', borderColor: '#BAE6FD' },
  'Banco BTG Pactual Chile': { domain: 'btgpactual.com',       short: 'BTG', textColor: '#1E3A5F', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  'Coopeuch':                { domain: 'coopeuch.cl',          short: 'COO', textColor: '#065F46', bgColor: '#ECFDF5', borderColor: '#A7F3D0' },
  'Caja Los Andes':          { domain: 'cajalosandes.cl',      short: 'CLA', textColor: '#92400E', bgColor: '#FFFBEB', borderColor: '#FDE68A' },
  'MACH':                    { domain: 'somosmach.com',        short: 'MCH', textColor: '#6D28D9', bgColor: '#F5F3FF', borderColor: '#DDD6FE' },
  'Tenpo':                   { domain: 'tenpo.cl',             short: 'TNP', textColor: '#0369A1', bgColor: '#F0F9FF', borderColor: '#BAE6FD' },
  'Chek':                    { domain: 'chek.cl',              short: 'CHK', textColor: '#0369A1', bgColor: '#F0F9FF', borderColor: '#BAE6FD' },
  'Tapp':                    { domain: 'tapp.cl',              short: 'TAP', textColor: '#0369A1', bgColor: '#F0F9FF', borderColor: '#BAE6FD' },
  'Global66':                { domain: 'global66.com',         short: 'G66', textColor: '#6D28D9', bgColor: '#F5F3FF', borderColor: '#DDD6FE' },
  'Prepago Los Héroes':      { domain: 'losheroes.cl',         short: 'PLH', textColor: '#B45309', bgColor: '#FFFBEB', borderColor: '#FDE68A' },
}

const FALLBACK: BankConfig = { domain: '', short: '?', textColor: '#374151', bgColor: '#F9FAFB', borderColor: '#E5E7EB' }

interface Props {
  bank: string
  showName?: boolean
}

export default function BankBadge({ bank, showName = true }: Props) {
  const config = BANK_CONFIG[bank] ?? FALLBACK
  const [imgFailed, setImgFailed] = useState(false)

  const logoUrl = config.domain
    ? `https://www.google.com/s2/favicons?domain=${config.domain}&sz=32`
    : null

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className="shrink-0 w-5 h-5 rounded flex items-center justify-center overflow-hidden border"
        style={{ backgroundColor: config.bgColor, borderColor: config.borderColor }}
      >
        {logoUrl && !imgFailed ? (
          <img
            src={logoUrl}
            alt={bank}
            width={16}
            height={16}
            className="w-4 h-4 object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-[9px] font-bold leading-none" style={{ color: config.textColor }}>
            {config.short.slice(0, 2)}
          </span>
        )}
      </span>
      {showName && (
        <span className="truncate text-sm font-medium text-gray-700">{bank}</span>
      )}
    </span>
  )
}
