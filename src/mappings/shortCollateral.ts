import { dataSource } from '@graphprotocol/graph-ts'
import { Market, Pool } from '../../generated/schema'
import { BaseSent, PositionSettled } from '../../generated/templates/ShortCollateral/ShortCollateral'
import { Entity } from '../lib'
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
    event.params.settlementAmount,
    event.params.insolventAmount

  )
}

export function handleBaseSent(event: BaseSent): void {
  let context = dataSource.context()
  let optionMarketId = context.getString('market')

  let market = Market.load(optionMarketId) as Market

  let destination = Entity.getIDFromAddress(event.params.receiver)

  if(destination == market.liquidityPool){
    let liquidityPool = Pool.load(market.liquidityPool) as Pool
    liquidityPool.baseBalance = liquidityPool.baseBalance.plus(event.params.amount)
    liquidityPool.save()
  }
}