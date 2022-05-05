import { dataSource } from '@graphprotocol/graph-ts'
import { PositionSettled } from '../../generated/templates/ShortCollateral/ShortCollateral'
import { handleTradeSettle } from '../market'

export function handlePositionSettled(event: PositionSettled): void {
  let context = dataSource.context()

  handleTradeSettle(
    context.getString('market'),
    event.block.number.toI32(),
    event.params.positionId.toI32(),
    event.transaction.hash,
    event.block.timestamp.toI32(),
    event.params.amount,
    event.params.priceAtExpiry,
  )
}
