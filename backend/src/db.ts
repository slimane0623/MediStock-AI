import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type InventoryStatus = 'ok' | 'critical' | 'expiring' | 'out'
export type MovementType = 'prise' | 'ajout' | 'alerte'

export type DashboardStats = {
  totalMedicines: number
  criticalCount: number
  expiringCount: number
  outOfStockCount: number
}

export type ProfileRow = {
  id: number
  name: string
  role: string
  birthDate: string
  allergies: string
  notes: string
}

export type ProfileMutationInput = {
  name: string
  role: string
  birthDate: string
  allergies: string
  notes: string
}

export type InventoryRow = {
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

export type InventoryMutationInput = {
  medicineName: string
  dosage: string
  form: string
  profileId: number | null
  quantity: number
  unit: string
  expiryDate: string
  criticalThreshold: number
  location: string
  notes: string
}

export type MovementRow = {
  id: number
  stockItemId: number
  profileId: number | null
  profileName: string | null
  medicineName: string
  type: MovementType
  quantityDelta: number
  note: string
  occurredAt: string
}

export type InventoryActionInput = {
  stockItemId: number
  type: 'prise' | 'ajout'
  quantity: number
  profileId?: number | null
  note?: string
}

export type InventoryActionResult =
  | { ok: true, item: InventoryRow, movement: MovementRow }
  | { ok: false, code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' }

export type MovementFilters = {
  type?: MovementType
  profileId?: number
}

export type AlertRow = {
  id: number
  severity: 'critical' | 'warning'
  title: string
  description: string
}

export type NotificationKind = 'stock_critical' | 'stock_out' | 'expiry_soon'

export type NotificationRow = {
  id: number
  stockItemId: number | null
  profileId: number | null
  profileName: string | null
  medicineName: string
  kind: NotificationKind
  severity: 'critical' | 'warning'
  title: string
  description: string
  isRead: boolean
  createdAt: string
  readAt: string | null
}

export type NotificationFilters = {
  status?: 'read' | 'unread'
}

const dataDir = path.join(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'medistock.db')

fs.mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    allergies TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    form TEXT NOT NULL,
    active_substance TEXT NOT NULL,
    indications TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS stock_items (
    id INTEGER PRIMARY KEY,
    medicine_id INTEGER NOT NULL,
    profile_id INTEGER,
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    critical_threshold INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (medicine_id) REFERENCES medicines (id),
    FOREIGN KEY (profile_id) REFERENCES profiles (id)
  );

  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY,
    stock_item_id INTEGER NOT NULL,
    profile_id INTEGER,
    type TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (stock_item_id) REFERENCES stock_items (id),
    FOREIGN KEY (profile_id) REFERENCES profiles (id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    stock_item_id INTEGER,
    profile_id INTEGER,
    medicine_name TEXT NOT NULL,
    profile_name TEXT,
    kind TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    read_at TEXT,
    FOREIGN KEY (stock_item_id) REFERENCES stock_items (id),
    FOREIGN KEY (profile_id) REFERENCES profiles (id)
  );
`)

// Lightweight migration for existing databases created before soft-delete support.
const stockItemsColumns = db.prepare(`PRAGMA table_info(stock_items)`).all() as Array<{ name: string }>
const hasIsDeletedColumn = stockItemsColumns.some((column) => column.name === 'is_deleted')

if (!hasIsDeletedColumn) {
  db.exec(`ALTER TABLE stock_items ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`)
}

const seeded = db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as { count: number }

if (seeded.count === 0) {
  db.exec(`
    INSERT INTO profiles (id, name, role, birth_date, allergies, notes) VALUES
      (1, 'Danil', 'Gestionnaire principal', '1999-05-10', 'Aucune', 'Profil principal du foyer'),
      (2, 'Slim', 'Patient chronique', '2000-02-14', 'Penicilline', 'Suivi regulier de traitement'),
      (3, 'Mamie Jeanne', 'Senior', '1948-09-01', 'Aucune', 'Traitement quotidien'),
      (4, 'Claire', 'Aidant familial', '1988-06-22', 'Aucune', 'Peut enregistrer des mouvements');

    INSERT INTO medicines (id, name, dosage, form, active_substance, indications) VALUES
      (1, 'Doliprane', '1000 mg', 'Comprime', 'Paracetamol', 'Douleur, fievre'),
      (2, 'Metformine', '500 mg', 'Comprime', 'Metformine', 'Diabete'),
      (3, 'Levothyrox', '75 ug', 'Comprime', 'Levothyroxine', 'Thyroide'),
      (4, 'Amoxicilline', '500 mg', 'Gelule', 'Amoxicilline', 'Infection');

    INSERT INTO stock_items (id, medicine_id, profile_id, quantity, unit, expiry_date, critical_threshold, location, notes) VALUES
      (1, 1, 1, 16, 'comprimes', '2026-06-14', 4, 'Armoire cuisine', 'Boite entamee'),
      (2, 2, 2, 8, 'comprimes', '2026-03-29', 5, 'Tiroir salon', 'Surveiller le renouvellement'),
      (3, 3, 3, 0, 'comprimes', '2026-04-06', 2, 'Boite senior', 'Rupture en attente'),
      (4, 4, 1, 10, 'gelules', '2026-03-20', 3, 'Salle de bain', 'Traitement en cours');

    INSERT INTO movements (id, stock_item_id, profile_id, type, quantity_delta, note, occurred_at) VALUES
      (1, 1, 1, 'prise', -2, 'Prise du soir', '2026-03-10T20:30:00Z'),
      (2, 2, 2, 'prise', -1, 'Prise apres repas', '2026-03-10T12:00:00Z'),
      (3, 1, 1, 'ajout', 16, 'Ajout nouvelle boite', '2026-03-09T18:15:00Z'),
      (4, 3, 3, 'alerte', 0, 'Stock en rupture', '2026-03-09T08:00:00Z');
  `)
}

function daysUntil(dateValue: string) {
  const now = new Date()
  const target = new Date(dateValue)
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getInventoryStatus(item: Pick<InventoryRow, 'quantity' | 'criticalThreshold' | 'expiryDate'>): InventoryStatus {
  if (item.quantity <= 0) {
    return 'out'
  }

  if (daysUntil(item.expiryDate) <= 30) {
    return 'expiring'
  }

  if (item.quantity <= item.criticalThreshold) {
    return 'critical'
  }

  return 'ok'
}

function getAlertDescriptor(item: InventoryRow): { kind: NotificationKind, alert: AlertRow } | null {
  const status = getInventoryStatus(item)

  if (status === 'critical') {
    return {
      kind: 'stock_critical',
      alert: {
        id: item.id,
        severity: 'warning',
        title: `${item.medicineName} bientot critique`,
        description: `${item.quantity} ${item.unit} restants pour ${item.profileName ?? 'le foyer'}`,
      },
    }
  }

  if (status === 'expiring') {
    return {
      kind: 'expiry_soon',
      alert: {
        id: item.id,
        severity: 'warning',
        title: `${item.medicineName} proche peremption`,
        description: `Date de peremption: ${item.expiryDate}`,
      },
    }
  }

  if (status === 'out') {
    return {
      kind: 'stock_out',
      alert: {
        id: item.id,
        severity: 'critical',
        title: `${item.medicineName} en rupture`,
        description: `Aucun stock disponible pour ${item.profileName ?? 'le foyer'}`,
      },
    }
  }

  return null
}

function createNotificationForInventoryItem(item: InventoryRow, previousStatus?: InventoryStatus) {
  const nextStatus = getInventoryStatus(item)

  if (nextStatus === 'ok' || nextStatus === previousStatus) {
    return
  }

  const descriptor = getAlertDescriptor(item)

  if (!descriptor) {
    return
  }

  db.prepare(`
    INSERT INTO notifications (
      stock_item_id,
      profile_id,
      medicine_name,
      profile_name,
      kind,
      severity,
      title,
      description,
      is_read,
      created_at,
      read_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)
  `).run(
    item.id,
    item.profileId,
    item.medicineName,
    item.profileName,
    descriptor.kind,
    descriptor.alert.severity,
    descriptor.alert.title,
    descriptor.alert.description,
    new Date().toISOString(),
  )
}

export function listProfiles() {
  return db.prepare(`
    SELECT
      id,
      name,
      role,
      birth_date AS birthDate,
      allergies,
      notes
    FROM profiles
    ORDER BY id ASC
  `).all() as ProfileRow[]
}

export function getProfileById(id: number) {
  return db.prepare(`
    SELECT
      id,
      name,
      role,
      birth_date AS birthDate,
      allergies,
      notes
    FROM profiles
    WHERE id = ?
  `).get(id) as ProfileRow | undefined
}

export function createProfile(input: ProfileMutationInput) {
  const result = db.prepare(`
    INSERT INTO profiles (name, role, birth_date, allergies, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.role,
    input.birthDate,
    input.allergies,
    input.notes,
  )

  return getProfileById(Number(result.lastInsertRowid))
}

export function updateProfile(id: number, input: ProfileMutationInput) {
  const result = db.prepare(`
    UPDATE profiles
    SET
      name = ?,
      role = ?,
      birth_date = ?,
      allergies = ?,
      notes = ?
    WHERE id = ?
  `).run(
    input.name,
    input.role,
    input.birthDate,
    input.allergies,
    input.notes,
    id,
  )

  if (result.changes === 0) {
    return null
  }

  return getProfileById(id) ?? null
}

export function deleteProfile(id: number) {
  db.prepare('UPDATE movements SET profile_id = NULL WHERE profile_id = ?').run(id)
  db.prepare('UPDATE stock_items SET profile_id = NULL WHERE profile_id = ?').run(id)
  const result = db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  return result.changes > 0
}

export function listInventory(search = '', status?: InventoryStatus) {
  const inventory = db.prepare(`
    SELECT
      stock_items.id,
      stock_items.medicine_id AS medicineId,
      medicines.name AS medicineName,
      medicines.dosage AS dosage,
      medicines.form AS form,
      stock_items.profile_id AS profileId,
      profiles.name AS profileName,
      stock_items.quantity,
      stock_items.unit,
      stock_items.expiry_date AS expiryDate,
      stock_items.critical_threshold AS criticalThreshold,
      stock_items.location,
      stock_items.notes
    FROM stock_items
    JOIN medicines ON medicines.id = stock_items.medicine_id
    LEFT JOIN profiles ON profiles.id = stock_items.profile_id
    WHERE stock_items.is_deleted = 0
    ORDER BY medicines.name ASC
  `).all() as InventoryRow[]

  return inventory.filter((item) => {
    const matchesSearch = `${item.medicineName} ${item.dosage} ${item.profileName ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())

    if (!matchesSearch) {
      return false
    }

    if (!status) {
      return true
    }

    return getInventoryStatus(item) === status
  })
}

function getInventoryItemById(stockItemId: number) {
  return db.prepare(`
    SELECT
      stock_items.id,
      stock_items.medicine_id AS medicineId,
      medicines.name AS medicineName,
      medicines.dosage AS dosage,
      medicines.form AS form,
      stock_items.profile_id AS profileId,
      profiles.name AS profileName,
      stock_items.quantity,
      stock_items.unit,
      stock_items.expiry_date AS expiryDate,
      stock_items.critical_threshold AS criticalThreshold,
      stock_items.location,
      stock_items.notes
    FROM stock_items
    JOIN medicines ON medicines.id = stock_items.medicine_id
    LEFT JOIN profiles ON profiles.id = stock_items.profile_id
    WHERE stock_items.id = ? AND stock_items.is_deleted = 0
  `).get(stockItemId) as InventoryRow | undefined
}

export const getInventoryById = getInventoryItemById

function getMovementById(movementId: number) {
  return db.prepare(`
    SELECT
      movements.id,
      movements.stock_item_id AS stockItemId,
      movements.profile_id AS profileId,
      profiles.name AS profileName,
      medicines.name AS medicineName,
      movements.type,
      movements.quantity_delta AS quantityDelta,
      movements.note,
      movements.occurred_at AS occurredAt
    FROM movements
    JOIN stock_items ON stock_items.id = movements.stock_item_id
    JOIN medicines ON medicines.id = stock_items.medicine_id
    LEFT JOIN profiles ON profiles.id = movements.profile_id
    WHERE movements.id = ?
  `).get(movementId) as MovementRow | undefined
}

export function applyInventoryAction(input: InventoryActionInput): InventoryActionResult {
  const stockItem = db.prepare(`
    SELECT
      id,
      quantity,
      profile_id AS profileId
    FROM stock_items
    WHERE id = ? AND is_deleted = 0
  `).get(input.stockItemId) as { id: number, quantity: number, profileId: number | null } | undefined

  if (!stockItem) {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const quantityDelta = input.type === 'prise' ? -input.quantity : input.quantity
  const nextQuantity = stockItem.quantity + quantityDelta

  if (nextQuantity < 0) {
    return { ok: false, code: 'INSUFFICIENT_STOCK' }
  }

  const resolvedProfileId = input.profileId === undefined ? stockItem.profileId : input.profileId
  const movementNote = input.note?.trim() || (input.type === 'prise' ? 'Prise enregistree depuis UI' : 'Ajout de stock depuis UI')
  const occurredAt = new Date().toISOString()

  db.exec('BEGIN')

  try {
    db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(nextQuantity, input.stockItemId)

    const movementResult = db.prepare(`
      INSERT INTO movements (stock_item_id, profile_id, type, quantity_delta, note, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.stockItemId,
      resolvedProfileId,
      input.type,
      quantityDelta,
      movementNote,
      occurredAt,
    )

    db.exec('COMMIT')

    const item = getInventoryItemById(input.stockItemId)
    const movement = getMovementById(Number(movementResult.lastInsertRowid))

    if (!item || !movement) {
      return { ok: false, code: 'NOT_FOUND' }
    }

    createNotificationForInventoryItem(item)

    return { ok: true, item, movement }
  } catch {
    db.exec('ROLLBACK')
    throw new Error('Failed to apply inventory action')
  }
}

export function createInventory(input: InventoryMutationInput) {
  const medicineResult = db.prepare(`
    INSERT INTO medicines (name, dosage, form, active_substance, indications)
    VALUES (?, ?, ?, '', '')
  `).run(input.medicineName, input.dosage, input.form)

  const medicineId = Number(medicineResult.lastInsertRowid)

  const stockResult = db.prepare(`
    INSERT INTO stock_items (
      medicine_id,
      profile_id,
      quantity,
      unit,
      expiry_date,
      critical_threshold,
      location,
      notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    medicineId,
    input.profileId,
    input.quantity,
    input.unit,
    input.expiryDate,
    input.criticalThreshold,
    input.location,
    input.notes,
  )

  const created = getInventoryById(Number(stockResult.lastInsertRowid)) ?? null

  if (created) {
    createNotificationForInventoryItem(created)
  }

  return created
}

export function updateInventory(id: number, input: InventoryMutationInput) {
  const previousItem = getInventoryById(id)
  const previousStatus = previousItem ? getInventoryStatus(previousItem) : undefined
  const existing = db.prepare(`
    SELECT medicine_id AS medicineId
    FROM stock_items
    WHERE id = ? AND is_deleted = 0
  `).get(id) as { medicineId: number } | undefined

  if (!existing) {
    return null
  }

  db.prepare(`
    UPDATE medicines
    SET name = ?, dosage = ?, form = ?
    WHERE id = ?
  `).run(input.medicineName, input.dosage, input.form, existing.medicineId)

  db.prepare(`
    UPDATE stock_items
    SET
      profile_id = ?,
      quantity = ?,
      unit = ?,
      expiry_date = ?,
      critical_threshold = ?,
      location = ?,
      notes = ?
    WHERE id = ?
  `).run(
    input.profileId,
    input.quantity,
    input.unit,
    input.expiryDate,
    input.criticalThreshold,
    input.location,
    input.notes,
    id,
  )

  const updated = getInventoryById(id) ?? null

  if (updated) {
    createNotificationForInventoryItem(updated, previousStatus)
  }

  return updated
}

export function deleteInventory(id: number) {
  const existing = db.prepare(`
    SELECT medicine_id AS medicineId
    FROM stock_items
    WHERE id = ? AND is_deleted = 0
  `).get(id) as { medicineId: number } | undefined

  if (!existing) {
    return false
  }

  const result = db.prepare(`
    UPDATE stock_items
    SET is_deleted = 1
    WHERE id = ? AND is_deleted = 0
  `).run(id)

  return result.changes > 0
}

export function listMovements(filters: MovementFilters = {}) {
  const conditions: string[] = []
  const params: Array<number | string> = []

  if (filters.type) {
    conditions.push('movements.type = ?')
    params.push(filters.type)
  }

  if (typeof filters.profileId === 'number') {
    conditions.push('movements.profile_id = ?')
    params.push(filters.profileId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT
      movements.id,
      movements.stock_item_id AS stockItemId,
      movements.profile_id AS profileId,
      profiles.name AS profileName,
      COALESCE(medicines.name, 'Medicament supprime') AS medicineName,
      movements.type,
      movements.quantity_delta AS quantityDelta,
      movements.note,
      movements.occurred_at AS occurredAt
    FROM movements
    LEFT JOIN stock_items ON stock_items.id = movements.stock_item_id
    LEFT JOIN medicines ON medicines.id = stock_items.medicine_id
    LEFT JOIN profiles ON profiles.id = movements.profile_id
    ${whereClause}
    ORDER BY movements.occurred_at DESC
  `).all(...params) as MovementRow[]
}

function getNotificationById(notificationId: number) {
  const row = db.prepare(`
    SELECT
      id,
      stock_item_id AS stockItemId,
      profile_id AS profileId,
      profile_name AS profileName,
      medicine_name AS medicineName,
      kind,
      severity,
      title,
      description,
      is_read AS isRead,
      created_at AS createdAt,
      read_at AS readAt
    FROM notifications
    WHERE id = ?
  `).get(notificationId) as (Omit<NotificationRow, 'isRead'> & { isRead: number }) | undefined

  if (!row) {
    return null
  }

  return {
    ...row,
    isRead: row.isRead === 1,
  }
}

export function listNotifications(filters: NotificationFilters = {}) {
  const conditions: string[] = []
  const params: Array<number | string> = []

  if (filters.status === 'read') {
    conditions.push('is_read = 1')
  }

  if (filters.status === 'unread') {
    conditions.push('is_read = 0')
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT
      id,
      stock_item_id AS stockItemId,
      profile_id AS profileId,
      profile_name AS profileName,
      medicine_name AS medicineName,
      kind,
      severity,
      title,
      description,
      is_read AS isRead,
      created_at AS createdAt,
      read_at AS readAt
    FROM notifications
    ${whereClause}
    ORDER BY is_read ASC, created_at DESC
  `).all(...params) as Array<Omit<NotificationRow, 'isRead'> & { isRead: number }>

  return rows.map((row) => ({
    ...row,
    isRead: row.isRead === 1,
  }))
}

export function markNotificationAsRead(id: number) {
  const readAt = new Date().toISOString()
  const result = db.prepare(`
    UPDATE notifications
    SET is_read = 1, read_at = COALESCE(read_at, ?)
    WHERE id = ?
  `).run(readAt, id)

  if (result.changes === 0) {
    return null
  }

  return getNotificationById(id)
}

export function markAllNotificationsAsRead() {
  const readAt = new Date().toISOString()
  const result = db.prepare(`
    UPDATE notifications
    SET is_read = 1, read_at = COALESCE(read_at, ?)
    WHERE is_read = 0
  `).run(readAt)

  return { updatedCount: result.changes }
}

export function listAlerts() {
  const inventory = listInventory()

  const alerts = inventory.flatMap<AlertRow>((item) => {
    const descriptor = getAlertDescriptor(item)

    if (descriptor) {
      return [descriptor.alert]
    }

    return []
  })

  return alerts.sort((left, right) => {
    if (left.severity === right.severity) {
      return left.title.localeCompare(right.title)
    }

    return left.severity === 'critical' ? -1 : 1
  })
}

export function getDashboard() {
  const inventory = listInventory()
  const allMovements = listMovements()
  const movements = allMovements.slice(0, 10)

  const stats: DashboardStats = {
    totalMedicines: inventory.length,
    criticalCount: inventory.filter((item) => getInventoryStatus(item) === 'critical').length,
    expiringCount: inventory.filter((item) => getInventoryStatus(item) === 'expiring').length,
    outOfStockCount: inventory.filter((item) => getInventoryStatus(item) === 'out').length,
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const monthlyMovements = allMovements.filter((m) => m.occurredAt >= monthStart)
  const movementsByType = {
    prise: monthlyMovements.filter((m) => m.type === 'prise').length,
    ajout: monthlyMovements.filter((m) => m.type === 'ajout').length,
    alerte: monthlyMovements.filter((m) => m.type === 'alerte').length,
  }

  return {
    stats,
    alerts: listAlerts(),
    movements,
    movementsByType,
    totalMovementsThisMonth: monthlyMovements.length,
  }
}

function backfillNotificationsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM notifications').get() as { count: number }

  if (count.count > 0) {
    return
  }

  for (const item of listInventory()) {
    createNotificationForInventoryItem(item)
  }
}

backfillNotificationsIfEmpty()
