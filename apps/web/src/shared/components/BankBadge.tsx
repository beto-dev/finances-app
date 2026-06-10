// Each entry uses the bank's actual brand color palette.
// Displayed as a colored pill + short name — more reliable than external logo APIs for Chilean banks.

interface BankConfig {
  label: string    // displayed inside badge
  fg: string       // text color
  bg: string       // background
  border: string
}

const BANK_CONFIG: Record<string, BankConfig> = {
  'Banco de Chile':          { label: 'BCH',  fg: '#fff',    bg: '#E31837', border: '#C00F2A' },
  'Banco Santander':         { label: 'SAN',  fg: '#fff',    bg: '#EC0000', border: '#C40000' },
  'BancoEstado':             { label: 'BE',   fg: '#fff',    bg: '#003DA6', border: '#002D7A' },
  'Banco BCI':               { label: 'BCI',  fg: '#fff',    bg: '#005DAB', border: '#004882' },
  'Banco Itaú':              { label: 'itaú', fg: '#fff',    bg: '#F98500', border: '#D97000' },
  'Banco Scotiabank Chile':  { label: 'SCO',  fg: '#fff',    bg: '#C8102E', border: '#A50D25' },
  'Banco Falabella':         { label: 'FAL',  fg: '#fff',    bg: '#00A651', border: '#007A3C' },
  'Banco Ripley':            { label: 'RIP',  fg: '#fff',    bg: '#612B7D', border: '#4A1F5E' },
  'Banco Security':          { label: 'SEC',  fg: '#fff',    bg: '#003087', border: '#002060' },
  'Banco BICE':              { label: 'BCE',  fg: '#fff',    bg: '#004F8B', border: '#003A66' },
  'Banco Internacional':     { label: 'INT',  fg: '#fff',    bg: '#003B8E', border: '#002C6A' },
  'Banco Consorcio':         { label: 'CON',  fg: '#fff',    bg: '#003D7C', border: '#002D5C' },
  'Banco BTG Pactual Chile': { label: 'BTG',  fg: '#fff',    bg: '#002D62', border: '#001E43' },
  'Coopeuch':                { label: 'COO',  fg: '#fff',    bg: '#00843D', border: '#005E2B' },
  'Caja Los Andes':          { label: 'CLA',  fg: '#fff',    bg: '#F7941D', border: '#D47A0E' },
  'MACH':                    { label: 'MCH',  fg: '#fff',    bg: '#6D1FBF', border: '#521796' },
  'Tenpo':                   { label: 'TNP',  fg: '#fff',    bg: '#00B4D8', border: '#0096B4' },
  'Chek':                    { label: 'CHK',  fg: '#fff',    bg: '#0077B6', border: '#005C8A' },
  'Tapp':                    { label: 'TAP',  fg: '#fff',    bg: '#023E8A', border: '#012D63' },
  'Global66':                { label: 'G66',  fg: '#fff',    bg: '#4C1D95', border: '#371571' },
  'Prepago Los Héroes':      { label: 'PLH',  fg: '#fff',    bg: '#C05621', border: '#9A4119' },
}

const FALLBACK: BankConfig = { label: '?', fg: '#374151', bg: '#F3F4F6', border: '#D1D5DB' }

interface Props {
  bank: string
  showName?: boolean
}

export default function BankBadge({ bank, showName = true }: Props) {
  const config = BANK_CONFIG[bank] ?? FALLBACK

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-md border text-[10px] font-bold tracking-wide px-1.5 py-0.5 leading-none"
        style={{ color: config.fg, backgroundColor: config.bg, borderColor: config.border }}
      >
        {config.label}
      </span>
      {showName && (
        <span className="truncate text-sm font-medium text-gray-700">{bank}</span>
      )}
    </span>
  )
}
