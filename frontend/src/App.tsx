import { useEffect, useState, type FormEvent } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'

type Profile = {
  id: number
  name: string
  role: string
  birthDate: string
  allergies: string
  notes: string
  medicines: number
}

type ProfileApiRow = {
  id: number
  name: string
  role: string
  birthDate: string
  allergies: string
  notes: string
}

type InventoryItem = {
  id: number
  name: string
  dosage: string
  form: string
  profileId: number | null
  profile: string
  quantity: number
  unit: string
  expiryDate: string
  threshold: number
  location: string
  notes: string
}

type InventoryForm = {
  name: string
  dosage: string
  form: string
  profileId: string
  quantity: string
  unit: string
  expiryDate: string
  threshold: string
  location: string
  notes: string
}

type InventoryApiRow = {
  id: number
  medicineId: number
  medicineName: string
  dosage: string
  form: string
  profileId: number | null
  profileName: string | null
  quantity: number
  unit: string
  expiryDate: string
  criticalThreshold: number
  location: string
  notes: string
}

type Movement = {
  id: number
  medicine: string
  profile: string
  type: 'prise' | 'ajout' | 'alerte'
  quantityDelta: number
  occurredAt: string
}

type MovementApiRow = {
  id: number
  stockItemId: number
  profileId: number | null
  profileName: string | null
  medicineName: string
  type: 'prise' | 'ajout' | 'alerte'
  quantityDelta: number
  note: string
  occurredAt: string
}

type Alert = {
  id: number
  severity: 'warning' | 'critical'
  title: string
  description: string
}

type NotificationApiRow = {
  id: number
  stockItemId: number | null
  profileId: number | null
  profileName: string | null
  medicineName: string
  kind: 'stock_critical' | 'stock_out' | 'expiry_soon'
  severity: 'warning' | 'critical'
  title: string
  description: string
  isRead: boolean
  createdAt: string
  readAt: string | null
}

type MarkAllNotificationsResponse = {
  updatedCount: number
}

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

type ChatApiRequest = {
  message: string
  history?: Array<{ role: 'user' | 'assistant', content: string }>
  requestId?: string
}

type ChatApiSuccess = {
  ok: true
  requestId: string | null
  reply: string
  disclaimer: string
  meta: {
    provider: string
    model: string
    latencyMs: number
    timeoutMs: number
  }
}

type ChatApiFailure = {
  ok: false
  requestId: string | null
  error: {
    code: string
    message: string
  }
  meta?: {
    provider: string | null
    model: string | null
    latencyMs: number
    timeoutMs: number
  }
}

type ChatStatusApiResponse = {
  ok: true
  provider: 'ollama' | 'llama_cpp'
  model: string
  baseUrl: string
  available: boolean
  reason: string | null
  checkedAt: string
  timeoutMs: number
}

type DashboardApiPayload = {
  stats: {
    totalMedicines: number
    criticalCount: number
    expiringCount: number
    outOfStockCount: number
  }
  alerts: Alert[]
  movements: MovementApiRow[]
  movementsByType: { prise: number, ajout: number, alerte: number }
  totalMovementsThisMonth: number
}

const navigation = [
  { to: '/', label: 'Tableau de bord', shortLabel: 'Dashboard' },
  { to: '/inventaire', label: 'Inventaire', shortLabel: 'Inventaire' },
  { to: '/profils', label: 'Profils', shortLabel: 'Profils' },
  { to: '/historique', label: 'Historique', shortLabel: 'Historique' },
  { to: '/notifications', label: 'Notifications', shortLabel: 'Notif' },
  { to: '/assistant', label: 'Assistant IA', shortLabel: 'Assistant' },
]

const profileRoles = [
  'Gestionnaire principal',
  'Patient chronique',
  'Senior',
  'Aidant familial',
] as const

type ProfileRole = (typeof profileRoles)[number]

type ProfileForm = {
  name: string
  role: ProfileRole
  birthDate: string
  allergies: string
  notes: string
}

type GestionTab = 'inventaire' | 'beneficiaires' | 'historique'

type InventoryActionResponse = {
  ok: true
  item: InventoryApiRow
  movement: MovementApiRow
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function fetchJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, init)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function getStatus(item: InventoryItem) {
  if (item.quantity <= 0) {
    return 'out'
  }

  const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  if (days <= 30) {
    return 'expiring'
  }

  if (item.quantity <= item.threshold) {
    return 'critical'
  }

  return 'ok'
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'out':
      return 'Rupture'
    case 'expiring':
      return 'Bientot perime'
    case 'critical':
      return 'Stock critique'
    default:
      return 'OK'
  }
}

function mapInventory(row: InventoryApiRow): InventoryItem {
  return {
    id: row.id,
    name: row.medicineName,
    dosage: row.dosage,
    form: row.form,
    profileId: row.profileId,
    profile: row.profileName ?? 'Foyer',
    quantity: row.quantity,
    unit: row.unit,
    expiryDate: row.expiryDate,
    threshold: row.criticalThreshold,
    location: row.location,
    notes: row.notes,
  }
}

function toInventoryForm(item: InventoryItem): InventoryForm {
  return {
    name: item.name,
    dosage: item.dosage,
    form: item.form,
    profileId: item.profileId ? String(item.profileId) : '',
    quantity: String(item.quantity),
    unit: item.unit,
    expiryDate: item.expiryDate,
    threshold: String(item.threshold),
    location: item.location,
    notes: item.notes,
  }
}

function getEmptyInventoryForm(): InventoryForm {
  return {
    name: '',
    dosage: '',
    form: 'Comprime',
    profileId: '',
    quantity: '0',
    unit: 'comprimes',
    expiryDate: new Date().toISOString().slice(0, 10),
    threshold: '1',
    location: '',
    notes: '',
  }
}

function mapMovement(row: MovementApiRow): Movement {
  return {
    id: row.id,
    medicine: row.medicineName,
    profile: row.profileName ?? 'Foyer',
    type: row.type,
    quantityDelta: row.quantityDelta,
    occurredAt: new Date(row.occurredAt).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getNotificationKindLabel(kind: NotificationApiRow['kind']) {
  switch (kind) {
    case 'stock_out':
      return 'Rupture'
    case 'stock_critical':
      return 'Stock critique'
    case 'expiry_soon':
      return 'Peremption'
    default:
      return 'Notification'
  }
}

function Layout() {
  const location = useLocation()
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [notificationRefreshToken, setNotificationRefreshToken] = useState(0)
  const pageTitleByPath: Record<string, string> = {
    '/': 'Tableau de bord',
    '/inventaire': 'Inventaire',
    '/profils': 'Profils',
    '/historique': 'Historique',
    '/notifications': 'Notifications',
    '/assistant': 'Assistant IA',
    '/gestion': 'Gestion',
  }
  const pageTitle = pageTitleByPath[location.pathname] ?? 'PharmaStock'

  useEffect(() => {
    let active = true

    async function loadUnreadNotifications() {
      try {
        const notifications = await fetchJson<NotificationApiRow[]>('/api/notifications?status=unread')

        if (active) {
          setUnreadNotificationsCount(notifications.length)
        }
      } catch {
        if (active) {
          setUnreadNotificationsCount(0)
        }
      }
    }

    void loadUnreadNotifications()
    const timerId = window.setInterval(() => {
      void loadUnreadNotifications()
    }, 15000)

    return () => {
      active = false
      window.clearInterval(timerId)
    }
  }, [location.pathname, notificationRefreshToken])

  function handleNotificationsUpdated() {
    setNotificationRefreshToken((current) => current + 1)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/logo-medistock.svg" alt="PharmaStock" className="logo" />
            <div>
              <p className="eyebrow">PharmaStock</p>
              <h1>Gestion des medicaments familiaux</h1>
            </div>
          </div>
          <p className="muted">Suivi simple et securise du stock, des profils et des alertes.</p>
        </div>

        <nav className="nav-list" aria-label="Navigation principale">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-card-label">Suivi alertes</span>
          <strong>Alerte pharmacie familiale</strong>
          <p className="muted">Consultez le tableau de bord pour le detail en temps reel.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Prototype de travail</p>
            <h2>{pageTitle}</h2>
            <p className="muted">5 mars 2026</p>
          </div>
          <div className="topbar-actions">
            <NavLink
              to="/notifications"
              className={({ isActive }) => (isActive ? 'notification-pill notification-pill-active' : 'notification-pill')}
            >
              Notifications
              {unreadNotificationsCount > 0 ? <span className="notification-count">{unreadNotificationsCount}</span> : null}
            </NavLink>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventaire" element={<InventoryPage />} />
          <Route path="/profils" element={<ProfilesPage />} />
          <Route path="/historique" element={<HistoryPage />} />
          <Route path="/notifications" element={<NotificationsPage onNotificationsUpdated={handleNotificationsUpdated} />} />
          <Route path="/gestion" element={<GestionPage initialTab="inventaire" />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Navigation mobile">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'bottom-link bottom-link-active' : 'bottom-link')}
          >
            {item.shortLabel}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function DashboardPage() {
  const [stats, setStats] = useState([
    { label: 'Medicaments', value: 0, icon: '\u{1F48A}', className: 'kpi-total' },
    { label: 'Stock critique', value: 0, icon: '\u26A0\uFE0F', className: 'kpi-critical' },
    { label: 'Bientot perimes', value: 0, icon: '\u23F3', className: 'kpi-expiring' },
    { label: 'Ruptures', value: 0, icon: '\u{1F6AB}', className: 'kpi-out' },
  ])
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([])
  const [recentMovements, setRecentMovements] = useState<Movement[]>([])
  const [chartItems, setChartItems] = useState<InventoryItem[]>([])
  const [dashboardProfiles, setDashboardProfiles] = useState<Profile[]>([])
  const [movementsByType, setMovementsByType] = useState({ prise: 0, ajout: 0, alerte: 0 })
  const [totalMovementsThisMonth, setTotalMovementsThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [dashboard, inventoryRows, profileRows] = await Promise.all([
          fetchJson<DashboardApiPayload>('/api/dashboard'),
          fetchJson<InventoryApiRow[]>('/api/inventory'),
          fetchJson<ProfileApiRow[]>('/api/profiles'),
        ])

        if (!mounted) {
          return
        }

        setStats([
          { label: 'Medicaments', value: dashboard.stats.totalMedicines, icon: '\u{1F48A}', className: 'kpi-total' },
          { label: 'Stock critique', value: dashboard.stats.criticalCount, icon: '\u26A0\uFE0F', className: 'kpi-critical' },
          { label: 'Bientot perimes', value: dashboard.stats.expiringCount, icon: '\u23F3', className: 'kpi-expiring' },
          { label: 'Ruptures', value: dashboard.stats.outOfStockCount, icon: '\u{1F6AB}', className: 'kpi-out' },
        ])

        setActiveAlerts(dashboard.alerts)
        setRecentMovements(dashboard.movements.map(mapMovement))
        setMovementsByType(dashboard.movementsByType ?? { prise: 0, ajout: 0, alerte: 0 })
        setTotalMovementsThisMonth(dashboard.totalMovementsThisMonth ?? 0)

        const mappedInventory = inventoryRows.map(mapInventory)
        setChartItems(mappedInventory)

        const medicinesByProfile = new Map<number, number>()

        for (const item of inventoryRows) {
          if (item.profileId === null) {
            continue
          }

          const current = medicinesByProfile.get(item.profileId) ?? 0
          medicinesByProfile.set(item.profileId, current + 1)
        }

        setDashboardProfiles(profileRows.map((profile) => ({
          ...profile,
          medicines: medicinesByProfile.get(profile.id) ?? 0,
        })))
      } catch {
        if (mounted) {
          setError('Impossible de charger le tableau de bord depuis l API.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical')
  const warningAlerts = activeAlerts.filter((a) => a.severity === 'warning')

  const groupedMovements: Array<{ date: string, items: Movement[] }> = []
  for (const m of recentMovements) {
    const dateKey = m.occurredAt.split(',')[0]?.trim() ?? m.occurredAt
    const existing = groupedMovements.find((g) => g.date === dateKey)
    if (existing) {
      existing.items.push(m)
    } else {
      groupedMovements.push({ date: dateKey, items: [m] })
    }
  }

  const movementTypeLabel: Record<string, string> = { prise: 'Prise', ajout: 'Ajout', alerte: 'Alerte' }

  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card stat-card ${stat.className}`}>
            <div className="kpi-header">
              <span className="kpi-icon">{stat.icon}</span>
              <span className="eyebrow">Vue globale</span>
            </div>
            <strong>{stat.value}</strong>
            <p>{stat.label}</p>
          </article>
        ))}
      </div>

      <div className="dashboard-lower">
        <article className="card chart-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h3>Niveaux de stock</h3>
              <p className="muted">Vue de pilotage pour le gestionnaire principal et les aidants familiaux.</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartItems}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantity" fill="var(--accent)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card monthly-summary-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ce mois</p>
              <h3>Activite mensuelle</h3>
            </div>
          </div>
          <div className="monthly-stats">
            <div className="monthly-stat">
              <span className="monthly-stat-value">{totalMovementsThisMonth}</span>
              <span className="muted">Mouvements</span>
            </div>
            <div className="monthly-breakdown">
              <div className="monthly-type">
                <span className="movement-badge movement-badge-prise">Prises</span>
                <strong>{movementsByType.prise}</strong>
              </div>
              <div className="monthly-type">
                <span className="movement-badge movement-badge-ajout">Ajouts</span>
                <strong>{movementsByType.ajout}</strong>
              </div>
              <div className="monthly-type">
                <span className="movement-badge movement-badge-alerte">Alertes</span>
                <strong>{movementsByType.alerte}</strong>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-lower">
        <article className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Alertes</p>
              <h3>Alertes actives
                {activeAlerts.length > 0 && <span className="alert-count-badge">{activeAlerts.length}</span>}
              </h3>
            </div>
            {activeAlerts.length > 0 && (
              <div className="alert-severity-counts">
                {criticalAlerts.length > 0 && <span className="pill pill-critical">{criticalAlerts.length} critique{criticalAlerts.length > 1 ? 's' : ''}</span>}
                {warningAlerts.length > 0 && <span className="pill pill-warning">{warningAlerts.length} attention</span>}
              </div>
            )}
          </div>
          <div className="stack-list">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className={`alert-row alert-${alert.severity}`}>
                <div className="alert-content">
                  <span className="alert-icon">{alert.severity === 'critical' ? '\u{1F534}' : '\u{1F7E0}'}</span>
                  <div>
                    <strong>{alert.title}</strong>
                    <p className="muted">{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
            {!loading && activeAlerts.length === 0 ? <p className="muted">Aucune alerte active.</p> : null}
          </div>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Famille</p>
              <h3>Profils</h3>
            </div>
          </div>
          <div className="stack-list">
            {dashboardProfiles.map((profile) => (
              <div key={profile.id} className="profile-row">
                <div>
                  <strong>{profile.name}</strong>
                  <p className="muted">{profile.role}</p>
                </div>
                <span className="pill">{profile.medicines} med.</span>
              </div>
            ))}
            {!loading && dashboardProfiles.length === 0 ? <p className="muted">Aucun profil disponible.</p> : null}
          </div>
        </article>
      </div>

      <article className="card timeline-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Suivi</p>
            <h3>Derniers mouvements</h3>
          </div>
        </div>
        {groupedMovements.length > 0 ? (
          <div className="timeline">
            {groupedMovements.map((group) => (
              <div key={group.date} className="timeline-group">
                <div className="timeline-date-label">{group.date}</div>
                <div className="timeline-items">
                  {group.items.map((movement) => (
                    <div key={movement.id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-row">
                          <span className={`movement-badge movement-badge-${movement.type}`}>
                            {movementTypeLabel[movement.type] ?? movement.type}
                          </span>
                          <strong>{movement.medicine}</strong>
                          <span className="muted">{movement.profile}</span>
                        </div>
                        <div className="timeline-row">
                          <strong className={movement.quantityDelta > 0 ? 'text-positive' : 'text-negative'}>
                            {movement.quantityDelta > 0 ? `+${movement.quantityDelta}` : movement.quantityDelta}
                          </strong>
                          <span className="muted">{movement.occurredAt.split(',')[1]?.trim() ?? ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !loading ? (
          <p className="muted">Aucun mouvement recent.</p>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
      </article>
    </section>
  )
}

function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [profileOptions, setProfileOptions] = useState<Array<{ id: number, name: string }>>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<InventoryForm>(getEmptyInventoryForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  async function loadInventory(preferredId?: number | null) {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()

      if (search.trim()) {
        params.set('search', search.trim())
      }

      if (status !== 'all') {
        params.set('status', status)
      }

      const query = params.toString()
      const inventoryPath = query ? `/api/inventory?${query}` : '/api/inventory'

      const [inventoryRows, profileRows] = await Promise.all([
        fetchJson<InventoryApiRow[]>(inventoryPath),
        fetchJson<ProfileApiRow[]>('/api/profiles'),
      ])

      const mapped = inventoryRows.map(mapInventory)

      setItems(mapped)
      setProfileOptions(profileRows.map((row) => ({ id: row.id, name: row.name })))

      if (mapped.length === 0) {
        setSelectedId(null)
        setMode('create')
        setForm(getEmptyInventoryForm())
        return
      }

      const candidateId = preferredId ?? selectedId
      const hasCandidate = candidateId !== null && mapped.some((item) => item.id === candidateId)
      const nextId = hasCandidate ? candidateId : mapped[0].id

      setSelectedId(nextId)

      if (mode === 'edit') {
        const selected = mapped.find((item) => item.id === nextId)

        if (selected) {
          setForm(toInventoryForm(selected))
        }
      }
    } catch {
      setError('Impossible de charger l inventaire. Verifie que le backend tourne sur le port 4000.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInventory()
  }, [search, status])

  const selectedItem = items.find((item) => item.id === selectedId) ?? null

  function startCreate() {
    setMode('create')
    setSelectedId(null)
    setForm(getEmptyInventoryForm())
    setError(null)
  }

  function startEdit(item: InventoryItem) {
    setMode('edit')
    setSelectedId(item.id)
    setForm(toInventoryForm(item))
    setError(null)
  }

  function setField(field: keyof InventoryForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const quantity = Number(form.quantity)
    const threshold = Number(form.threshold)

    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(threshold) || threshold < 0) {
      setError('Quantite et seuil critique doivent etre des nombres entiers >= 0.')
      return
    }

    const payload = {
      medicineName: form.name.trim(),
      dosage: form.dosage.trim(),
      form: form.form.trim(),
      profileId: form.profileId ? Number(form.profileId) : null,
      quantity,
      unit: form.unit.trim(),
      expiryDate: form.expiryDate,
      criticalThreshold: threshold,
      location: form.location.trim(),
      notes: form.notes.trim(),
    }

    if (!payload.medicineName || !payload.dosage || !payload.form || !payload.unit || !payload.expiryDate || !payload.location) {
      setError('Tous les champs obligatoires doivent etre remplis.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const isCreate = mode === 'create' || selectedItem === null
      const path = isCreate ? '/api/inventory' : `/api/inventory/${selectedItem.id}`
      const method = isCreate ? 'POST' : 'PUT'

      const saved = await fetchJson<InventoryApiRow>(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setMode('edit')
      setSelectedId(saved.id)
      setForm(toInventoryForm(mapInventory(saved)))
      await loadInventory(saved.id)
    } catch {
      setError('Echec de sauvegarde inventaire.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedItem) {
      return
    }

    if (!globalThis.confirm(`Supprimer ${selectedItem.name} de l inventaire ?`)) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await fetchJson<void>(`/api/inventory/${selectedItem.id}`, { method: 'DELETE' })
      startCreate()
      await loadInventory()
    } catch {
      setError('Echec de suppression inventaire.')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickAction(type: 'prise' | 'ajout') {
    if (!selectedItem) {
      return
    }

    const quantityInput = globalThis.prompt(
      type === 'prise' ? 'Quantite prise ?' : 'Quantite ajoutee ?',
      '1',
    )

    if (quantityInput === null) {
      return
    }

    const quantity = Number.parseInt(quantityInput, 10)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Saisis une quantite entiere positive.')
      return
    }

    setActionPending(true)
    setError(null)

    try {
      await fetchJson<InventoryActionResponse>(`/api/inventory/${selectedItem.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          quantity,
          note: type === 'prise' ? 'Prise enregistree depuis Inventaire' : 'Ajout enregistre depuis Inventaire',
        }),
      })

      await loadInventory(selectedItem.id)
    } catch {
      setError(type === 'prise'
        ? 'Echec de la prise (stock insuffisant ou item introuvable).'
        : 'Echec de l ajout de stock.')
    } finally {
      setActionPending(false)
    }
  }

  let submitLabel = mode === 'create' ? 'Ajouter medicament' : 'Enregistrer modification'

  if (saving) {
    submitLabel = 'Sauvegarde...'
  }

  return (
    <section className="page-grid inventory-layout">
      <article className="card inventory-list-card">
        <div className="section-heading inventory-toolbar">
          <div>
            <p className="eyebrow">Inventaire</p>
            <h3>Gestion du stock</h3>
          </div>
          <button className="primary-button" type="button" onClick={startCreate}>Ajouter un medicament</button>
        </div>

        <div className="toolbar-row">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un medicament"
            aria-label="Rechercher un medicament"
          />
            <select
              className="select-input"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filtrer l inventaire par statut"
            >
            <option value="all">Tous les statuts</option>
            <option value="ok">OK</option>
            <option value="critical">Stock critique</option>
            <option value="expiring">Bientot perime</option>
            <option value="out">Rupture</option>
          </select>
        </div>

        {loading ? <p>Chargement de l inventaire...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="inventory-grid">
          {items.map((item) => {
            const statusLabel = getStatusLabel(getStatus(item))
            return (
              <button
                key={item.id}
                type="button"
                className={selectedItem?.id === item.id ? 'inventory-card inventory-card-active' : 'inventory-card'}
                onClick={() => startEdit(item)}
              >
                <div className="inventory-card-head">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">{item.dosage} - {item.profile}</p>
                  </div>
                  <span className="pill">{statusLabel}</span>
                </div>
                <progress className="progress-meter" value={item.quantity} max={Math.max(item.threshold * 4, 1)} />
                <p className="muted">{item.quantity} {item.unit} - Exp. {item.expiryDate}</p>
              </button>
            )
          })}
        </div>
      </article>

      <article className="card detail-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{mode === 'create' ? 'Nouveau medicament' : 'Edition medicament'}</p>
            <h3>{mode === 'create' ? 'Ajouter un element' : selectedItem?.name ?? 'Modifier element'}</h3>
          </div>
          {mode === 'edit' && selectedItem ? <span className="pill">{selectedItem.profile}</span> : null}
        </div>

        <form className="inventory-form" onSubmit={handleSubmit}>
          <div className="inventory-form-grid">
            <label className="field-stack">
              <span>Nom du medicament</span>
              <input className="search-input" value={form.name} onChange={(event) => setField('name', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Dosage</span>
              <input className="search-input" value={form.dosage} onChange={(event) => setField('dosage', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Forme</span>
              <input className="search-input" value={form.form} onChange={(event) => setField('form', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Profil</span>
              <select className="select-input" value={form.profileId} onChange={(event) => setField('profileId', event.target.value)} disabled={saving}>
                <option value="">Aucun profil</option>
                {profileOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span>Quantite</span>
              <input className="search-input" type="number" min="0" value={form.quantity} onChange={(event) => setField('quantity', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Unite</span>
              <input className="search-input" value={form.unit} onChange={(event) => setField('unit', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Date de peremption</span>
              <input className="search-input" type="date" value={form.expiryDate} onChange={(event) => setField('expiryDate', event.target.value)} disabled={saving} />
            </label>

            <label className="field-stack">
              <span>Seuil critique</span>
              <input className="search-input" type="number" min="0" value={form.threshold} onChange={(event) => setField('threshold', event.target.value)} disabled={saving} />
            </label>
          </div>

          <label className="field-stack">
            <span>Emplacement</span>
            <input className="search-input" value={form.location} onChange={(event) => setField('location', event.target.value)} disabled={saving} />
          </label>

          <label className="field-stack">
            <span>Notes</span>
            <textarea className="profile-textarea" rows={3} value={form.notes} onChange={(event) => setField('notes', event.target.value)} disabled={saving} />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>{submitLabel}</button>
            {mode === 'edit' && selectedItem ? (
              <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={saving}>
                Supprimer
              </button>
            ) : null}
          </div>

          {mode === 'edit' && selectedItem ? (
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => void handleQuickAction('prise')} disabled={actionPending || saving}>
                Enregistrer une prise
              </button>
              <button className="secondary-button" type="button" onClick={() => void handleQuickAction('ajout')} disabled={actionPending || saving}>
                Ajouter du stock
              </button>
            </div>
          ) : null}
        </form>
      </article>
    </section>
  )
}

function GestionPage({ initialTab = 'inventaire' }: { initialTab?: GestionTab }) {
  const [activeTab, setActiveTab] = useState<GestionTab>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return (
    <>
      <section className="page-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Gestion</p>
              <h3>Inventaire, beneficiaires et historique</h3>
              <p className="muted">Cette page regroupe toutes les operations de gestion du foyer.</p>
            </div>
          </div>

          <div className="button-row" aria-label="Onglets gestion">
            <button
              className={activeTab === 'inventaire' ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => setActiveTab('inventaire')}
            >
              Inventaire
            </button>
            <button
              className={activeTab === 'beneficiaires' ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => setActiveTab('beneficiaires')}
            >
              Beneficiaires
            </button>
            <button
              className={activeTab === 'historique' ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => setActiveTab('historique')}
            >
              Historique
            </button>
          </div>
        </article>
      </section>

      {activeTab === 'inventaire' ? <InventoryPage /> : null}
      {activeTab === 'beneficiaires' ? <ProfilesPage /> : null}
      {activeTab === 'historique' ? <HistoryPage /> : null}
    </>
  )
}

function ProfilesPage() {
  const [profileRows, setProfileRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    role: profileRoles[0],
    birthDate: '',
    allergies: '',
    notes: '',
  })

  function mapProfile(row: ProfileApiRow, medicinesByProfile: Map<number, number>): Profile {
    return {
      ...row,
      medicines: medicinesByProfile.get(row.id) ?? 0,
    }
  }

  async function loadProfiles() {
    setLoading(true)
    setError(null)

    try {
      const [rows, inventoryRows] = await Promise.all([
        fetchJson<ProfileApiRow[]>('/api/profiles'),
        fetchJson<InventoryApiRow[]>('/api/inventory'),
      ])

      const medicinesByProfile = new Map<number, number>()

      for (const item of inventoryRows) {
        if (item.profileId === null) {
          continue
        }

        const current = medicinesByProfile.get(item.profileId) ?? 0
        medicinesByProfile.set(item.profileId, current + 1)
      }

      setProfileRows(rows.map((row) => mapProfile(row, medicinesByProfile)))
    } catch {
      setError('Impossible de charger les profils. Verifie que le backend tourne sur le port 4000.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProfiles()
  }, [])

  function resetForm() {
    setForm({
      name: '',
      role: profileRoles[0],
      birthDate: '',
      allergies: '',
      notes: '',
    })
    setEditingId(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      role: form.role,
      birthDate: form.birthDate,
      allergies: form.allergies.trim() || 'Aucune',
      notes: form.notes.trim(),
    }

    if (!payload.name || !payload.birthDate) {
      setSaving(false)
      setError('Le nom et la date de naissance sont obligatoires.')
      return
    }

    try {
      if (editingId === null) {
        await fetchJson<ProfileApiRow>('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson<ProfileApiRow>(`/api/profiles/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      await loadProfiles()
      resetForm()
    } catch {
      setError('Echec de sauvegarde du profil.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(profile: Profile) {
    setEditingId(profile.id)
    setForm({
      name: profile.name,
      role: profile.role as ProfileRole,
      birthDate: profile.birthDate,
      allergies: profile.allergies,
      notes: profile.notes,
    })
  }

  async function handleDelete(profileId: number) {
    setSaving(true)
    setError(null)

    try {
      await fetchJson<void>(`/api/profiles/${profileId}`, { method: 'DELETE' })
      await loadProfiles()
      if (editingId === profileId) {
        resetForm()
      }
    } catch {
      setError('Echec de suppression du profil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-grid profiles-crud-layout">
      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Beneficiaires familiaux</p>
            <h3>{editingId === null ? 'Creer un beneficiaire' : 'Modifier le beneficiaire'}</h3>
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <label className="field-stack" htmlFor="profile-name">
            <span>Nom</span>
            <input
              id="profile-name"
              className="search-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex: Mamie Jeanne"
              disabled={saving}
            />
          </label>

          <label className="field-stack" htmlFor="profile-role">
            <span>Role du beneficiaire</span>
            <select
              id="profile-role"
              className="select-input"
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as ProfileRole }))}
              disabled={saving}
            >
              {profileRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <small className="muted">Le role sert a classer la personne du foyer (pas un medecin ou un client externe).</small>
          </label>

          <label className="field-stack" htmlFor="profile-birth-date">
            <span>Date de naissance</span>
            <input
              id="profile-birth-date"
              type="date"
              className="search-input"
              value={form.birthDate}
              onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
              disabled={saving}
            />
          </label>

          <label className="field-stack" htmlFor="profile-allergies">
            <span>Allergies</span>
            <input
              id="profile-allergies"
              className="search-input"
              value={form.allergies}
              onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))}
              placeholder="Ex: Penicilline"
              disabled={saving}
            />
          </label>

          <label className="field-stack field-full-width" htmlFor="profile-notes">
            <span>Notes</span>
            <textarea
              id="profile-notes"
              className="profile-textarea"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Informations complementaires"
              disabled={saving}
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {editingId === null ? 'Ajouter beneficiaire' : 'Enregistrer beneficiaire'}
            </button>
            {editingId !== null ? (
              <button className="secondary-button" type="button" onClick={resetForm} disabled={saving}>
                Annuler
              </button>
            ) : null}
          </div>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Liste beneficiaires</p>
            <h3>{profileRows.length} beneficiaires</h3>
          </div>
          <button className="secondary-button" type="button" onClick={() => void loadProfiles()} disabled={loading || saving}>
            Rafraichir
          </button>
        </div>

        {loading ? <p>Chargement des beneficiaires...</p> : null}

        <div className="stack-list">
          {profileRows.map((profile) => (
            <article key={profile.id} className="profile-item">
              <div>
                <strong>{profile.name}</strong>
                <p className="muted">{profile.role}</p>
                <p><strong>Naissance:</strong> {profile.birthDate}</p>
                <p><strong>Allergies:</strong> {profile.allergies}</p>
                <p><strong>Notes:</strong> {profile.notes || 'Aucune note'}</p>
                <p><strong>Medicaments attribues:</strong> {profile.medicines}</p>
              </div>

              <div className="button-row">
                <button className="secondary-button" type="button" onClick={() => handleEdit(profile)} disabled={saving}>
                  Modifier
                </button>
                <button className="danger-button" type="button" onClick={() => void handleDelete(profile.id)} disabled={saving}>
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function HistoryPage() {
  const [type, setType] = useState('all')
  const [profileFilter, setProfileFilter] = useState('all')
  const [historyRows, setHistoryRows] = useState<Movement[]>([])
  const [profileOptions, setProfileOptions] = useState<Array<{ id: number, name: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadHistory() {
      setLoading(true)

      try {
        const [rows, profileRows] = await Promise.all([
          fetchJson<MovementApiRow[]>('/api/history'),
          fetchJson<ProfileApiRow[]>('/api/profiles'),
        ])

        if (mounted) {
          setHistoryRows(rows.map(mapMovement))
          setProfileOptions(profileRows.map((p) => ({ id: p.id, name: p.name })))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      mounted = false
    }
  }, [])

  const filteredMovements = historyRows.filter((movement) => {
    const matchesType = type === 'all' ? true : movement.type === type
    const matchesProfile = profileFilter === 'all' ? true : movement.profile === profileFilter
    return matchesType && matchesProfile
  })

  return (
    <section className="page-grid">
      <article className="card">
        <div className="section-heading inventory-toolbar">
          <div>
            <p className="eyebrow">Historique</p>
            <h3>Mouvements de stock</h3>
          </div>
        </div>

        <div className="toolbar-row">
          <select
            className="select-input"
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="Filtrer l historique par type"
          >
            <option value="all">Tous les mouvements</option>
            <option value="prise">Prise</option>
            <option value="ajout">Ajout</option>
            <option value="alerte">Alerte</option>
          </select>
          <select
            className="select-input"
            value={profileFilter}
            onChange={(event) => setProfileFilter(event.target.value)}
            aria-label="Filtrer l historique par profil"
          >
            <option value="all">Tous les profils</option>
            {profileOptions.map((profile) => (
              <option key={profile.id} value={profile.name}>{profile.name}</option>
            ))}
          </select>
        </div>

        <div className="stack-list">
          {loading ? <p>Chargement de l historique...</p> : null}
          {filteredMovements.map((movement) => (
            <div key={movement.id} className="movement-row movement-row-large">
              <div>
                <strong>{movement.medicine}</strong>
                <p className="muted">{movement.profile} - {movement.type}</p>
              </div>
              <div className="align-right">
                <strong>{movement.quantityDelta > 0 ? `+${movement.quantityDelta}` : movement.quantityDelta}</strong>
                <p className="muted">{movement.occurredAt}</p>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function NotificationsPage({ onNotificationsUpdated }: { onNotificationsUpdated: () => void }) {
  const [notifications, setNotifications] = useState<NotificationApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<number | 'all' | null>(null)

  async function loadNotifications() {
    setLoading(true)
    setError(null)

    try {
      const rows = await fetchJson<NotificationApiRow[]>('/api/notifications')
      setNotifications(rows)
    } catch {
      setError('Impossible de charger le centre notifications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()
  }, [])

  async function handleMarkAsRead(notificationId: number) {
    setPendingAction(notificationId)
    setError(null)

    try {
      await fetchJson<NotificationApiRow>(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
      })

      await loadNotifications()
      onNotificationsUpdated()
    } catch {
      setError('Impossible de marquer cette notification comme lue.')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleMarkAllAsRead() {
    setPendingAction('all')
    setError(null)

    try {
      await fetchJson<MarkAllNotificationsResponse>('/api/notifications/read-all', {
        method: 'PATCH',
      })

      await loadNotifications()
      onNotificationsUpdated()
    } catch {
      setError('Impossible de marquer toutes les notifications comme lues.')
    } finally {
      setPendingAction(null)
    }
  }

  const unreadNotifications = notifications.filter((notification) => !notification.isRead)
  const readNotifications = notifications.filter((notification) => notification.isRead)

  return (
    <section className="page-grid notifications-layout">
      <article className="card">
        <div className="section-heading inventory-toolbar">
          <div>
            <p className="eyebrow">Centre notifications</p>
            <h3>Suivi des evenements critiques</h3>
            <p className="muted">Chaque alerte importante du stock cree une notification persistante et tracable.</p>
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => void loadNotifications()} disabled={loading || pendingAction !== null}>
              Rafraichir
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleMarkAllAsRead()}
              disabled={unreadNotifications.length === 0 || pendingAction !== null}
            >
              {pendingAction === 'all' ? 'Traitement...' : 'Tout marquer comme lu'}
            </button>
          </div>
        </div>

        <div className="stats-grid simple-grid notifications-summary-grid">
          <article className="card stat-card">
            <span className="eyebrow">Non lues</span>
            <strong>{unreadNotifications.length}</strong>
            <p>Notifications a traiter</p>
          </article>
          <article className="card stat-card">
            <span className="eyebrow">Lues</span>
            <strong>{readNotifications.length}</strong>
            <p>Notifications archivees</p>
          </article>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A traiter</p>
            <h3>Notifications non lues</h3>
          </div>
        </div>

        {loading ? <p>Chargement des notifications...</p> : null}

        <div className="stack-list">
          {unreadNotifications.map((notification) => (
            <article
              key={notification.id}
              className={notification.severity === 'critical' ? 'notification-card notification-critical' : 'notification-card notification-warning'}
            >
              <div className="notification-main">
                <div className="notification-meta">
                  <span className="pill">{getNotificationKindLabel(notification.kind)}</span>
                  <span className="muted">{formatDateTime(notification.createdAt)}</span>
                </div>
                <strong>{notification.title}</strong>
                <p>{notification.description}</p>
                <p className="muted">
                  {notification.medicineName}
                  {notification.profileName ? ` - ${notification.profileName}` : ''}
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleMarkAsRead(notification.id)}
                disabled={pendingAction !== null}
              >
                {pendingAction === notification.id ? 'Traitement...' : 'Marquer comme lue'}
              </button>
            </article>
          ))}

          {!loading && unreadNotifications.length === 0 ? <p className="muted">Aucune notification non lue.</p> : null}
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Archive</p>
            <h3>Notifications lues</h3>
          </div>
        </div>

        <div className="stack-list">
          {readNotifications.map((notification) => (
            <article
              key={notification.id}
              className={notification.severity === 'critical' ? 'notification-card notification-card-read notification-critical' : 'notification-card notification-card-read notification-warning'}
            >
              <div className="notification-main">
                <div className="notification-meta">
                  <span className="pill">{getNotificationKindLabel(notification.kind)}</span>
                  <span className="muted">Creee le {formatDateTime(notification.createdAt)}</span>
                  {notification.readAt ? <span className="muted">Lue le {formatDateTime(notification.readAt)}</span> : null}
                </div>
                <strong>{notification.title}</strong>
                <p>{notification.description}</p>
                <p className="muted">
                  {notification.medicineName}
                  {notification.profileName ? ` - ${notification.profileName}` : ''}
                </p>
              </div>
            </article>
          ))}

          {!loading && readNotifications.length === 0 ? <p className="muted">Aucune notification lue pour le moment.</p> : null}
        </div>
      </article>
    </section>
  )
}

function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      content: 'Bonjour. Je peux aider sur le stock, les alertes, les profils et les renouvellements. Je reste informatif et ne remplace pas un avis medical.',
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<ChatStatusApiResponse | null>(null)
  const [isCheckingModel, setIsCheckingModel] = useState(true)

  const suggestions = [
    'Verifier interactions',
    'Enregistrer une prise',
    'Stock faible',
    'Prochain renouvellement',
  ]

  useEffect(() => {
    let active = true

    async function loadModelStatus(silent = false) {
      if (!silent) {
        setIsCheckingModel(true)
      }

      try {
        const status = await fetchJson<ChatStatusApiResponse>('/api/chat/status')

        if (!active) {
          return
        }

        setModelStatus(status)
      } catch {
        if (!active) {
          return
        }

        setModelStatus((previous) => ({
          ok: true,
          provider: previous?.provider ?? 'ollama',
          model: 'inconnu',
          baseUrl: 'n/a',
          available: false,
          reason: 'Impossible de verifier le modele local.',
          checkedAt: new Date().toISOString(),
          timeoutMs: 0,
        }))
      } finally {
        if (active && !silent) {
          setIsCheckingModel(false)
        }
      }
    }

    void loadModelStatus()
    const timerId = window.setInterval(() => {
      void loadModelStatus(true)
    }, 15000)

    return () => {
      active = false
      window.clearInterval(timerId)
    }
  }, [])

  const isModelAvailable = Boolean(modelStatus?.available)
  const canInteract = isModelAvailable && !isCheckingModel

  async function askChatApi(message: string, history: ChatApiRequest['history']) {
    const requestId = `${Date.now()}`

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, requestId } satisfies ChatApiRequest),
    })

    const payload = await response.json() as ChatApiSuccess | ChatApiFailure

    if (!response.ok || payload.ok === false) {
      const messageText = payload.ok === false
        ? payload.error.message
        : `HTTP ${response.status}`
      throw new Error(messageText)
    }

    return payload
  }

  async function sendMessage(message: string) {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) {
      return
    }

    if (!canInteract) {
      setChatError(modelStatus?.reason ?? 'Modele local indisponible. Demarre Ollama ou llama.cpp.')
      return
    }

    const historyContext = messages.slice(-8).map((entry) => ({ role: entry.role, content: entry.content }))

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', content: trimmedMessage },
    ])
    setInput('')
    setChatError(null)
    setLastFailedMessage(null)
    setIsTyping(true)

    try {
      const reply = await askChatApi(trimmedMessage, historyContext)

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `${reply.reply}\n\n${reply.disclaimer}`,
        },
      ])
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Erreur inconnue pendant la reponse du chat.'
      setChatError(messageText)
      setLastFailedMessage(trimmedMessage)
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'Je rencontre une erreur temporaire. Tu peux relancer avec Reessayer.',
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  function retryLastMessage() {
    if (!lastFailedMessage || isTyping) {
      return
    }

    void sendMessage(lastFailedMessage)
  }

  return (
    <section className="page-grid">
      <article className="card assistant-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assistant IA</p>
            <h3>Chat local</h3>
            <p className={isModelAvailable ? 'model-status model-status-ready' : 'model-status model-status-down'}>
              {isCheckingModel
                ? 'Modele local: verification...'
                : isModelAvailable
                  ? `Modele local: disponible (${modelStatus?.provider} / ${modelStatus?.model})`
                  : 'Modele local: indisponible'}
            </p>
            {!isCheckingModel && !isModelAvailable && modelStatus?.reason ? (
              <p className="muted">{modelStatus.reason}</p>
            ) : null}
          </div>
        </div>

        <div className="suggestion-row">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="secondary-button" onClick={() => void sendMessage(suggestion)} disabled={isTyping || !canInteract}>
              {suggestion}
            </button>
          ))}
        </div>

        <div className="chat-list">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'chat-bubble chat-user' : 'chat-bubble chat-assistant'}>
              {message.content}
            </div>
          ))}
          {isTyping ? <div className="chat-bubble chat-assistant">L assistant ecrit une reponse...</div> : null}
          {chatError ? <p className="error-text">Erreur chat: {chatError}</p> : null}
        </div>

        {lastFailedMessage ? (
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={retryLastMessage} disabled={isTyping}>
              Reessayer le dernier message
            </button>
          </div>
        ) : null}

        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault()
            void sendMessage(input)
          }}
        >
          <input
            className="search-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ecrire un message"
            aria-label="Ecrire un message"
            disabled={isTyping || !canInteract}
          />
          <button className="primary-button" type="submit" disabled={isTyping || !input.trim() || !canInteract}>
            {isTyping ? 'Envoi...' : 'Envoyer'}
          </button>
        </form>
      </article>
    </section>
  )
}

export default function App() {
  return <Layout />
}
