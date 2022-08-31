import { dataSource } from '@graphprotocol/graph-ts'
import { PoolHedger, PoolHedgerExposureSnapshot } from '../../generated/schema'
import { PositionUpdated } from '../../generated/templates/PoolHedger/PoolHedger'
import { DAY_SECONDS, Entity, HOURLY_PERIODS, Snapshot } from '../lib'

export function handlePositionUpdated(event: PositionUpdated): void {
  let poolHedgerId = Entity.getIDFromAddress(event.address)
  let poolHedger = PoolHedger.load(poolHedgerId) as PoolHedger

  let timestamp = event.block.timestamp.toI32()
  let context = dataSource.context()
  let market = context.getString('market')

  let poolHedgerSnapshot: PoolHedgerExposureSnapshot

  for (let p = 0; p < HOURLY_PERIODS.length; p++) {
    poolHedgerSnapshot = Entity.loadOrCreatePoolHedgerSnapshot(event.address, market, HOURLY_PERIODS[p], timestamp)
    poolHedgerSnapshot.currentNetDelta = event.params.currentNetDelta
    poolHedgerSnapshot.save()
  }

  if (poolHedgerSnapshot.id != poolHedger.latestPoolHedgerExposure) {
    poolHedger.latestPoolHedgerExposure = poolHedgerSnapshot.id
    poolHedger.save()
  }
}
