import { PoolHedger, PoolHedgerExposureSnapshot } from '../../generated/schema'
import { PositionUpdated } from '../../generated/templates/PoolHedger/PoolHedger'
import { DAY_SECONDS, Entity, HOURLY_PERIODS, Snapshot } from '../lib'

export function handlePositionUpdated(event: PositionUpdated): void {
  let poolHedgerId = Entity.getIDFromAddress(event.address)
  let poolHedger = PoolHedger.load(poolHedgerId) as PoolHedger

  let timestamp = event.block.timestamp.toI32()

  //Get the largest relevant period
  let base_period = HOURLY_PERIODS[0]
  let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
  for (let p = 1; p < HOURLY_PERIODS.length; p++) {
    if (Snapshot.roundTimestamp(timestamp, HOURLY_PERIODS[p]) == period_timestamp) {
      base_period = HOURLY_PERIODS[p]
    }
  }

  //Force create daily snapshot if it doesnt exist
  if (
    base_period == 3600 &&
    PoolHedgerExposureSnapshot.load(
      Snapshot.getSnapshotID(Entity.getIDFromAddress(event.address), DAY_SECONDS, timestamp),
    ) == null
  ) {
    let poolHedgerSnapshot = Entity.loadOrCreatePoolHedgerSnapshot(event.address, DAY_SECONDS, timestamp)
    poolHedgerSnapshot.currentNetDelta = event.params.currentNetDelta
    poolHedgerSnapshot.save()
  }

  let poolHedgerSnapshot = Entity.loadOrCreatePoolHedgerSnapshot(event.address, base_period, timestamp)
  poolHedgerSnapshot.currentNetDelta = event.params.currentNetDelta
  poolHedgerSnapshot.save()

  if (poolHedgerSnapshot.id != poolHedger.latestPoolHedgerExposure) {
    poolHedger.latestPoolHedgerExposure = poolHedgerSnapshot.id
    poolHedger.save()
  }
}
