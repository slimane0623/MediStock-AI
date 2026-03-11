import { useEffect, useState, useTransition, type FormEvent } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { NavLink, Route, Routes } from 'react-router-dom'

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
  profile: string
  quantity: number
  unit: string
  expiryDate: string
  threshold: number
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

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

const profiles: Profile[] = [
  { id: 1, name: 'Danil', role: 'Gestionnaire principal', birthDate: '1999-05-10', allergies: 'Aucune', notes: 'Profil principal', medicines: 12 },
  { id: 2, name: 'Slim', role: 'Patient chronique', birthDate: '2000-02-14', allergies: 'Penicilline', notes: 'Suivi quotidien', medicines: 5 },
  { id: 3, name: 'Mamie Jeanne', role: 'Senior', birthDate: '1948-09-01', allergies: 'Aucune', notes: 'Traitement long', medicines: 8 },
  { id: 4, name: 'Claire', role: 'Aidant familial', birthDate: '1988-06-22', allergies: 'Aucune', notes: 'Peut assister les saisies', medicines: 0 },
]

const inventory: InventoryItem[] = [
  { id: 1, name: 'Doliprane', dosage: '1000 mg', form: 'Comprime', profile: 'Danil', quantity: 16, unit: 'comprimes', expiryDate: '2026-06-14', threshold: 4, location: 'Cuisine', notes: 'Boite entamee' },
  { id: 2, name: 'Metformine', dosage: '500 mg', form: 'Comprime', profile: 'Slim', quantity: 8, unit: 'comprimes', expiryDate: '2026-03-29', threshold: 5, location: 'Salon', notes: 'Renouvellement proche' },
  { id: 3, name: 'Levothyrox', dosage: '75 ug', form: 'Comprime', profile: 'Mamie Jeanne', quantity: 0, unit: 'comprimes', expiryDate: '2026-04-06', threshold: 2, location: 'Boite senior', notes: 'Rupture' },
  { id: 4, name: 'Amoxicilline', dosage: '500 mg', form: 'Gelule', profile: 'Danil', quantity: 10, unit: 'gelules', expiryDate: '2026-03-20', threshold: 3, location: 'Salle de bain', notes: 'Traitement en cours' },
]

const movements: Movement[] = [
  { id: 1, medicine: 'Doliprane 1000 mg', profile: 'Danil', type: 'prise', quantityDelta: -2, occurredAt: '10 mars 20:30' },
  { id: 2, medicine: 'Metformine 500 mg', profile: 'Slim', type: 'prise', quantityDelta: -1, occurredAt: '10 mars 12:00' },
  { id: 3, medicine: 'Doliprane 1000 mg', profile: 'Danil', type: 'ajout', quantityDelta: 16, occurredAt: '09 mars 18:15' },
  { id: 4, medicine: 'Levothyrox 75 ug', profile: 'Mamie Jeanne', type: 'alerte', quantityDelta: 0, occurredAt: '09 mars 08:00' },
]

const alerts: Alert[] = [
  { id: 1, severity: 'warning', title: 'Metformine bientot critique', description: '8 comprimes restants pour Slim' },
  { id: 2, severity: 'warning', title: 'Amoxicilline proche peremption', description: 'Peremption prevue le 2026-03-20' },
  { id: 3, severity: 'critical', title: 'Levothyrox en rupture', description: 'Aucun stock disponible pour Mamie Jeanne' },
]

const navigation = [
  { to: '/', label: 'Tableau de bord', shortLabel: 'Dashboard' },
  { to: '/inventaire', label: 'Inventaire', shortLabel: 'Inventaire' },
  { to: '/assistant', label: 'Assistant IA', shortLabel: 'Assistant' },
  { to: '/profils', label: 'Profils', shortLabel: 'Profils' },
  { to: '/historique', label: 'Historique', shortLabel: 'Historique' },
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
    profile: row.profileName ?? 'Foyer',
    quantity: row.quantity,
    unit: row.unit,
    expiryDate: row.expiryDate,
    threshold: row.criticalThreshold,
    location: row.location,
    notes: row.notes,
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

function Layout() {
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
          <span className="sidebar-card-label">3 alertes</span>
          <strong>Alerte pharmacie familiale</strong>
          <p className="muted">2 medicaments bientot perimes, 1 stock critique.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>Tableau de bord</h2>
            <p className="muted">5 mars 2026</p>
          </div>
          <div className="topbar-actions">
            <div className="notification-pill">3 alertes</div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventaire" element={<InventoryPage />} />
          <Route path="/profils" element={<ProfilesPage />} />
          <Route path="/historique" element={<HistoryPage />} />
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
  const stats = [
    { label: 'Medicaments', value: 8 },
    { label: 'Stock critique', value: inventory.filter((item) => getStatus(item) === 'critical').length },
    { label: 'Bientot perimes', value: inventory.filter((item) => getStatus(item) === 'expiring').length },
    { label: 'Ruptures', value: inventory.filter((item) => getStatus(item) === 'out').length },
  ]

  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="card stat-card">
            <span className="eyebrow">Indicateur</span>
            <strong>{stat.value}</strong>
            <p>{stat.label}</p>
          </article>
        ))}
      </div>

      <article className="card alerts-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Alertes actives</p>
            <h3>Suivi prioritaire</h3>
          </div>
        </div>
        <div className="stack-list">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert-row alert-${alert.severity}`}>
              <strong>{alert.title}</strong>
              <span className="pill">{alert.description}</span>
            </div>
          ))}
        </div>
      </article>

      <div className="dashboard-lower">
        <article className="card chart-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Niveaux de stock</p>
              <h3>Quantites actuelles</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantity" fill="var(--accent)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card quick-actions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Actions rapides</p>
              <h3>Raccourcis</h3>
            </div>
          </div>
          <div className="stack-list">
            <button className="primary-button" type="button">Ajouter un medicament</button>
            <button className="secondary-button" type="button">J ai pris mon medicament</button>
            <button className="secondary-button" type="button">Voir tout le stock</button>
          </div>
        </article>
      </div>

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Derniers mouvements</p>
            <h3>Historique recent</h3>
          </div>
        </div>
        <div className="stack-list">
          {movements.slice(0, 3).map((movement) => (
            <div key={movement.id} className="movement-row">
              <div>
                <strong>{movement.medicine}</strong>
                <p className="muted">{movement.profile}</p>
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

function InventoryPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [inventoryRows, setInventoryRows] = useState<InventoryItem[]>([])
  const [selectedId, setSelectedId] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  async function loadInventory() {
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
      const rows = await fetchJson<InventoryApiRow[]>(`/api/inventory${query ? `?${query}` : ''}`)
      const mapped = rows.map(mapInventory)

      setInventoryRows(mapped)
      setSelectedId((current) => {
        const hasCurrent = mapped.some((item) => item.id === current)
        return hasCurrent ? current : (mapped[0]?.id ?? 0)
      })
    } catch {
      setError('Impossible de charger l inventaire. Verifie que le backend tourne sur le port 4000.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInventory()
  }, [search, status])

  const selectedItem = inventoryRows.find((item) => item.id === selectedId) ?? inventoryRows[0]

  async function handleQuickAction(type: 'prise' | 'ajout') {
    if (!selectedItem) {
      return
    }

    const quantityInput = window.prompt(
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

      await loadInventory()
    } catch {
      setError(type === 'prise'
        ? 'Echec de la prise (stock insuffisant ou item introuvable).'
        : 'Echec de l ajout de stock.')
    } finally {
      setActionPending(false)
    }
  }

  return (
    <section className="page-grid inventory-layout">
      <article className="card inventory-list-card">
        <div className="section-heading inventory-toolbar">
          <div>
            <p className="eyebrow">Inventaire</p>
            <h3>Gestion du stock</h3>
          </div>
          <button className="primary-button" type="button">Ajouter un medicament</button>
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
          {inventoryRows.map((item) => {
            const statusLabel = getStatusLabel(getStatus(item))
            return (
              <button
                key={item.id}
                type="button"
                className={selectedItem?.id === item.id ? 'inventory-card inventory-card-active' : 'inventory-card'}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="inventory-card-head">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">{item.dosage} · {item.profile}</p>
                  </div>
                  <span className="pill">{statusLabel}</span>
                </div>
                <progress className="progress-meter" value={item.quantity} max={Math.max(item.threshold * 4, 1)} />
                <p className="muted">{item.quantity} {item.unit} · Exp. {item.expiryDate}</p>
              </button>
            )
          })}
        </div>
      </article>

      {selectedItem ? (
        <article className="card detail-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fiche detaillee</p>
              <h3>{selectedItem.name}</h3>
            </div>
            <span className="pill">{selectedItem.profile}</span>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Dosage</dt>
              <dd>{selectedItem.dosage}</dd>
            </div>
            <div>
              <dt>Forme</dt>
              <dd>{selectedItem.form}</dd>
            </div>
            <div>
              <dt>Peremption</dt>
              <dd>{selectedItem.expiryDate}</dd>
            </div>
            <div>
              <dt>Emplacement</dt>
              <dd>{selectedItem.location}</dd>
            </div>
            <div>
              <dt>Stock</dt>
              <dd>{selectedItem.quantity} {selectedItem.unit}</dd>
            </div>
            <div>
              <dt>Seuil critique</dt>
              <dd>{selectedItem.threshold}</dd>
            </div>
          </dl>

          <p className="detail-notes">{selectedItem.notes}</p>

          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => void handleQuickAction('prise')} disabled={actionPending}>
              Enregistrer une prise
            </button>
            <button className="secondary-button" type="button" onClick={() => void handleQuickAction('ajout')} disabled={actionPending}>
              Ajouter du stock
            </button>
          </div>
        </article>
      ) : null}
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
  const [profileRows, setProfileRows] = useState<Profile[]>(profiles)
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

  function mapProfile(row: ProfileApiRow): Profile {
    return {
      ...row,
      medicines: inventory.filter((item) => item.profile === row.name).length,
    }
  }

  async function loadProfiles() {
    setLoading(true)
    setError(null)

    try {
      const rows = await fetchJson<ProfileApiRow[]>('/api/profiles')
      setProfileRows(rows.map(mapProfile))
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
        const created = await fetchJson<ProfileApiRow>('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setProfileRows((current) => [mapProfile(created), ...current])
      } else {
        const updated = await fetchJson<ProfileApiRow>(`/api/profiles/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setProfileRows((current) => current.map((profile) => (
          profile.id === updated.id ? mapProfile(updated) : profile
        )))
      }

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
      setProfileRows((current) => current.filter((profile) => profile.id !== profileId))
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadHistory() {
      setLoading(true)

      try {
        const rows = await fetchJson<MovementApiRow[]>('/api/history')

        if (mounted) {
          setHistoryRows(rows.map(mapMovement))
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
            {profiles.map((profile) => (
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
                <p className="muted">{movement.profile} · {movement.type}</p>
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

function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      content: 'Bonjour. Je peux aider sur le stock, les alertes, les profils et les renouvellements. Je reste informatif et ne remplace pas un avis medical.',
    },
  ])
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()

  const suggestions = [
    'Verifier interactions',
    'Enregistrer une prise',
    'Stock faible',
    'Prochain renouvellement',
  ]

  function sendMessage(message: string) {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) {
      return
    }

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', content: trimmedMessage },
    ])
    setInput('')

    window.setTimeout(() => {
      startTransition(() => {
        setMessages((current) => [
          ...current,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: 'Reponse simulee pour le socle frontend. La vraie integration passera ensuite par le backend Node et l assistant local.',
          },
        ])
      })
    }, 700)
  }

  return (
    <section className="page-grid">
      <article className="card assistant-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assistant IA</p>
            <h3>Chat local</h3>
          </div>
        </div>

        <div className="suggestion-row">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="secondary-button" onClick={() => sendMessage(suggestion)}>
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
          {isPending ? <div className="chat-bubble chat-assistant">L assistant prepare une reponse...</div> : null}
        </div>

        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage(input)
          }}
        >
          <input
            className="search-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ecrire un message"
            aria-label="Ecrire un message"
          />
          <button className="primary-button" type="submit">Envoyer</button>
        </form>
      </article>
    </section>
  )
}

export default function App() {
  return <Layout />
}
