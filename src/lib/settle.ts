import type { Transaction, BucketWithMembers, Person, PersonBalance, Settlement } from './types'

export function calcBalances(
  transactions: Transaction[],
  buckets: BucketWithMembers[],
  people: Person[]
): PersonBalance[] {
  const defaultBucket = buckets.find(b => b.isDefault)

  // paid[personId] = total cents paid by this person
  const paid = new Map<string, number>()
  // owed[personId] = total cents this person owes
  const owed = new Map<string, number>()

  for (const person of people) {
    paid.set(person.id, 0)
    owed.set(person.id, 0)
  }

  for (const tx of transactions) {
    // Find the bucket this transaction belongs to
    const txBucket = tx.bucketId
      ? buckets.find(b => b.id === tx.bucketId)
      : defaultBucket

    if (!txBucket || txBucket.memberIds.length === 0) continue

    // Credit payer
    if (tx.payerId) {
      paid.set(tx.payerId, (paid.get(tx.payerId) ?? 0) + tx.amount_cents)
    }

    // Split amount among bucket members (integer division; first member absorbs remainder)
    const memberCount = txBucket.memberIds.length
    const share = Math.floor(tx.amount_cents / memberCount)
    const remainder = tx.amount_cents - share * memberCount

    txBucket.memberIds.forEach((memberId, index) => {
      const memberShare = index === 0 ? share + remainder : share
      owed.set(memberId, (owed.get(memberId) ?? 0) + memberShare)
    })
  }

  return people.map(person => {
    const paidCents = paid.get(person.id) ?? 0
    const owedCents = owed.get(person.id) ?? 0
    return {
      personId: person.id,
      personName: person.name,
      personColor: person.color,
      paidCents,
      owedCents,
      netCents: paidCents - owedCents,
    }
  })
}

export function minimizeTransfers(
  balances: PersonBalance[],
  peopleMap: Map<string, Person>
): Settlement[] {
  // Filter out zeroed balances; work with mutable copies
  const creditors = balances
    .filter(b => b.netCents > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.netCents - a.netCents)

  const debtors = balances
    .filter(b => b.netCents < 0)
    .map(b => ({ ...b }))
    .sort((a, b) => a.netCents - b.netCents) // most negative first

  const settlements: Settlement[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const amount = Math.min(creditor.netCents, -debtor.netCents)

    const recipient = peopleMap.get(creditor.personId)
    settlements.push({
      fromId: debtor.personId,
      fromName: debtor.personName,
      toId: creditor.personId,
      toName: creditor.personName,
      toPixKey: recipient?.pixKey ?? null,
      amountCents: amount,
    })

    creditor.netCents -= amount
    debtor.netCents += amount

    if (creditor.netCents === 0) ci++
    if (debtor.netCents === 0) di++
  }

  return settlements
}
