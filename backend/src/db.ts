import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type InventoryStatus = 'ok' | 'critical' | 'expiring' | 'out'

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

export type MovementRow = {
  id: number
  stockItemId: number
  profileId: number | null
  profileName: string | null
  medicineName: string
  type: string
  quantityDelta: number
  note: string
  occurredAt: string
}

export type AlertRow = {
  id: number
  severity: 'critical' | 'warning'
  title: string
  description: string
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
`)

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

export function listMovements() {
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
    ORDER BY movements.occurred_at DESC
  `).all() as MovementRow[]
}

export function getDashboard() {
  const inventory = listInventory()
  const movements = listMovements().slice(0, 5)

  const stats: DashboardStats = {
    totalMedicines: inventory.length,
    criticalCount: inventory.filter((item) => getInventoryStatus(item) === 'critical').length,
    expiringCount: inventory.filter((item) => getInventoryStatus(item) === 'expiring').length,
    outOfStockCount: inventory.filter((item) => getInventoryStatus(item) === 'out').length,
  }

  const alerts = inventory.flatMap<AlertRow>((item) => {
    const status = getInventoryStatus(item)

    if (status === 'critical') {
      return [{
        id: item.id,
        severity: 'warning',
        title: `${item.medicineName} bientot critique`,
        description: `${item.quantity} ${item.unit} restants pour ${item.profileName ?? 'le foyer'}`,
      }]
    }

    if (status === 'expiring') {
      return [{
        id: item.id,
        severity: 'warning',
        title: `${item.medicineName} proche peremption`,
        description: `Date de peremption: ${item.expiryDate}`,
      }]
    }

    if (status === 'out') {
      return [{
        id: item.id,
        severity: 'critical',
        title: `${item.medicineName} en rupture`,
        description: `Aucun stock disponible pour ${item.profileName ?? 'le foyer'}`,
      }]
    }

    return []
  })

  return {
    stats,
    alerts,
    movements,
  }
}
