import { describe, it, expect } from 'vitest'
import { calcBalances, minimizeTransfers } from './settle'
import type { Transaction, BucketWithMembers, Person, PersonBalance } from './types'

// Helpers
const p = (id: string, name: string): Person => ({ id, name, color: '#000' })
const tx = (id: string, payerId: string, cents: number, bucketId: string | null = null): Transaction => ({
  id, date: '01/01/2025', description: 'test', amount_cents: cents,
  payerId, source: 'manual', raw: null, bucketId,
})
const bucket = (id: string, memberIds: string[], txs: Transaction[]): BucketWithMembers => ({
  id, tripId: 'trip1', name: id, isDefault: id === 'todos',
  memberIds,
  transactionCount: txs.filter(t => t.bucketId === id || (id === 'todos' && t.bucketId === null)).length,
  totalCents: txs.filter(t => t.bucketId === id || (id === 'todos' && t.bucketId === null))
    .reduce((s, t) => s + t.amount_cents, 0),
})

describe('calcBalances', () => {
  it('2 people, 1 tx — payer credited, both debited their share', () => {
    const people = [p('a', 'Ana'), p('b', 'Bob')]
    const txs = [tx('t1', 'a', 1000)] // R$10,00, paid by Ana
    const buckets = [bucket('todos', ['a', 'b'], txs)]

    const balances = calcBalances(txs, buckets, people)
    const ana = balances.find(b => b.personId === 'a')!
    const bob = balances.find(b => b.personId === 'b')!

    expect(ana.paidCents).toBe(1000)
    expect(ana.owedCents).toBe(500)
    expect(ana.netCents).toBe(500)   // creditor

    expect(bob.paidCents).toBe(0)
    expect(bob.owedCents).toBe(500)
    expect(bob.netCents).toBe(-500)  // debtor
  })

  it('odd amount — first member absorbs extra cent', () => {
    const people = [p('a', 'Ana'), p('b', 'Bob'), p('c', 'Cia')]
    const txs = [tx('t1', 'a', 100)] // R$1,00 split 3 ways = 33/33/34
    const buckets = [bucket('todos', ['a', 'b', 'c'], txs)]

    const balances = calcBalances(txs, buckets, people)
    const totalOwed = balances.reduce((s, b) => s + b.owedCents, 0)
    expect(totalOwed).toBe(100) // no cents lost
  })

  it('transaction with null payer — still split but nobody gets credit', () => {
    const people = [p('a', 'Ana'), p('b', 'Bob')]
    const txs = [tx('t1', null as unknown as string, 1000)]
    const buckets = [bucket('todos', ['a', 'b'], txs)]

    const balances = calcBalances(txs, buckets, people)
    const totalOwed = balances.reduce((s, b) => s + b.owedCents, 0)
    expect(totalOwed).toBe(1000)
    // Nobody paid, so net for both is negative
    expect(balances.every(b => b.paidCents === 0)).toBe(true)
  })

  it('custom bucket — only members owe', () => {
    const people = [p('a', 'Ana'), p('b', 'Bob'), p('c', 'Cia')]
    // Hotel paid by Ana, only Ana+Bob stayed
    const txs = [tx('t1', 'a', 2000, 'hotel')]
    const todoBucket = bucket('todos', ['a', 'b', 'c'], txs)
    const hotelBucket: BucketWithMembers = {
      id: 'hotel', tripId: 'trip1', name: 'Hotel', isDefault: false,
      memberIds: ['a', 'b'], transactionCount: 1, totalCents: 2000,
    }

    const balances = calcBalances(txs, [todoBucket, hotelBucket], people)
    const cia = balances.find(b => b.personId === 'c')!
    expect(cia.owedCents).toBe(0) // Cia didn't stay at the hotel
    expect(cia.netCents).toBe(0)
  })
})

describe('minimizeTransfers', () => {
  it('2 people — 1 transfer', () => {
    const balances: PersonBalance[] = [
      { personId: 'a', personName: 'Ana', personColor: '#f00', paidCents: 1000, owedCents: 500, netCents: 500 },
      { personId: 'b', personName: 'Bob', personColor: '#00f', paidCents: 0, owedCents: 500, netCents: -500 },
    ]
    const peopleMap = new Map([
      ['a', { id: 'a', name: 'Ana', color: '#f00', pixKey: 'ana@pix' }],
      ['b', { id: 'b', name: 'Bob', color: '#00f' }],
    ])

    const transfers = minimizeTransfers(balances, peopleMap)
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ fromId: 'b', toId: 'a', amountCents: 500, toPixKey: 'ana@pix' })
  })

  it('3 people — minimizes to 2 transfers', () => {
    const balances: PersonBalance[] = [
      { personId: 'a', personName: 'Ana', personColor: '#f00', paidCents: 600, owedCents: 300, netCents: 300 },
      { personId: 'b', personName: 'Bob', personColor: '#0f0', paidCents: 600, owedCents: 300, netCents: 300 },
      { personId: 'c', personName: 'Cia', personColor: '#00f', paidCents: 0, owedCents: 600, netCents: -600 },
    ]
    const peopleMap = new Map([
      ['a', { id: 'a', name: 'Ana', color: '#f00' }],
      ['b', { id: 'b', name: 'Bob', color: '#0f0' }],
      ['c', { id: 'c', name: 'Cia', color: '#00f' }],
    ])

    const transfers = minimizeTransfers(balances, peopleMap)
    expect(transfers).toHaveLength(2)
    const total = transfers.reduce((s, t) => s + t.amountCents, 0)
    expect(total).toBe(600)
  })

  it('already balanced — no transfers', () => {
    const balances: PersonBalance[] = [
      { personId: 'a', personName: 'Ana', personColor: '#f00', paidCents: 500, owedCents: 500, netCents: 0 },
    ]
    const transfers = minimizeTransfers(balances, new Map())
    expect(transfers).toHaveLength(0)
  })
})
