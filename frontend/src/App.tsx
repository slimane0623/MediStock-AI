import { useState, useTransition } from 'react'
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
  allergies: string
  notes: string
  medicines: number
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

type Movement = {
  id: number
  medicine: string
  profile: string
  type: 'prise' | 'ajout' | 'alerte'
  quantityDelta: number
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
  { id: 1, name: 'Danil', role: 'Gestionnaire principal', allergies: 'Aucune', notes: 'Profil principal', medicines: 12 },
  { id: 2, name: 'Slim', role: 'Patient chronique', allergies: 'Penicilline', notes: 'Suivi quotidien', medicines: 5 },
  { id: 3, name: 'Mamie Jeanne', role: 'Senior', allergies: 'Aucune', notes: 'Traitement long', medicines: 8 },
  { id: 4, name: 'Claire', role: 'Aidant familial', allergies: 'Aucune', notes: 'Peut assister les saisies', medicines: 0 },
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
  { to: '/', label: 'Dashboard', shortLabel: 'Home' },
  { to: '/inventaire', label: 'Inventaire', shortLabel: 'Stock' },
  { to: '/profils', label: 'Profils', shortLabel: 'Profils' },
  { to: '/historique', label: 'Historique', shortLabel: 'Logs' },
  { to: '/assistant', label: 'Assistant IA', shortLabel: 'IA' },
]

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

function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">MediStock AI</p>
          <h1>Pharmacie familiale intelligente</h1>
          <p className="muted">Frontend React de demarrage, aligne sur la maquette cible.</p>
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
          <span className="sidebar-card-label">Etat du socle</span>
          <strong>Frontend pret</strong>
          <p className="muted">Les pages principales sont en place avec des donnees mock pour commencer vite.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Prototype de travail</p>
            <h2>Danil et Slim</h2>
          </div>
          <div className="topbar-actions">
            <input className="search-input" placeholder="Recherche globale" aria-label="Recherche globale" />
            <div className="notification-pill">3 alertes</div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventaire" element={<InventoryPage />} />
          <Route path="/profils" element={<ProfilesPage />} />
          <Route path="/historique" element={<HistoryPage />} />
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
    { label: 'Medicaments', value: inventory.length },
    { label: 'Stock critique', value: inventory.filter((item) => getStatus(item) === 'critical').length },
    { label: 'Bientot perimes', value: inventory.filter((item) => getStatus(item) === 'expiring').length },
    { label: 'Ruptures', value: inventory.filter((item) => getStatus(item) === 'out').length },
  ]

  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="card stat-card">
            <span className="eyebrow">Vue globale</span>
            <strong>{stat.value}</strong>
            <p>{stat.label}</p>
          </article>
        ))}
      </div>

      <article className="card chart-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h3>Niveaux de stock</h3>
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

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Alertes</p>
            <h3>Alertes actives</h3>
          </div>
        </div>
        <div className="stack-list">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert-row alert-${alert.severity}`}>
              <strong>{alert.title}</strong>
              <span>{alert.description}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Suivi</p>
            <h3>Derniers mouvements</h3>
          </div>
        </div>
        <div className="stack-list">
          {movements.map((movement) => (
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

      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Famille</p>
            <h3>Profils</h3>
          </div>
        </div>
        <div className="stack-list">
          {profiles.map((profile) => (
            <div key={profile.id} className="profile-row">
              <div>
                <strong>{profile.name}</strong>
                <p className="muted">{profile.role}</p>
              </div>
              <span className="pill">{profile.medicines} med.</span>
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
  const [selectedId, setSelectedId] = useState(inventory[0]?.id ?? 0)

  const filteredItems = inventory.filter((item) => {
    const haystack = `${item.name} ${item.dosage} ${item.profile}`.toLowerCase()
    const matchesSearch = haystack.includes(search.toLowerCase())
    const matchesStatus = status === 'all' ? true : getStatus(item) === status
    return matchesSearch && matchesStatus
  })

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0]

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

        <div className="inventory-grid">
          {filteredItems.map((item) => {
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
            <button className="primary-button" type="button">Enregistrer une prise</button>
            <button className="secondary-button" type="button">Ajouter du stock</button>
          </div>
        </article>
      ) : null}
    </section>
  )
}

function ProfilesPage() {
  return (
    <section className="page-grid simple-grid">
      {profiles.map((profile) => (
        <article key={profile.id} className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Profil familial</p>
              <h3>{profile.name}</h3>
            </div>
            <span className="pill">{profile.role}</span>
          </div>
          <p><strong>Allergies:</strong> {profile.allergies}</p>
          <p><strong>Notes:</strong> {profile.notes}</p>
          <p><strong>Medicaments attribues:</strong> {profile.medicines}</p>
        </article>
      ))}
    </section>
  )
}

function HistoryPage() {
  const [type, setType] = useState('all')
  const [profileFilter, setProfileFilter] = useState('all')

  const filteredMovements = movements.filter((movement) => {
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
